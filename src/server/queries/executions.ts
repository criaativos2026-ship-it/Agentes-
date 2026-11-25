import "server-only";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { withOrg, withPlatform } from "@/server/db/client";
import { agents, approvals, executions, executionSteps, organizations, users } from "@/server/db/schema";

export async function getExecutionDetail(orgId: string, executionId: string) {
  return withOrg(orgId, null, async (tx) => {
    const [e] = await tx
      .select({ exec: executions, agentName: agents.name, by: users.name })
      .from(executions)
      .leftJoin(agents, eq(agents.id, executions.agentId))
      .leftJoin(users, eq(users.id, executions.triggeredBy))
      .where(eq(executions.id, executionId));
    if (!e) return null;
    const steps = await tx.select().from(executionSteps).where(eq(executionSteps.executionId, executionId)).orderBy(asc(executionSteps.ordinal));
    const aps = await tx.select().from(approvals).where(eq(approvals.executionId, executionId)).orderBy(asc(approvals.requestedAt));
    return { ...e, steps, approvals: aps };
  });
}

/** Dono da execução (para autorizar a leitura antes de abrir o escopo da empresa). */
export async function executionOwner(executionId: string) {
  const [row] = await withPlatform(null, (tx) =>
    tx.select({ orgId: executions.organizationId, slug: organizations.slug, triggeredBy: executions.triggeredBy }).from(executions).innerJoin(organizations, eq(organizations.id, executions.organizationId)).where(eq(executions.id, executionId)),
  );
  return row ?? null;
}

export type ExecutionFilter = { orgId?: string; status?: string; agentId?: string; onlyUserId?: string; includeTests?: boolean };

export async function listExecutions(scope: { platformUserId: string } | { orgId: string; userId: string }, f: ExecutionFilter, page = 1, pageSize = 30) {
  const where: (SQL | undefined)[] = [
    f.orgId ? eq(executions.organizationId, f.orgId) : undefined,
    f.status ? (f.status === "active" ? inArray(executions.status, ["queued", "running", "waiting_approval"]) : f.status === "error" ? inArray(executions.status, ["failed", "timed_out"]) : eq(executions.status, f.status as "queued")) : undefined,
    f.agentId ? eq(executions.agentId, f.agentId) : undefined,
    f.onlyUserId ? eq(executions.triggeredBy, f.onlyUserId) : undefined,
    f.includeTests ? undefined : eq(executions.isTest, false),
  ];
  const run = async (tx: Parameters<Parameters<typeof withPlatform>[1]>[0]) => {
    const rows = await tx
      .select({
        id: executions.id,
        status: executions.status,
        kind: executions.kind,
        isTest: executions.isTest,
        input: executions.input,
        error: executions.error,
        createdAt: executions.createdAt,
        startedAt: executions.startedAt,
        finishedAt: executions.finishedAt,
        tokens: sql<number>`${executions.tokensIn} + ${executions.tokensOut}`,
        costMicros: executions.costMicros,
        attempts: executions.attempts,
        agentName: agents.name,
        orgName: organizations.name,
        orgSlug: organizations.slug,
        by: users.name,
      })
      .from(executions)
      .leftJoin(agents, eq(agents.id, executions.agentId))
      .innerJoin(organizations, eq(organizations.id, executions.organizationId))
      .leftJoin(users, eq(users.id, executions.triggeredBy))
      .where(and(...where))
      .orderBy(desc(executions.createdAt))
      .limit(pageSize + 1)
      .offset((page - 1) * pageSize);
    return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize, page };
  };
  return "platformUserId" in scope ? withPlatform(scope.platformUserId, run) : withOrg(scope.orgId, scope.userId, run);
}
