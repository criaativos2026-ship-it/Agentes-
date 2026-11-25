import "server-only";
import { and, eq, inArray, lt, ne, sql } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { withPlatform } from "@/server/db/client";
import { organizations, payments, plans, platformSettings, subscriptions } from "@/server/db/schema";
import { audit } from "@/server/audit/log";
import { UserFacingError } from "@/server/errors";
import { todayISO } from "@/lib/format";

export const addMonthsISO = (iso: string, months: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

export const addDaysISO = (iso: string, days: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 864e5).toISOString().slice(0, 10);

export type BillingSettings = { graceDays: number; suspendAfterDays: number; invoiceDaysBefore: number; liveGateways: boolean };
export const DEFAULT_BILLING: BillingSettings = { graceDays: 5, suspendAfterDays: 30, invoiceDaysBefore: 7, liveGateways: false };

export async function billingSettings(tx: Tx): Promise<BillingSettings> {
  const [row] = await tx.select().from(platformSettings).where(eq(platformSettings.key, "billing"));
  return { ...DEFAULT_BILLING, ...((row?.value as Partial<BillingSettings>) ?? {}) };
}

/** Cria a assinatura (encerra a anterior) e a primeira cobrança. Escopo: plataforma. */
export async function createSubscription(
  tx: Tx,
  actorUserId: string,
  input: { organizationId: string; planId: string; status: "trialing" | "active"; startDate: string; customPriceCents?: number; customLimits?: Record<string, number | null>; notes?: string; firstDueDate?: string },
) {
  const [plan] = await tx.select().from(plans).where(eq(plans.id, input.planId));
  if (!plan || !plan.isActive) throw new UserFacingError("Plano inválido ou inativo.");
  if (plan.validUntil && plan.validUntil < input.startDate) throw new UserFacingError("Plano fora da validade.");
  await tx.update(subscriptions).set({ status: "canceled", canceledAt: new Date() }).where(and(eq(subscriptions.organizationId, input.organizationId), ne(subscriptions.status, "canceled")));
  const end = addMonthsISO(input.startDate, plan.intervalMonths);
  const [sub] = await tx
    .insert(subscriptions)
    .values({
      organizationId: input.organizationId,
      planId: plan.id,
      status: input.status,
      currentPeriodStart: input.startDate,
      currentPeriodEnd: end,
      customPriceCents: input.customPriceCents ?? null,
      customLimits: input.customLimits ?? null,
      notes: input.notes,
      createdBy: actorUserId,
    })
    .returning();
  const amount = input.customPriceCents ?? plan.priceCents;
  if (amount > 0 && input.status === "active") {
    await tx.insert(payments).values({ organizationId: input.organizationId, subscriptionId: sub.id, amountCents: amount, currency: plan.currency, method: "manual_pix", description: `${plan.name} — ${input.startDate} a ${end}`, dueDate: input.firstDueDate ?? input.startDate, createdBy: actorUserId });
  }
  if (input.status === "active") await tx.update(organizations).set({ status: "active" }).where(and(eq(organizations.id, input.organizationId), inArray(organizations.status, ["trial", "suspended"])));
  await audit(tx, { organizationId: input.organizationId, actorUserId, action: "billing.subscription_created", summary: `Assinatura do plano "${plan.name}" (${input.status === "active" ? "ativa" : "avaliação"})`, entityType: "subscription", entityId: sub.id });
  return sub;
}

/** Baixa de pagamento: registra, reativa a assinatura se estava inadimplente e avança o período quando é a fatura do próximo ciclo. */
export async function markPaymentPaid(tx: Tx, actorUserId: string | null, paymentId: string, info: { method?: "manual_pix" | "manual_boleto" | "manual_transfer" | "stripe" | "mercadopago"; gatewayRef?: string; paidAt?: Date }) {
  const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId));
  if (!p) throw new UserFacingError("Pagamento não encontrado.");
  if (p.status === "paid") return p;
  if (p.status === "canceled" || p.status === "refunded") throw new UserFacingError("Este pagamento foi cancelado/estornado.");
  const [updated] = await tx
    .update(payments)
    .set({ status: "paid", paidAt: info.paidAt ?? new Date(), method: info.method ?? p.method, gatewayRef: info.gatewayRef ?? p.gatewayRef })
    .where(eq(payments.id, paymentId))
    .returning();
  if (p.subscriptionId) {
    const stillOverdue = await tx.select({ id: payments.id }).from(payments).where(and(eq(payments.subscriptionId, p.subscriptionId), inArray(payments.status, ["overdue"])));
    if (!stillOverdue.length) {
      await tx.update(subscriptions).set({ status: "active" }).where(and(eq(subscriptions.id, p.subscriptionId), inArray(subscriptions.status, ["past_due", "suspended", "trialing"])));
      await tx.update(organizations).set({ status: "active" }).where(and(eq(organizations.id, p.organizationId), eq(organizations.status, "suspended")));
    }
  }
  await audit(tx, { organizationId: p.organizationId, actorUserId, action: "billing.payment_paid", summary: `Pagamento de ${(p.amountCents / 100).toFixed(2)} ${p.currency} confirmado`, entityType: "payment", entityId: p.id, metadata: { method: info.method ?? p.method } });
  return updated;
}

