"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg, withPlatform } from "@/server/db/client";
import { payments, plans, platformSettings, subscriptions } from "@/server/db/schema";
import { assertOrgPermission, requireSuperAdmin } from "@/server/auth/guards";
import { billingSettings, createSubscription, markPaymentPaid } from "@/server/billing/service";
import { createMercadoPagoCheckout, createStripeCheckout, gatewayConfigured, type GatewayId } from "@/server/billing/gateways";
import { audit } from "@/server/audit/log";
import { parseForm, toErrorState, UserFacingError } from "@/server/actions/result";
import { optionalText, uuidSchema } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

const limitField = z.preprocess((v) => (v === "" || v === undefined ? null : Number(v)), z.number().int().min(0).nullable());
const money = z.preprocess((v) => Math.round(Number(String(v ?? "0").replace(/\./g, "").replace(",", ".")) * 100), z.number().int().min(0, "Valor inválido."));

const planSchema = z.object({
  id: uuidSchema.optional(),
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "Código: letras minúsculas, números e hífen."),
  name: z.string().trim().min(2).max(80),
  description: optionalText(500),
  type: z.enum(["monthly", "annual", "custom", "enterprise"]),
  price: money,
  intervalMonths: z.coerce.number().int().min(1).max(36),
  agents: limitField,
  users: limitField,
  executionsPerMonth: limitField,
  tokensPerMonth: limitField,
  storageMb: limitField,
  features: optionalText(2000),
  isActive: z.literal("on").optional(),
  isPublic: z.literal("on").optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function savePlanAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requireSuperAdmin();
    const d = parseForm(planSchema, form);
    const values = {
      key: d.key,
      name: d.name,
      description: d.description ?? null,
      type: d.type,
      priceCents: d.price,
      intervalMonths: d.intervalMonths,
      limits: { agents: d.agents, users: d.users, executionsPerMonth: d.executionsPerMonth, tokensPerMonth: d.tokensPerMonth, storageMb: d.storageMb },
      features: (d.features ?? "").split("\n").map((f) => f.trim()).filter(Boolean),
      isActive: d.isActive === "on",
      isPublic: d.isPublic === "on",
      validUntil: d.validUntil ?? null,
    };
    await withPlatform(user.id, async (tx) => {
      if (d.id) await tx.update(plans).set(values).where(eq(plans.id, d.id));
      else {
        const dup = await tx.select({ id: plans.id }).from(plans).where(eq(plans.key, d.key));
        if (dup.length) throw new UserFacingError("Já existe um plano com este código.");
        await tx.insert(plans).values(values);
      }
      await audit(tx, { actorUserId: user.id, action: d.id ? "billing.plan_updated" : "billing.plan_created", summary: `Plano "${d.name}" ${d.id ? "atualizado" : "criado"}` });
    });
    revalidatePath("/admin/planos");
    return { ok: "Plano salvo." };
  } catch (err) {
    return toErrorState(err);
  }
}

