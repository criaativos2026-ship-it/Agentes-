import "server-only";
import { and, count, desc, eq, gte, inArray, isNull, or, sql, sum } from "drizzle-orm";
import { withPlatform } from "@/server/db/client";
import { agents, auditLogs, executions, organizationMembers, organizations, plans, roles, subscriptions, usageRecords, users } from "@/server/db/schema";
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

export async function listOrganizations(userId: string, q?: string) {
  return withPlatform(userId, (tx) =>
    tx
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        segment: organizations.segment,
        status: organizations.status,
        isDemo: organizations.isDemo,
        createdAt: organizations.createdAt,
        members: sql<number>`(select count(*)::int from organization_members m where m.organization_id = ${organizations.id} and m.status = 'active')`,
        agents: sql<number>`(select count(*)::int from agents a where a.organization_id = ${organizations.id})`,
        published: sql<number>`(select count(*)::int from agents a where a.organization_id = ${organizations.id} and a.status = 'published')`,
        subscription: sql<string | null>`(select s.status::text from subscriptions s where s.organization_id = ${organizations.id} and s.status <> 'canceled' limit 1)`,
      })
      .from(organizations)
      .where(q ? sql`${organizations.name} ilike ${"%" + q.replace(/[%_]/g, "") + "%"} or ${organizations.segment} ilike ${"%" + q.replace(/[%_]/g, "") + "%"}` : undefined)
      .orderBy(desc(organizations.createdAt)),
  );
}

export async function getOrganizationDetail(userId: string, orgId: string) {
  return withPlatform(userId, async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return null;
    const members = await tx
      .select({
        id: organizationMembers.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        status: organizationMembers.status,
        userStatus: users.status,
        roleId: organizationMembers.roleId,
        roleName: roles.name,
        jobTitle: organizationMembers.jobTitle,
        lastLoginAt: users.lastLoginAt,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
      .where(eq(organizationMembers.organizationId, orgId))
      .orderBy(users.name);
    const roleOptions = await tx
      .select({ id: roles.id, name: roles.name, isSystem: roles.isSystem })
      .from(roles)
      .where(or(isNull(roles.organizationId), eq(roles.organizationId, orgId)))
      .orderBy(desc(roles.isSystem), roles.name);
    const orgAgents = await tx
      .select({ id: agents.id, name: agents.name, status: agents.status, category: agents.category, updatedAt: agents.updatedAt })
      .from(agents)
      .where(eq(agents.organizationId, orgId))
      .orderBy(agents.name);
    const activity = await tx
      .select({ id: auditLogs.id, summary: auditLogs.summary, createdAt: auditLogs.createdAt, actor: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(eq(auditLogs.organizationId, orgId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(20);
    return { org, members, roleOptions, agents: orgAgents, activity };
  });
}

export async function listUsers(userId: string, q?: string) {
  const term = q ? `%${q.replace(/[%_]/g, "")}%` : null;
  return withPlatform(userId, (tx) =>
    tx
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        platformRole: users.platformRole,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        anonymizedAt: users.anonymizedAt,
        deletionRequestedAt: users.deletionRequestedAt,
        orgs: sql<string>`coalesce((select string_agg(o.name, ', ' order by o.name) from organization_members m join organizations o on o.id = m.organization_id where m.user_id = ${users.id}), '')`,
      })
      .from(users)
      .where(term ? sql`${users.name} ilike ${term} or ${users.email} ilike ${term}` : undefined)
      .orderBy(desc(users.createdAt))
      .limit(300),
  );
}

export const AUDIT_PAGE_SIZE = 50;

export async function listAuditLogs(userId: string, opts: { orgId?: string; page?: number; action?: string }) {
  const page = Math.max(1, opts.page ?? 1);
  return withPlatform(userId, async (tx) => {
    const where = and(
      opts.orgId ? eq(auditLogs.organizationId, opts.orgId) : undefined,
      opts.action ? sql`${auditLogs.action} like ${opts.action.replace(/[%_]/g, "") + "%"}` : undefined,
    );
    const rows = await tx
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        summary: auditLogs.summary,
        createdAt: auditLogs.createdAt,
        ip: auditLogs.ip,
        orgName: organizations.name,
        actor: users.name,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(organizations, eq(organizations.id, auditLogs.organizationId))
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(AUDIT_PAGE_SIZE + 1)
      .offset((page - 1) * AUDIT_PAGE_SIZE);
    const orgOptions = await tx.select({ id: organizations.id, name: organizations.name }).from(organizations).orderBy(organizations.name);
    return { rows: rows.slice(0, AUDIT_PAGE_SIZE), hasMore: rows.length > AUDIT_PAGE_SIZE, page, orgOptions };
  });
}

/** Consumo de IA por empresa e por modelo no período (AAAA-MM). */
export async function usageReport(userId: string, period: string) {
  return withPlatform(userId, async (tx) => {
    const byOrg = await tx
      .select({
        orgId: organizations.id,
        orgName: organizations.name,
        tokensIn: sql<number>`coalesce(sum(${usageRecords.tokensIn}),0)::bigint`,
        tokensOut: sql<number>`coalesce(sum(${usageRecords.tokensOut}),0)::bigint`,
        cost: sql<number>`coalesce(sum(${usageRecords.costMicros}),0)::bigint`,
        executions: sql<number>`count(*) filter (where ${usageRecords.kind} = 'execution')::int`,
        toolCalls: sql<number>`count(*) filter (where ${usageRecords.kind} = 'tool_call')::int`,
      })
      .from(usageRecords)
      .innerJoin(organizations, eq(organizations.id, usageRecords.organizationId))
      .where(and(eq(usageRecords.period, period), eq(usageRecords.isTest, false)))
      .groupBy(organizations.id, organizations.name)
      .orderBy(desc(sql`3`));
    const byModel = await tx
      .select({ model: usageRecords.model, provider: usageRecords.provider, tokens: sql<number>`coalesce(sum(${usageRecords.tokensIn} + ${usageRecords.tokensOut}),0)::bigint`, cost: sql<number>`coalesce(sum(${usageRecords.costMicros}),0)::bigint` })
      .from(usageRecords)
      .where(and(eq(usageRecords.period, period), eq(usageRecords.kind, "llm_tokens")))
      .groupBy(usageRecords.model, usageRecords.provider)
      .orderBy(desc(sql`3`));
    const periods = await tx.selectDistinct({ p: usageRecords.period }).from(usageRecords).orderBy(desc(usageRecords.period)).limit(24);
    const [tests] = await tx.select({ tokens: sql<number>`coalesce(sum(${usageRecords.tokensIn} + ${usageRecords.tokensOut}),0)::bigint`, cost: sql<number>`coalesce(sum(${usageRecords.costMicros}),0)::bigint` }).from(usageRecords).where(and(eq(usageRecords.period, period), eq(usageRecords.isTest, true)));
    return { byOrg: byOrg.map((r) => ({ ...r, tokensIn: Number(r.tokensIn), tokensOut: Number(r.tokensOut), cost: Number(r.cost) })), byModel: byModel.map((r) => ({ ...r, tokens: Number(r.tokens), cost: Number(r.cost) })), periods: periods.map((p) => p.p), tests: { tokens: Number(tests.tokens), cost: Number(tests.cost) } };
  });
}
