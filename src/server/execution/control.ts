import "server-only";
import { and, count, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { agents, approvals, conversations, executions, messages, type AgentVersion } from "@/server/db/schema";
import { audit } from "@/server/audit/log";
import { UserFacingError } from "@/server/errors";
import { enqueueExecution } from "./queue";

/** Aprova ou recusa uma ação. Quando não restam aprovações pendentes, a execução volta para a fila. */
export async function decideApproval(tx: Tx, actorUserId: string, orgId: string, approvalId: string, decision: "approved" | "rejected", reason?: string) {
  const [ap] = await tx.select().from(approvals).where(and(eq(approvals.id, approvalId), eq(approvals.organizationId, orgId)));
  if (!ap) throw new UserFacingError("Aprovação não encontrada.");
  if (ap.status !== "pending") throw new UserFacingError("Esta aprovação já foi decidida.");
  await tx.update(approvals).set({ status: decision, decidedBy: actorUserId, decidedAt: new Date(), reason: reason?.slice(0, 500) ?? null }).where(eq(approvals.id, approvalId));
  const [left] = await tx.select({ n: count() }).from(approvals).where(and(eq(approvals.executionId, ap.executionId), eq(approvals.status, "pending")));
  if (Number(left.n) === 0) {
    // Novo prazo começa ao retomar (o tempo esperando aprovação não conta).
    await tx.update(executions).set({ status: "queued", runAfter: new Date(), timeoutAt: null }).where(and(eq(executions.id, ap.executionId), eq(executions.status, "waiting_approval")));
  }
  await audit(tx, { organizationId: orgId, actorUserId, action: `approval.${decision}`, summary: `${decision === "approved" ? "Aprovou" : "Recusou"}: ${ap.summary}`, entityType: "approval", entityId: approvalId });
  return ap.executionId;
}

/** Cancela: na fila/aguardando → cancela na hora; em execução → o motor para no próximo passo. */
export async function cancelExecution(tx: Tx, actorUserId: string, orgId: string, executionId: string) {
  const [e] = await tx.select().from(executions).where(and(eq(executions.id, executionId), eq(executions.organizationId, orgId)));
  if (!e) throw new UserFacingError("Execução não encontrada.");
  if (["succeeded", "failed", "canceled", "timed_out"].includes(e.status)) throw new UserFacingError("Esta execução já terminou.");
  if (e.status === "running") {
    await tx.update(executions).set({ cancelRequestedAt: new Date() }).where(eq(executions.id, executionId));
  } else {
    await tx.update(executions).set({ status: "canceled", cancelRequestedAt: new Date(), finishedAt: new Date(), error: "Cancelada pelo usuário." }).where(eq(executions.id, executionId));
    await tx.update(approvals).set({ status: "expired" }).where(and(eq(approvals.executionId, executionId), inArray(approvals.status, ["pending"])));
  }
  await audit(tx, { organizationId: orgId, actorUserId, action: "execution.canceled", summary: "Execução cancelada", entityType: "execution", entityId: executionId });
}

/**
 * Envia uma mensagem a um agente: cria (ou continua) a conversa, grava a mensagem do usuário e enfileira a execução.
 * `version` = versão a usar (rascunho em testes; publicada em produção).
 */
export async function sendChatMessage(
  tx: Tx,
  input: { orgId: string; userId: string; agentId: string; version: AgentVersion; conversationId?: string; text: string; isTest: boolean; clientRequestId?: string },
) {
  const [agent] = await tx.select().from(agents).where(and(eq(agents.id, input.agentId), eq(agents.organizationId, input.orgId)));
  if (!agent) throw new UserFacingError("Agente não encontrado.");
  const idempotencyKey = input.clientRequestId ? `chat:${input.userId}:${input.clientRequestId}` : undefined;
  if (idempotencyKey) {
    // Pedido repetido (duplo clique, reenvio): devolve o que já existe, sem criar conversa nova.
    const [existing] = await tx.select({ id: executions.id, conversationId: executions.conversationId }).from(executions).where(and(eq(executions.organizationId, input.orgId), eq(executions.idempotencyKey, idempotencyKey)));
    if (existing) return { conversationId: existing.conversationId!, executionId: existing.id, duplicate: true };
  }
  let conversationId = input.conversationId;
  if (conversationId) {
    const [c] = await tx.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.agentId, agent.id), eq(conversations.userId, input.userId)));
    if (!c) throw new UserFacingError("Conversa não encontrada.");
    const busy = await tx.select({ id: executions.id }).from(executions).where(and(eq(executions.conversationId, conversationId), inArray(executions.status, ["queued", "running", "waiting_approval"]))).limit(1);
    if (busy.length) throw new UserFacingError("Aguarde o agente terminar a resposta anterior.");
  } else {
    const [c] = await tx
      .insert(conversations)
      .values({ organizationId: input.orgId, agentId: agent.id, agentVersionId: input.version.id, userId: input.userId, channel: input.isTest ? "test" : "app", isTest: input.isTest, title: input.text.slice(0, 80) })
      .returning({ id: conversations.id });
    conversationId = c.id;
  }
  const { execution, duplicate } = await enqueueExecution(tx, {
    organizationId: input.orgId,
    agentId: agent.id,
    agentVersionId: input.version.id,
    conversationId,
    triggeredBy: input.userId,
    kind: "chat",
    input: { message: input.text },
    isTest: input.isTest,
    idempotencyKey,
    timeoutSeconds: input.version.limits.timeoutSeconds,
  });
  if (!duplicate) {
    await tx.insert(messages).values({ organizationId: input.orgId, conversationId, role: "user", content: [{ type: "text", text: input.text }], userId: input.userId, executionId: execution.id });
  }
  return { conversationId: conversationId!, executionId: execution.id, duplicate };
}