const subSchema = z.object({
  organizationId: uuidSchema,
  planId: uuidSchema,
  status: z.enum(["trialing", "active"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  customPrice: z.string().optional(),
  notes: optionalText(1000),
});

export async function createSubscriptionAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requireSuperAdmin();
    const d = parseForm(subSchema, form);
    const custom = d.customPrice ? money.parse(d.customPrice) : undefined;
    await withPlatform(user.id, (tx) => createSubscription(tx, user.id, { organizationId: d.organizationId, planId: d.planId, status: d.status, startDate: d.startDate, customPriceCents: custom, notes: d.notes }));
    revalidatePath("/admin/financeiro");
    return { ok: "Assinatura criada." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function cancelSubscriptionAction(subscriptionId: string): Promise<FormState> {
  try {
    const user = await requireSuperAdmin();
    uuidSchema.parse(subscriptionId);
    await withPlatform(user.id, async (tx) => {
      const [s] = await tx.update(subscriptions).set({ status: "canceled", canceledAt: new Date() }).where(eq(subscriptions.id, subscriptionId)).returning();
      if (!s) throw new UserFacingError("Assinatura não encontrada.");
      await tx.update(payments).set({ status: "canceled" }).where(and(eq(payments.subscriptionId, subscriptionId), eq(payments.status, "pending")));
      await audit(tx, { organizationId: s.organizationId, actorUserId: user.id, action: "billing.subscription_canceled", summary: "Assinatura cancelada" });
    });
    revalidatePath("/admin/financeiro");
    return { ok: "Assinatura cancelada (cobranças pendentes canceladas)." };
  } catch (err) {
    return toErrorState(err);
  }
}

const manualPayment = z.object({
  organizationId: uuidSchema,
  amount: money,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(2).max(200),
});

export async function createPaymentAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requireSuperAdmin();
    const d = parseForm(manualPayment, form);
    await withPlatform(user.id, async (tx) => {
      const [sub] = await tx.select({ id: subscriptions.id }).from(subscriptions).where(and(eq(subscriptions.organizationId, d.organizationId), eq(subscriptions.status, "active")));
      await tx.insert(payments).values({ organizationId: d.organizationId, subscriptionId: sub?.id ?? null, amountCents: d.amount, method: "manual_pix", dueDate: d.dueDate, description: d.description, createdBy: user.id });
      await audit(tx, { organizationId: d.organizationId, actorUserId: user.id, action: "billing.payment_created", summary: `Cobrança criada: ${d.description}` });
    });
    revalidatePath("/admin/financeiro");
    return { ok: "Cobrança registrada." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function markPaidAction(paymentId: string, method: "manual_pix" | "manual_boleto" | "manual_transfer"): Promise<FormState> {
  try {
    const user = await requireSuperAdmin();
    uuidSchema.parse(paymentId);
    z.enum(["manual_pix", "manual_boleto", "manual_transfer"]).parse(method);
    await withPlatform(user.id, (tx) => markPaymentPaid(tx, user.id, paymentId, { method }));
    revalidatePath("/admin/financeiro");
    return { ok: "Pagamento confirmado." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function cancelPaymentAction(paymentId: string): Promise<FormState> {
  try {
    const user = await requireSuperAdmin();
    uuidSchema.parse(paymentId);
    await withPlatform(user.id, async (tx) => {
      const [p] = await tx.update(payments).set({ status: "canceled" }).where(and(eq(payments.id, paymentId))).returning();
      if (!p) throw new UserFacingError("Pagamento não encontrado.");
      await audit(tx, { organizationId: p.organizationId, actorUserId: user.id, action: "billing.payment_canceled", summary: `Cobrança cancelada: ${p.description ?? ""}` });
    });
    revalidatePath("/admin/financeiro");
    return { ok: "Cobrança cancelada." };
  } catch (err) {
    return toErrorState(err);
  }
}

const settingsSchema = z.object({
  graceDays: z.coerce.number().int().min(0).max(60),
  suspendAfterDays: z.coerce.number().int().min(1).max(365),
  invoiceDaysBefore: z.coerce.number().int().min(0).max(30),
  liveGateways: z.literal("on").optional(),
});

export async function saveBillingSettingsAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requireSuperAdmin();
    const d = parseForm(settingsSchema, form);
    const live = d.liveGateways === "on";
    if (live && !gatewayConfigured("stripe") && !gatewayConfigured("mercadopago")) throw new UserFacingError("Nenhum gateway configurado no servidor: não é possível ligar a cobrança online.");
    await withPlatform(user.id, async (tx) => {
      const value = { graceDays: d.graceDays, suspendAfterDays: d.suspendAfterDays, invoiceDaysBefore: d.invoiceDaysBefore, liveGateways: live };
      await tx.insert(platformSettings).values({ key: "billing", value }).onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
      await audit(tx, { actorUserId: user.id, action: "billing.settings_updated", summary: `Regras de cobrança atualizadas (cobrança online ${live ? "LIGADA" : "desligada"})` });
    });
    revalidatePath("/admin/financeiro");
    return { ok: "Configurações salvas." };
  } catch (err) {
    return toErrorState(err);
  }
}

/** Cliente paga uma cobrança pelo gateway (só se a cobrança online estiver ligada e configurada). */
export async function payOnlineAction(slug: string, paymentId: string, gateway: GatewayId) {
  let url: string;
  try {
    const ctx = await assertOrgPermission(slug, "billing.view");
    uuidSchema.parse(paymentId);
    z.enum(["stripe", "mercadopago"]).parse(gateway);
    const cfg = await withPlatform(null, (tx) => billingSettings(tx));
    if (!cfg.liveGateways || !gatewayConfigured(gateway)) throw new UserFacingError("Pagamento online ainda não disponível. Use PIX/boleto conforme orientação da equipe NEXUS.");
    const [p] = await withOrg(ctx.org.id, ctx.user.id, (tx) => tx.select().from(payments).where(eq(payments.id, paymentId)));
    if (!p || !["pending", "overdue"].includes(p.status)) throw new UserFacingError("Cobrança não disponível para pagamento.");
    const base = `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/app/${ctx.org.slug}/assinatura`;
    const input = { paymentId: p.id, orgId: ctx.org.id, description: p.description ?? "Assinatura NEXUS AI", amountCents: p.amountCents, currency: p.currency, successUrl: `${base}?pagamento=processando`, cancelUrl: base };
    const r = gateway === "stripe" ? await createStripeCheckout(input) : await createMercadoPagoCheckout(input);
    await withPlatform(null, (tx) => tx.update(payments).set({ gatewayRef: r.ref }).where(eq(payments.id, p.id)));
    url = r.url;
  } catch (err) {
    return toErrorState(err);
  }
  redirect(url);
}
