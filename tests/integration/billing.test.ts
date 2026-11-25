import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDatabase } from "../helpers/db";
import { closeDb, withOrg, withPlatform } from "@/server/db/client";
import { organizations, payments, plans, subscriptions, usageRecords, users } from "@/server/db/schema";
import { createOrganization } from "@/server/services/organizations";
import { createSubscription, markPaymentPaid, runBillingCycle, addDaysISO } from "@/server/billing/service";
import { checkExecutionAllowed } from "@/server/billing/limits";
import { verifyMercadoPagoSignature, verifyStripeSignature } from "@/server/billing/gateways";
import { todayISO } from "@/lib/format";

let adminId: string, orgId: string, planId: string;

beforeAll(async () => {
  await resetDatabase();
  [{ id: adminId }] = await withPlatform(null, (tx) => tx.insert(users).values({ email: "fin@teste.local", name: "Fin", passwordHash: "x", platformRole: "super_admin" }).returning({ id: users.id }));
  orgId = (await withPlatform(adminId, (tx) => createOrganization(tx, adminId, { name: "Indústria X" }))).id;
  [{ id: planId }] = await withPlatform(adminId, (tx) =>
    tx.insert(plans).values({ key: "pro", name: "Pro", type: "monthly", priceCents: 49900, intervalMonths: 1, limits: { agents: 3, users: 10, executionsPerMonth: 2, tokensPerMonth: null, storageMb: null } }).returning({ id: plans.id }),
  );
});
afterAll(closeDb);

describe("cobrança", () => {
  it("cria assinatura ativa com a primeira cobrança e ativa a empresa", async () => {
    await withPlatform(adminId, (tx) => createSubscription(tx, adminId, { organizationId: orgId, planId, status: "active", startDate: addDaysISO(todayISO(), -40) }));
    const ps = await withPlatform(null, (tx) => tx.select().from(payments).where(eq(payments.organizationId, orgId)));
    expect(ps).toHaveLength(1);
    expect(ps[0].amountCents).toBe(49900);
    const [o] = await withPlatform(null, (tx) => tx.select().from(organizations).where(eq(organizations.id, orgId)));
    expect(o.status).toBe("active");
  });

  it("ciclo: gera faturas dos próximos períodos, marca vencidas e suspende após o prazo", async () => {
    const r = await runBillingCycle();
    expect(r.invoices).toBeGreaterThanOrEqual(1);
    expect(r.overdue).toBeGreaterThanOrEqual(1);
    const [s] = await withPlatform(null, (tx) => tx.select().from(subscriptions).where(eq(subscriptions.organizationId, orgId)));
    expect(s.status).toBe("suspended"); // primeira fatura venceu há 40 dias (> 30)
    const [o] = await withPlatform(null, (tx) => tx.select().from(organizations).where(eq(organizations.id, orgId)));
    expect(o.status).toBe("suspended");
    // Rodar de novo não duplica faturas.
    const before = (await withPlatform(null, (tx) => tx.select().from(payments))).length;
    await runBillingCycle();
    const after = (await withPlatform(null, (tx) => tx.select().from(payments))).length;
    expect(after).toBe(before);
  });

  it("assinatura suspensa bloqueia execuções; pagar tudo reativa", async () => {
    const period = todayISO().slice(0, 7);
    expect((await withOrg(orgId, null, (tx) => checkExecutionAllowed(tx, orgId, period, false))).ok).toBe(false);
    const late = await withPlatform(null, (tx) => tx.select().from(payments).where(eq(payments.organizationId, orgId)));
    for (const p of late.filter((x) => x.status === "overdue")) await withPlatform(adminId, (tx) => markPaymentPaid(tx, adminId, p.id, { method: "manual_pix" }));
    const [s] = await withPlatform(null, (tx) => tx.select().from(subscriptions).where(eq(subscriptions.organizationId, orgId)));
    expect(s.status).toBe("active");
    expect((await withOrg(orgId, null, (tx) => checkExecutionAllowed(tx, orgId, period, false))).ok).toBe(true);
  });

  it("aplica o limite mensal de execuções do plano (testes não contam)", async () => {
    const period = todayISO().slice(0, 7);
    await withOrg(orgId, null, (tx) => tx.insert(usageRecords).values([1, 2].map(() => ({ organizationId: orgId, kind: "execution" as const, period }))));
    const r = await withOrg(orgId, null, (tx) => checkExecutionAllowed(tx, orgId, period, false));
    expect(r.ok).toBe(false);
    expect((await withOrg(orgId, null, (tx) => checkExecutionAllowed(tx, orgId, period, true))).ok).toBe(true);
  });

  it("verifica assinatura do webhook Stripe (válida, adulterada, expirada)", () => {
    const secret = "whsec_test";
    const body = '{"id":"evt_1"}';
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret)).toBe(true);
    expect(verifyStripeSignature(body + " ", `t=${t},v1=${sig}`, secret)).toBe(false);
    const old = t - 3600;
    const oldSig = createHmac("sha256", secret).update(`${old}.${body}`).digest("hex");
    expect(verifyStripeSignature(body, `t=${old},v1=${oldSig}`, secret)).toBe(false);
  });

  it("verifica assinatura do webhook Mercado Pago", () => {
    const secret = "mp_secret";
    const v1 = createHmac("sha256", secret).update("id:123;request-id:req-1;ts:1700000000;").digest("hex");
    expect(verifyMercadoPagoSignature("123", "req-1", `ts=1700000000,v1=${v1}`, secret)).toBe(true);
    expect(verifyMercadoPagoSignature("124", "req-1", `ts=1700000000,v1=${v1}`, secret)).toBe(false);
  });
});
