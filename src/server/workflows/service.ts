import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { withOrg, withPlatform } from "@/server/db/client";
import { workflowRuns, workflows, type Workflow } from "@/server/db/schema";
import { enqueueExecution } from "@/server/execution/queue";
import { UserFacingError } from "@/server/errors";

/** Dispara uma execução do workflow (cria o registro da execução e a coloca na fila). */
export async function startWorkflowRun(tx: Tx, wf: Workflow, input: { text: string; triggeredBy: string | null; source: "manual" | "webhook" | "schedule"; idempotencyKey?: string }) {
  if (wf.status !== "active" && input.source !== "manual") throw new UserFacingError("Automação inativa.");
  const [run] = await tx.insert(workflowRuns).values({ organizationId: wf.organizationId, workflowId: wf.id, status: "queued", input: { text: input.text, source: input.source } }).returning();
  const { execution, duplicate } = await enqueueExecution(tx, {
    organizationId: wf.organizationId,
    agentId: null,
    agentVersionId: null,
    workflowRunId: run.id,
    triggeredBy: input.triggeredBy,
    kind: "workflow",
    input: { input: input.text, source: input.source, workflowId: wf.id },
    idempotencyKey: input.idempotencyKey,
    timeoutSeconds: 24 * 3600,
    maxAttempts: 1,
  });
  if (duplicate) {
    await tx.delete(workflowRuns).where(eq(workflowRuns.id, run.id));
    return { runId: execution.workflowRunId!, executionId: execution.id, duplicate: true };
  }
  await tx.update(workflowRuns).set({ executionId: execution.id }).where(eq(workflowRuns.id, run.id));
  return { runId: run.id, executionId: execution.id, duplicate: false };
}

/** Gatilho por agenda: dispara automações ativas cujo intervalo venceu (chamado pela manutenção). */
export async function runScheduledWorkflows() {
  const due = await withPlatform(null, (tx) =>
    tx
      .select()
      .from(workflows)
      .where(
        and(
          eq(workflows.status, "active"),
          eq(workflows.triggerType, "schedule"),
          sql`coalesce((${workflows.triggerConfig}->>'everyMinutes')::int, 0) >= 5`,
          sql`not exists (select 1 from workflow_runs r where r.workflow_id = ${workflows.id} and r.created_at > now() - make_interval(mins => (${workflows.triggerConfig}->>'everyMinutes')::int))`,
        ),
      ),
  );
  let started = 0;
  for (const wf of due) {
    const slot = Math.floor(Date.now() / (Number((wf.triggerConfig as { everyMinutes: number }).everyMinutes) * 60000));
    await withOrg(wf.organizationId, null, (tx) => startWorkflowRun(tx, wf, { text: String((wf.triggerConfig as { input?: string }).input ?? ""), triggeredBy: null, source: "schedule", idempotencyKey: `sched:${wf.id}:${slot}` }));
    started++;
  }
  return started;
}

export async function lastRuns(tx: Tx, workflowId: string) {
  return tx.select().from(workflowRuns).where(eq(workflowRuns.workflowId, workflowId)).orderBy(desc(workflowRuns.createdAt)).limit(20);
}
