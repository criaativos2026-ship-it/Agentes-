import "server-only";
import { and, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import { withOrg } from "@/server/db/client";
import { agents, approvals, auditLogs, executions, usageRecords, users } from "@/server/db/schema";
import { periodOf } from "@/lib/format";
import type { OrgContext } from "@/server/auth/guards";
import { can } from "@/server/auth/guards";
import { visibleAgentIdsFilter } from "@/server/services/agent-access";

/** Indicadores do painel da empresa — sempre do banco, sempre isolados pela empresa (RLS). */
export async function getOrgDashboard(ctx: OrgContext) {
  const since30d = new Date(Date.now() - 30 * 864e5);
  const period = periodOf(new Date(), ctx.org.timezone);
  const seeAll = can(ctx, "executions.view_all");
  return withOrg(ctx.org.id, ctx.user.id, async (tx) => {
    const agentFilter = await visibleAgentIdsFilter(tx, ctx);
    const [a] = await tx
      .select({
        contracted: sql<number>`count(*) filter (where ${agents.status} in ('published','disabled'))::int`,
        active: sql<number>`count(*) filter (where ${agents.status} = 'published')::int`,
      })
      .from(agents)
      .where(agentFilter);
    const execWhere = and(
      gte(executions.createdAt, since30d),
      eq(executions.isTest, false),
      seeAll ? undefined : eq(executions.triggeredBy, ctx.user.id),
    );
    const [e] = await tx
      .select({
        total: count(),
        succeeded: sql<number>`count(*) filter (where ${executions.status} = 'succeeded')::int`,
        failed: sql<number>`count(*) filter (where ${executions.status} in ('failed','timed_out'))::int`,
        finished: sql<number>`count(*) filter (where ${executions.status} in ('succeeded','failed','timed_out'))::int`,
      })
      .from(executions)
      .where(execWhere);
    const [u] = await tx
      .select({ tokens: sum(sql`${usageRecords.tokensIn} + ${usageRecords.tokensOut}`).mapWith(Number), execs: sql<number>`count(distinct ${usageRecords.executionId})::int` })
      .from(usageRecords)
      .where(and(eq(usageRecords.period, period), eq(usageRecords.kind, "llm_tokens"), eq(usageRecords.isTest, false)));
    const [pending] = await tx.select({ n: count() }).from(approvals).where(eq(approvals.status, "pending"));
    const recent = await tx
      .select({ id: executions.id, status: executions.status, createdAt: executions.createdAt, agentName: agents.name, input: executions.input, by: users.name })
      .from(executions)
      .leftJoin(agents, eq(agents.id, executions.agentId))
      .leftJoin(users, eq(users.id, executions.triggeredBy))
      .where(and(eq(executions.isTest, false), seeAll ? undefined : eq(executions.triggeredBy, ctx.user.id)))
      .orderBy(desc(executions.createdAt))
      .limit(8);
    const daily = await tx.execute<{ day: string; total: number; failed: number }>(sql`
      select to_char(date_trunc('day', created_at at time zone ${ctx.org.timezone}), 'YYYY-MM-DD') as day,
             count(*)::int as total, count(*) filter (where status in ('failed','timed_out'))::int as failed
      from executions where created_at >= ${since30d.toISOString()} and not is_test
      ${seeAll ? sql`` : sql`and triggered_by = ${ctx.user.id}`}
      group by 1 order by 1`);
    return {
      agents: a,
      executions: { total: Number(e.total), succeeded: e.succeeded, failed: e.failed, finished: e.finished },
      usage: { tokens: u.tokens ?? 0, period },
      pendingApprovals: Number(pending.n),
      recent,
      daily: [...daily].map((d) => ({ day: d.day, total: Number(d.total), failed: Number(d.failed) })),
    };
  });
}

export async function listOrgAudit(ctx: OrgContext, page = 1, pageSize = 50) {
  return withOrg(ctx.org.id, ctx.user.id, async (tx) => {
    const rows = await tx
      .select({ id: auditLogs.id, action: auditLogs.action, summary: auditLogs.summary, createdAt: auditLogs.createdAt, ip: auditLogs.ip, actor: users.name, actorEmail: users.email })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize + 1)
      .offset((page - 1) * pageSize);
    return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize, page };
  });
}


export async function getOrgTeam(ctx: OrgContext) {
  const { organizationMembers, roles, rolePermissions } = await import("@/server/db/schema");
  const { isNull, or } = await import("drizzle-orm");
  return withOrg(ctx.org.id, ctx.user.id, async (tx) => {
    const members = await tx
      .select({ id: organizationMembers.id, userId: users.id, name: users.name, email: users.email, status: organizationMembers.status, roleId: organizationMembers.roleId, roleName: roles.name, jobTitle: organizationMembers.jobTitle, lastLoginAt: users.lastLoginAt })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
      .orderBy(users.name);
    const roleList = await tx
      .select({ id: roles.id, name: roles.name, description: roles.description, isSystem: roles.isSystem, organizationId: roles.organizationId })
      .from(roles)
      .where(or(isNull(roles.organizationId), eq(roles.organizationId, ctx.org.id)))
      .orderBy(desc(roles.isSystem), roles.name);
    const perms = await tx.select({ roleId: rolePermissions.roleId, key: rolePermissions.permissionKey }).from(rolePermissions);
    const byRole = new Map<string, string[]>();
    for (const p of perms) byRole.set(p.roleId, [...(byRole.get(p.roleId) ?? []), p.key]);
    return { members, roles: roleList.map((r) => ({ ...r, permissions: byRole.get(r.id) ?? [], memberCount: members.filter((m) => m.roleId === r.id).length })) };
  });
}

