import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { withPlatform } from "@/server/db/client";
import { executions, type Execution } from "@/server/db/schema";

/** Concessão de uma execução a um worker; renovada a cada passo (heartbeat). */
export const LEASE_MS = 5 * 60 * 1000;

export type EnqueueInput = {
  organizationId: string;
  agentId: string | null;
  agentVersionId: string | null;
  conversationId?: string | null;
  workflowRunId?: string | null;
  triggeredBy: string | null;
  kind: "chat" | "task" | "workflow";
  input: Record<string, unknown>;
  isTest?: boolean;
  idempotencyKey?: string;
  runAfter?: Date;
  timeoutSeconds: number;
  maxAttempts?: number;
};

/**
 * Enfileira (na transação do chamador, escopo da empresa). Com idempotency_key, um pedido repetido
 * (duplo clique, reenvio de webhook) devolve a execução já existente em vez de criar outra.
 */
export async function enqueueExecution(tx: Tx, input: EnqueueInput): Promise<{ execution: Execution; duplicate: boolean }> {
  const values = {
    organizationId: input.organizationId,
    agentId: input.agentId,
    agentVersionId: input.agentVersionId,
    conversationId: input.conversationId ?? null,
    workflowRunId: input.workflowRunId ?? null,
    triggeredBy: input.triggeredBy,
    kind: input.kind,
    input: input.input,
    isTest: input.isTest ?? false,
    idempotencyKey: input.idempotencyKey ?? null,
    runAfter: input.runAfter ?? new Date(),
    maxAttempts: input.maxAttempts ?? 3,
    state: { timeoutSeconds: input.timeoutSeconds },
  };
  const inserted = await tx.insert(executions).values(values).onConflictDoNothing().returning();
  if (inserted[0]) return { execution: inserted[0], duplicate: false };
  const [existing] = await tx
    .select()
    .from(executions)
    .where(and(eq(executions.organizationId, input.organizationId), eq(executions.idempotencyKey, input.idempotencyKey!)))
    .limit(1);
  return { execution: existing, duplicate: true };
}

/** Reivindica a próxima execução pronta (vários workers sem conflito: FOR UPDATE SKIP LOCKED). */
export async function claimNext(workerId: string, onlyId?: string): Promise<Execution | null> {
  return withPlatform(null, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      update executions set status = 'running', locked_at = now(), locked_by = ${workerId},
             attempts = attempts + 1, started_at = coalesce(started_at, now()),
             timeout_at = coalesce(timeout_at, now() + make_interval(secs => coalesce((state->>'timeoutSeconds')::int, 300)))
      where id = (
        select id from executions
        where status = 'queued' and run_after <= now() ${onlyId ? sql`and id = ${onlyId}` : sql``}
        order by run_after, created_at
        for update skip locked limit 1)
      returning id`);
    if (!rows[0]) return null;
    const [exec] = await tx.select().from(executions).where(eq(executions.id, rows[0].id));
    return exec;
  });
}

/**
 * Recupera execuções presas (worker caiu no meio): volta para a fila se ainda houver tentativas,
 * senão marca como falha. Execuções que passaram do tempo limite viram "timed_out".
 */
export async function recoverStale() {
  return withPlatform(null, async (tx) => {
    const timedOut = await tx.execute(sql`
      update executions set status = 'timed_out', finished_at = now(), error = 'Tempo limite da execução atingido.', locked_at = null, locked_by = null
      where status in ('running', 'queued') and timeout_at is not null and timeout_at < now() returning id`);
    const requeued = await tx.execute(sql`
      update executions set status = case when attempts < max_attempts then 'queued'::execution_status else 'failed'::execution_status end,
             error = case when attempts < max_attempts then error else 'O processamento foi interrompido repetidamente.' end,
             finished_at = case when attempts < max_attempts then null else now() end,
             locked_at = null, locked_by = null
      where status = 'running' and locked_at < now() - make_interval(secs => ${LEASE_MS / 1000}) returning id`);
    return { timedOut: timedOut.length, requeued: requeued.length };
  });
}
