import "server-only";
import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { agents, organizationMembers, plans, subscriptions, usageRecords, type PlanLimits } from "@/server/db/schema";

export type EffectiveLimits = PlanLimits & { planName: string | null; subscriptionStatus: string | null };

const UNLIMITED: PlanLimits = { agents: null, users: null, executionsPerMonth: null, tokensPerMonth: null, storageMb: null };

/**
 * Limites vigentes da empresa: plano da assinatura atual + limites personalizados do contrato.
 * Sem assinatura, não há limite automático (contratos fora da plataforma) — a decisão é do super admin.
 */
export async function effectiveLimits(tx: Tx, orgId: string): Promise<EffectiveLimits> {
  const [row] = await tx
    .select({ limits: plans.limits, name: plans.name, custom: subscriptions.customLimits, status: subscriptions.status })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.organizationId, orgId), ne(subscriptions.status, "canceled")))
    .limit(1);
  if (!row) return { ...UNLIMITED, planName: null, subscriptionStatus: null };
  return { ...UNLIMITED, ...row.limits, ...(row.custom ?? {}), planName: row.name, subscriptionStatus: row.status };
}

export async function monthUsage(tx: Tx, orgId: string, period: string) {
  const [r] = await tx
    .select({
      tokens: sql<number>`coalesce(sum(${usageRecords.tokensIn} + ${usageRecords.tokensOut}) filter (where ${usageRecords.kind} = 'llm_tokens'), 0)::bigint`,
      executions: sql<number>`count(*) filter (where ${usageRecords.kind} = 'execution')::int`,
      cost: sql<number>`coalesce(sum(${usageRecords.costMicros}), 0)::bigint`,
    })
    .from(usageRecords)
    .where(and(eq(usageRecords.organizationId, orgId), eq(usageRecords.period, period), eq(usageRecords.isTest, false)));
  return { tokens: Number(r.tokens), executions: Number(r.executions), costMicros: Number(r.cost) };
}

/** Pode iniciar uma nova execução? Testes do Construtor não consomem a cota do cliente. */
export async function checkExecutionAllowed(tx: Tx, orgId: string, period: string, isTest: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (isTest) return { ok: true };
  const limits = await effectiveLimits(tx, orgId);
  if (limits.subscriptionStatus === "suspended") return { ok: false, reason: "Assinatura suspensa. Regularize o pagamento para voltar a usar os agentes." };
  const usage = await monthUsage(tx, orgId, period);
  if (limits.executionsPerMonth !== null && usage.executions >= limits.executionsPerMonth)
    return { ok: false, reason: `Limite mensal de execuções do plano atingido (${limits.executionsPerMonth}).` };
  if (limits.tokensPerMonth !== null && usage.tokens >= limits.tokensPerMonth)
    return { ok: false, reason: `Limite mensal de consumo de IA do plano atingido (${limits.tokensPerMonth} tokens).` };
  return { ok: true };
}

export async function checkSeatAvailable(tx: Tx, orgId: string) {
  const limits = await effectiveLimits(tx, orgId);
  if (limits.users === null) return { ok: true as const };
  const [r] = await tx.select({ n: count() }).from(organizationMembers).where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.status, "active")));
  return Number(r.n) < limits.users ? { ok: true as const } : { ok: false as const, reason: `O plano permite até ${limits.users} usuários ativos.` };
}

export async function checkAgentSlot(tx: Tx, orgId: string) {
  const limits = await effectiveLimits(tx, orgId);
  if (limits.agents === null) return { ok: true as const };
  const [r] = await tx.select({ n: count() }).from(agents).where(and(eq(agents.organizationId, orgId), inArray(agents.status, ["published"])));
  return Number(r.n) < limits.agents ? { ok: true as const } : { ok: false as const, reason: `O plano permite até ${limits.agents} agentes publicados.` };
}