/**
 * Ciclo diário de cobrança (worker/cron):
 * 1. gera a fatura do próximo período X dias antes do fim do período atual e avança o período;
 * 2. marca como vencidos os pagamentos pendentes após a data;
 * 3. assinatura vira inadimplente após a carência; empresa é suspensa após N dias (configurável).
 */
export async function runBillingCycle(now = new Date()) {
  return withPlatform(null, async (tx) => {
    const cfg = await billingSettings(tx);
    const today = todayISO(now);
    let invoices = 0;
    const due = await tx
      .select({ sub: subscriptions, plan: plans })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(and(eq(subscriptions.status, "active"), sql`${subscriptions.currentPeriodEnd} <= ${addDaysISO(today, cfg.invoiceDaysBefore)}`));
    for (const { sub, plan } of due) {
      const nextStart = sub.currentPeriodEnd;
      const nextEnd = addMonthsISO(nextStart, plan.intervalMonths);
      const amount = sub.customPriceCents ?? plan.priceCents;
      const desc = `${plan.name} — ${nextStart} a ${nextEnd}`;
      const exists = await tx.select({ id: payments.id }).from(payments).where(and(eq(payments.subscriptionId, sub.id), eq(payments.description, desc)));
      if (!exists.length && amount > 0) {
        await tx.insert(payments).values({ organizationId: sub.organizationId, subscriptionId: sub.id, amountCents: amount, currency: plan.currency, method: "manual_pix", description: desc, dueDate: nextStart });
        invoices++;
      }
      await tx.update(subscriptions).set({ currentPeriodStart: nextStart, currentPeriodEnd: nextEnd }).where(eq(subscriptions.id, sub.id));
    }
    const overdue = await tx.update(payments).set({ status: "overdue" }).where(and(eq(payments.status, "pending"), lt(payments.dueDate, today))).returning({ id: payments.id, orgId: payments.organizationId, sub: payments.subscriptionId, due: payments.dueDate });
    let pastDue = 0;
    let suspended = 0;
    const late = await tx.select().from(payments).where(eq(payments.status, "overdue"));
    for (const p of late) {
      if (!p.subscriptionId) continue;
      const daysLate = Math.floor((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${p.dueDate}T12:00:00Z`).getTime()) / 864e5);
      if (daysLate >= cfg.suspendAfterDays) {
        const r = await tx.update(subscriptions).set({ status: "suspended" }).where(and(eq(subscriptions.id, p.subscriptionId), inArray(subscriptions.status, ["active", "past_due"]))).returning({ id: subscriptions.id });
        if (r.length) {
          await tx.update(organizations).set({ status: "suspended" }).where(eq(organizations.id, p.organizationId));
          await audit(tx, { organizationId: p.organizationId, action: "billing.suspended", summary: `Empresa suspensa por inadimplência (${daysLate} dias)` });
          suspended++;
        }
      } else if (daysLate >= cfg.graceDays) {
        const r = await tx.update(subscriptions).set({ status: "past_due" }).where(and(eq(subscriptions.id, p.subscriptionId), eq(subscriptions.status, "active"))).returning({ id: subscriptions.id });
        if (r.length) {
          await audit(tx, { organizationId: p.organizationId, action: "billing.past_due", summary: `Assinatura inadimplente (pagamento vencido há ${daysLate} dias)` });
          pastDue++;
        }
      }
    }
    return { invoices, overdue: overdue.length, pastDue, suspended };
  });
}