export async function listOrgAgents(ctx: OrgContext) {
  const { agents: agentsT } = await import("@/server/db/schema");
  const { inArray: inArr } = await import("drizzle-orm");
  return withOrg(ctx.org.id, ctx.user.id, async (tx) => {
    const filter = await visibleAgentIdsFilter(tx, ctx);
    return tx
      .select({ id: agentsT.id, name: agentsT.name, avatar: agentsT.avatar, description: agentsT.description, objective: agentsT.objective, category: agentsT.category, status: agentsT.status })
      .from(agentsT)
      .where(and(inArr(agentsT.status, ["published", "disabled"]), filter))
      .orderBy(agentsT.name);
  });
}

export async function getAgentChat(ctx: OrgContext, agentId: string, conversationId?: string) {
  const { agents: agentsT, conversations, messages } = await import("@/server/db/schema");
  const { asc } = await import("drizzle-orm");
  const { messagesToChat } = await import("./agents");
  const { canUseAgent } = await import("@/server/services/agent-access");
  return withOrg(ctx.org.id, ctx.user.id, async (tx) => {
    if (!(await canUseAgent(tx, ctx, agentId))) return null;
    const [agent] = await tx.select().from(agentsT).where(eq(agentsT.id, agentId));
    if (!agent || !["published", "disabled"].includes(agent.status)) return null;
    const convs = await tx
      .select({ id: conversations.id, title: conversations.title, updatedAt: conversations.updatedAt })
      .from(conversations)
      .where(and(eq(conversations.agentId, agentId), eq(conversations.userId, ctx.user.id), eq(conversations.isTest, false)))
      .orderBy(desc(conversations.updatedAt))
      .limit(30);
    const current = conversationId ? convs.find((c) => c.id === conversationId) : undefined;
    const msgs = current ? await tx.select().from(messages).where(eq(messages.conversationId, current.id)).orderBy(asc(messages.createdAt)) : [];
    return { agent, conversations: convs, current: current ?? null, messages: messagesToChat(msgs) };
  });
}

export async function listPendingApprovals(ctx: OrgContext) {
  return withOrg(ctx.org.id, ctx.user.id, (tx) =>
    tx
      .select({ id: approvals.id, summary: approvals.summary, toolKey: approvals.toolKey, payload: approvals.payload, requestedAt: approvals.requestedAt, executionId: approvals.executionId, agentName: agents.name, by: users.name })
      .from(approvals)
      .innerJoin(executions, eq(executions.id, approvals.executionId))
      .leftJoin(agents, eq(agents.id, executions.agentId))
      .leftJoin(users, eq(users.id, executions.triggeredBy))
      .where(eq(approvals.status, "pending"))
      .orderBy(desc(approvals.requestedAt)),
  );
}

export async function listKnowledge(ctx: OrgContext) {
  const { knowledgeBases, knowledgeDocuments } = await import("@/server/db/schema");
  const { embeddingsAvailable } = await import("@/server/knowledge/embeddings");
  return withOrg(ctx.org.id, ctx.user.id, async (tx) => {
    const kbs = await tx.select().from(knowledgeBases).orderBy(knowledgeBases.name);
    const docs = await tx
      .select({ id: knowledgeDocuments.id, kbId: knowledgeDocuments.knowledgeBaseId, title: knowledgeDocuments.title, source: knowledgeDocuments.sourceType, status: knowledgeDocuments.status, error: knowledgeDocuments.error, chunks: knowledgeDocuments.chunkCount, embedded: knowledgeDocuments.embedded, size: knowledgeDocuments.sizeBytes, createdAt: knowledgeDocuments.createdAt })
      .from(knowledgeDocuments)
      .orderBy(desc(knowledgeDocuments.createdAt));
    return { kbs: kbs.map((k) => ({ ...k, docs: docs.filter((d) => d.kbId === k.id) })), vector: await embeddingsAvailable(ctx.org.id) };
  });
}

export async function listOrgIntegrations(ctx: OrgContext) {
  const { integrations, integrationUsage, agents: agentsT } = await import("@/server/db/schema");
  const { INTEGRATIONS } = await import("@/server/integrations/catalog");
  return withOrg(ctx.org.id, ctx.user.id, async (tx) => {
    const rows = await tx.select().from(integrations);
    const usage = await tx
      .select({ integrationId: integrationUsage.integrationId, n: sql<number>`count(*)::int`, last: sql<Date>`max(${integrationUsage.createdAt})` })
      .from(integrationUsage)
      .groupBy(integrationUsage.integrationId);
    const agentOptions = await tx.select({ id: agentsT.id, name: agentsT.name }).from(agentsT).where(eq(agentsT.status, "published"));
    return {
      items: INTEGRATIONS.map((def) => {
        const row = rows.find((r) => r.providerKey === def.key);
        const u = row ? usage.find((x) => x.integrationId === row.id) : undefined;
        return { def: { key: def.key, name: def.name, description: def.description, category: def.category, auth: def.auth, fields: def.fields, requirements: def.requirements, docsUrl: def.docsUrl }, row: row ? { status: row.status, config: row.config, connectedAt: row.connectedAt, lastCheckedAt: row.lastCheckedAt, lastError: row.lastError } : null, usage: u ? { count: u.n, last: u.last } : null };
      }),
      agentOptions,
    };
  });
}
