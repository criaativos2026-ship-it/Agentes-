import "server-only";
import { and, eq } from "drizzle-orm";
import { withOrg } from "@/server/db/client";
import { agents, agentVersions, approvals, executions, executionSteps, workflowRuns, workflows, type Execution } from "@/server/db/schema";
import { enqueueExecution } from "@/server/execution/queue";
import { audit } from "@/server/audit/log";
import { definitionSchema, evaluate, nextNodeId, render } from "./definition";

type WfState = {
  timeoutSeconds: number;
  cursor?: string | null;
  input?: string;
  last?: string;
  outputs?: Record<string, string>;
  waitingChild?: string | null;
  approvalId?: string | null;
  ordinal?: number;
  visits?: number;
};

const MAX_VISITS = 200; // proteção contra laços infinitos no grafo

/**
 * Executa um workflow passo a passo. Etapas de agente criam execuções-filhas e o workflow aguarda;
 * aprovações pausam até a decisão humana. Estado salvo a cada etapa.
 */
export async function processWorkflowExecution(exec: Execution): Promise<void> {
  const orgId = exec.organizationId;
  const db = <T,>(fn: Parameters<typeof withOrg<T>>[2]) => withOrg(orgId, exec.triggeredBy, fn);
  const state: WfState = { timeoutSeconds: 3600, ...(exec.state as WfState | null) };
  const step = async (name: string, status: "succeeded" | "failed" | "waiting" | "skipped", output?: unknown, error?: string) => {
    state.ordinal = (state.ordinal ?? 0) + 1;
    await db((tx) => tx.insert(executionSteps).values({ organizationId: orgId, executionId: exec.id, ordinal: state.ordinal!, type: "workflow_node", name, status, output: output ?? null, error, finishedAt: new Date(), durationMs: 0 }));
  };
  const save = async (extra: Partial<typeof executions.$inferInsert> = {}) => {
    await db((tx) => tx.update(executions).set({ state: state as Record<string, unknown>, lockedAt: new Date(), ...extra }).where(eq(executions.id, exec.id)));
  };
  const finish = async (status: "succeeded" | "failed", error?: string) => {
    await db(async (tx) => {
      await tx.update(executions).set({ status, error: error ?? null, output: { text: state.last ?? "", outputs: state.outputs ?? {} }, finishedAt: new Date(), lockedAt: null, lockedBy: null, state: state as Record<string, unknown> }).where(eq(executions.id, exec.id));
      if (exec.workflowRunId) await tx.update(workflowRuns).set({ status, output: { last: state.last ?? "", outputs: state.outputs ?? {} } }).where(eq(workflowRuns.id, exec.workflowRunId));
      if (status === "failed") await audit(tx, { organizationId: orgId, action: "workflow.failed", summary: `Automação falhou: ${error?.slice(0, 160)}`, entityType: "execution", entityId: exec.id });
    });
  };

  const [run] = exec.workflowRunId ? await db((tx) => tx.select().from(workflowRuns).where(eq(workflowRuns.id, exec.workflowRunId!))) : [];
  const [wf] = run ? await db((tx) => tx.select().from(workflows).where(eq(workflows.id, run.workflowId))) : [];
  if (!wf) return finish("failed", "Automação não encontrada.");
  const parsed = definitionSchema.safeParse(wf.definition);
  if (!parsed.success) return finish("failed", `Definição inválida: ${parsed.error.issues[0]?.message}`);
  const def = parsed.data;
  if (state.cursor === undefined) {
    state.cursor = def.nodes[0].id;
    state.input = String(exec.input.input ?? exec.input.message ?? "");
    state.last = state.input;
    state.outputs = {};
  }
  const vars = () => ({ input: state.input ?? "", last: state.last ?? "", outputs: state.outputs ?? {} });

  // Retomada de etapa de agente: lê o resultado da execução-filha.
  if (state.waitingChild) {
    const [child] = await db((tx) => tx.select().from(executions).where(eq(executions.id, state.waitingChild!)));
    if (!child || ["queued", "running", "waiting_approval", "waiting"].includes(child.status)) return save({ status: "waiting", lockedAt: null, lockedBy: null });
    const node = def.nodes.find((n) => n.id === state.cursor)!;
    if (child.status !== "succeeded") {
      await step(`Agente (${node.label ?? node.id})`, "failed", null, child.error ?? child.status);
      return finish("failed", `Etapa "${node.label ?? node.id}" falhou: ${child.error ?? child.status}`);
    }
    const text = String((child.output as { text?: string } | null)?.text ?? "");
    state.outputs![node.id] = text;
    state.last = text;
    state.waitingChild = null;
    await step(`Agente concluído (${node.label ?? node.id})`, "succeeded", { resultado: text.slice(0, 2000), execucao: child.id });
    state.cursor = nextNodeId(def, node);
    await save();
  }
  if (state.approvalId) {
    const [ap] = await db((tx) => tx.select().from(approvals).where(eq(approvals.id, state.approvalId!)));
    if (!ap || ap.status === "pending") return save({ status: "waiting_approval", lockedAt: null, lockedBy: null });
    const node = def.nodes.find((n) => n.id === state.cursor)!;
    state.approvalId = null;
    if (ap.status !== "approved") {
      await step(`Aprovação recusada (${node.label ?? node.id})`, "skipped", { motivo: ap.reason });
      return finish("failed", `Aprovação recusada${ap.reason ? `: ${ap.reason}` : ""}.`);
    }
    await step(`Aprovado (${node.label ?? node.id})`, "succeeded");
    state.cursor = nextNodeId(def, node);
    await save();
  }

  while (state.cursor) {
    state.visits = (state.visits ?? 0) + 1;
    if (state.visits > MAX_VISITS) return finish("failed", "Limite de etapas atingido (possível laço na automação).");
    const [cur] = await db((tx) => tx.select({ cancel: executions.cancelRequestedAt }).from(executions).where(eq(executions.id, exec.id)));
    if (cur?.cancel) {
      await db((tx) => tx.update(executions).set({ status: "canceled", finishedAt: new Date(), lockedAt: null, lockedBy: null }).where(eq(executions.id, exec.id)));
      return;
    }
    const node = def.nodes.find((n) => n.id === state.cursor);
    if (!node) return finish("failed", `Etapa inexistente: ${state.cursor}`);

    if (node.type === "end") {
      await step(`Fim (${node.label ?? node.id})`, "succeeded");
      state.cursor = null;
      break;
    }
    if (node.type === "condition") {
      const ok = evaluate(node, vars());
      await step(`Condição (${node.label ?? node.id}): ${ok ? "verdadeira" : "falsa"}`, "succeeded", { origem: node.source, operador: node.operator, valor: node.value });
      state.cursor = nextNodeId(def, node, ok ? "next" : "else");
      await save();
      continue;
    }
    if (node.type === "approval") {
      const summary = render(node.summary, vars()).slice(0, 500);
      const [ap] = await db((tx) => tx.insert(approvals).values({ organizationId: orgId, executionId: exec.id, toolKey: "workflow.approval", payload: { etapa: node.id, contexto: (state.last ?? "").slice(0, 4000) }, summary }).returning({ id: approvals.id }));
      state.approvalId = ap.id;
      await step(`Aprovação solicitada (${node.label ?? node.id})`, "waiting", { summary });
      return save({ status: "waiting_approval", lockedAt: null, lockedBy: null });
    }
    // agente
    const child = await db(async (tx) => {
      const [a] = await tx.select().from(agents).where(and(eq(agents.id, node.agentId), eq(agents.organizationId, orgId)));
      if (!a || a.status !== "published" || !a.publishedVersionId) return null;
      const [v] = await tx.select().from(agentVersions).where(eq(agentVersions.id, a.publishedVersionId));
      return enqueueExecution(tx, {
        organizationId: orgId,
        agentId: a.id,
        agentVersionId: v.id,
        workflowRunId: exec.workflowRunId,
        triggeredBy: exec.triggeredBy,
        kind: "task",
        input: { task: render(node.prompt, vars()), workflowNode: node.id },
        idempotencyKey: `wf:${exec.id}:${node.id}:${state.visits}`,
        timeoutSeconds: v.limits.timeoutSeconds,
      });
    });
    if (!child) return finish("failed", `Etapa "${node.label ?? node.id}": agente indisponível (não publicado ou de outra empresa).`);
    state.waitingChild = child.execution.id;
    await step(`Agente acionado (${node.label ?? node.id})`, "waiting", { execucao: child.execution.id });
    return save({ status: "waiting", lockedAt: null, lockedBy: null });
  }
  return finish("succeeded");
}

/** Chamado quando uma execução-filha termina: devolve o workflow pai para a fila. */
export async function resumeParentWorkflow(child: Execution) {
  if (!child.workflowRunId || child.kind === "workflow") return;
  await withOrg(child.organizationId, null, async (tx) => {
    const [run] = await tx.select().from(workflowRuns).where(eq(workflowRuns.id, child.workflowRunId!));
    if (!run?.executionId) return;
    await tx.update(executions).set({ status: "queued", runAfter: new Date(), timeoutAt: null }).where(and(eq(executions.id, run.executionId), eq(executions.status, "waiting")));
  });
}
