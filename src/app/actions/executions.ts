"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "@/server/db/client";
import { agents, agentVersions, approvals, executions } from "@/server/db/schema";
import { assertOrgPermission, can, getOrgContext } from "@/server/auth/guards";
import { cancelExecution, decideApproval, sendChatMessage } from "@/server/execution/control";
import { drainQueue } from "@/server/execution/worker";
import { canUseAgent } from "@/server/services/agent-access";
import { toErrorState, UserFacingError } from "@/server/actions/result";
import { AccessDeniedError } from "@/server/errors";
import { uuidSchema } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

const kick = (executionId: string) => after(() => drainQueue({ budgetMs: 280_000, onlyId: executionId }).catch((e) => console.error("[after] falha ao processar", e)));

/** Cliente conversando com um agente PUBLICADO que ele tem permissão de usar. */
export async function sendAgentMessageAction(input: { slug: string; agentId: string; conversationId?: string; text: string; clientRequestId: string }) {
  try {
    const ctx = await assertOrgPermission(input.slug, "agents.use");
    uuidSchema.parse(input.agentId);
    if (input.conversationId) uuidSchema.parse(input.conversationId);
    z.string().uuid().parse(input.clientRequestId);
    const text = z.string().trim().min(1, "Escreva uma mensagem.").max(20000, "Mensagem muito longa.").parse(input.text);
    if (ctx.org.status === "suspended") throw new UserFacingError("Empresa suspensa: os agentes não executam tarefas.");
    const res = await withOrg(ctx.org.id, ctx.user.id, async (tx) => {
      if (!(await canUseAgent(tx, ctx, input.agentId))) throw new AccessDeniedError("Você não tem acesso a este agente.");
      const [a] = await tx.select().from(agents).where(eq(agents.id, input.agentId));
      if (!a || a.status !== "published" || !a.publishedVersionId) throw new UserFacingError("Este agente não está disponível no momento.");
      const [v] = await tx.select().from(agentVersions).where(eq(agentVersions.id, a.publishedVersionId));
      return sendChatMessage(tx, { orgId: ctx.org.id, userId: ctx.user.id, agentId: a.id, version: v, conversationId: input.conversationId, text, isTest: false, clientRequestId: input.clientRequestId });
    });
    kick(res.executionId);
    return { ok: true as const, ...res };
  } catch (err) {
    return { ok: false as const, ...toErrorState(err) };
  }
}

export async function cancelExecutionAction(slug: string, executionId: string): Promise<FormState> {
  try {
    uuidSchema.parse(executionId);
    const ctx = await getOrgContext(slug);
    if (!ctx) throw new AccessDeniedError();
    await withOrg(ctx.org.id, ctx.user.id, async (tx) => {
      const [e] = await tx.select({ by: executions.triggeredBy }).from(executions).where(eq(executions.id, executionId));
      if (!e) throw new UserFacingError("Execução não encontrada.");
      if (!can(ctx, "executions.cancel") && e.by !== ctx.user.id) throw new AccessDeniedError();
      await cancelExecution(tx, ctx.user.id, ctx.org.id, executionId);
    });
    revalidatePath(`/app/${slug}/execucoes/${executionId}`);
    revalidatePath(`/admin/execucoes/${executionId}`);
    return { ok: "Cancelamento solicitado." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function decideApprovalAction(slug: string, approvalId: string, decision: "approved" | "rejected", reason?: string): Promise<FormState> {
  try {
    uuidSchema.parse(approvalId);
    z.enum(["approved", "rejected"]).parse(decision);
    const ctx = await assertOrgPermission(slug, "approvals.decide");
    const executionId = await withOrg(ctx.org.id, ctx.user.id, async (tx) => {
      const [ap] = await tx.select({ id: approvals.id }).from(approvals).where(and(eq(approvals.id, approvalId), eq(approvals.organizationId, ctx.org.id)));
      if (!ap) throw new UserFacingError("Aprovação não encontrada.");
      return decideApproval(tx, ctx.user.id, ctx.org.id, approvalId, decision, reason?.trim() || undefined);
    });
    kick(executionId);
    revalidatePath(`/app/${slug}/aprovacoes`);
    revalidatePath(`/app/${slug}`, "layout");
    return { ok: decision === "approved" ? "Ação aprovada. O agente vai continuar." : "Ação recusada. O agente foi avisado." };
  } catch (err) {
    return toErrorState(err);
  }
}
