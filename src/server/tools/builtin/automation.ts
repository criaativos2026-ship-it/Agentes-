import "server-only";
import { z } from "zod";
import { defineTool } from "../types";
import { withOrg } from "@/server/db/client";
import { agentVersions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { enqueueExecution } from "@/server/execution/queue";

export const scheduleFollowup = defineTool({
  key: "schedule_followup",
  name: "Agendar tarefa futura do agente",
  description: "Agenda uma nova tarefa para ESTE agente executar numa data/hora futura (ex.: retomar um contato, gerar um relatório). Máximo de 60 dias à frente.",
  category: "automação",
  input: z.object({
    run_at: z.string().datetime({ offset: true }).describe("Quando executar, ISO 8601 com fuso (ex.: 2026-12-01T09:00:00-03:00)"),
    task: z.string().trim().min(5).max(4000).describe("O que o agente deve fazer nesse momento"),
  }),
  risk: "medium",
  requiresApproval: false,
  summarize: (i) => `Agendar para ${i.run_at}: "${i.task.slice(0, 80)}"`,
  async availability() {
    return { ok: true };
  },
  async execute(ctx, input) {
    const when = new Date(input.run_at);
    const now = Date.now();
    if (when.getTime() < now + 60_000) return { content: "A data precisa estar no futuro (mínimo 1 minuto).", isError: true };
    if (when.getTime() > now + 60 * 864e5) return { content: "Máximo de 60 dias à frente.", isError: true };
    if (ctx.isTest) return { content: `(Teste) A tarefa seria agendada para ${when.toISOString()}. Em testes, nada é agendado.`, data: { simulated: true } };
    const exec = await withOrg(ctx.orgId, ctx.userId, async (tx) => {
      const [v] = await tx.select({ limits: agentVersions.limits }).from(agentVersions).where(eq(agentVersions.id, ctx.agentVersionId));
      return enqueueExecution(tx, {
        organizationId: ctx.orgId,
        agentId: ctx.agentId,
        agentVersionId: null, // usa a versão publicada no momento da execução
        triggeredBy: ctx.userId,
        kind: "task",
        input: { task: input.task, scheduledBy: ctx.executionId },
        runAfter: when,
        timeoutSeconds: v?.limits.timeoutSeconds ?? 300,
        idempotencyKey: `followup:${ctx.executionId}:${when.toISOString()}:${input.task.slice(0, 40)}`,
      });
    });
    return { content: `Tarefa agendada para ${when.toISOString()} (execução ${exec.execution.id}).`, data: { executionId: exec.execution.id } };
  },
});
