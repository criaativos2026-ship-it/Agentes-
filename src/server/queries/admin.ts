import "server-only";
import { and, count, desc, eq, gte, inArray, sql, sum } from "drizzle-orm";
import { withPlatform } from "@/server/db/client";
import { agents, auditLogs, executions, organizations, plans, subscriptions, usageRecords, users } from "@/server/db/schema";
import { periodOf } from "@/lib/format";

/** Indicadores do painel do super administrador — todos calculados no banco (sem números inventados). */
export async function getAdminDashboard(userId: string) {
  const period = periodOf();
  const since30d = new Date(Date.now() - 30 * 864e5);
  return withPlatform(userId, async (tx) => {
    const [orgTotals] = await tx
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${organizations.status} in ('active','trial'))`,
        demo: sql<number>`count(*) filter (where ${organizations.isDemo})`,
      })
      .from(organizations);
    const [agentTotals] = await tx
      .select({ total: count(), published: sql<number>`count(*) filter (where ${agents.status} = 'published')` })
      .from(agents);
    const [execTotals] = await tx
      .select({
        total: count(),
        failed: sql<number>`count(*) filter (where ${executions.status} in ('failed','timed_out'))`,
        running: sql<number>`count(*) filter (where ${executions.status} in ('queued','running','waiting_approval'))`,
      })
      .from(executions)
      .where(and(gte(executions.createdAt, since30d), eq(executions.isTest, false)));
    const [usage] = await tx
      .select({
        tokensIn: sum(usageRecords.tokensIn).mapWith(Number),
        tokensOut: sum(usageRecords.tokensOut).mapWith(Number),
        cost: sum(usageRecords.costMicros).mapWith(Number),
      })
      .from(usageRecords)
      .where(and(eq(usageRecords.period, period), eq(usageRecords.kind, "llm_tokens")));
    // Receita recorrente mensal: assinaturas ativas, preço normalizado para 1 mês.
    const [mrr] = await tx
      .select({
        cents: sql<number>`coalesce(sum(coalesce(${subscriptions.customPriceCents}, ${plans.priceCents})::numeric / ${plans.intervalMonths}), 0)::bigint`,
        active: count(),
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(inArray(subscriptions.status, ["active", "past_due"]));
    const [pastDue] = await tx.select({ n: count() }).from(subscriptions).where(eq(subscriptions.status, "past_due"));

    const recent = await tx
      .select({
        id: auditLogs.id,
        summary: auditLogs.summary,
        action: auditLogs.action,
        createdAt: auditLogs.createdAt,
        orgName: organizations.name,
        actor: users.name,
      })
      .from(auditLogs)
      .leftJoin(organizations, eq(organizations.id, auditLogs.organizationId))
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(12);

    const daily = await tx.execute<{ day: string; total: number; failed: number }>(sql`
      select to_char(date_trunc('day', created_at at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD') as day,
             count(*)::int as total,
             count(*) filter (where status in ('failed','timed_out'))::int as failed
      from executions where created_at >= ${since30d.toISOString()} and not is_test
      group by 1 order by 1`);

    return {
      orgs: { total: Number(orgTotals.total), active: Number(orgTotals.active), demo: Number(orgTotals.demo) },
      agents: { total: Number(agentTotals.total), published: Number(agentTotals.published) },
      executions: { total: Number(execTotals.total), failed: Number(execTotals.failed), running: Number(execTotals.running) },
      usage: { tokens: (usage.tokensIn ?? 0) + (usage.tokensOut ?? 0), costMicros: usage.cost ?? 0, period },
      revenue: { mrrCents: Number(mrr.cents), activeSubscriptions: Number(mrr.active), pastDue: Number(pastDue.n) },
      recent,
      daily: [...daily].map((d) => ({ day: d.day, total: Number(d.total), failed: Number(d.failed) })),
    };
  });
}
