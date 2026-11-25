import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { withOrg, type Tx } from "@/server/db/client";
import {
  agentKnowledgeBases,
  agents,
  agentTools,
  agentVersions,
  approvals,
  conversations,
  executions,
  executionSteps,
  messages,
  organizations,
  usageRecords,
  users,
  type Execution,
  type MessageContent,
} from "@/server/db/schema";
import { resolveProvider } from "@/server/ai/credentials";
import { estimateCostMicros } from "@/server/ai/models";
import { ProviderError, type ProviderId, type ToolCall, type ToolResultInput, type Usage } from "@/server/ai/types";
import { getTool, needsApproval, toolJsonSchema } from "@/server/tools/registry";
import type { ToolContext } from "@/server/tools/types";
import { buildSystemPrompt, wrapUserTurn } from "@/server/agents/prompt";
import { checkExecutionAllowed } from "@/server/billing/limits";
import { detectInjection } from "@/server/security/prompt-guard";
import { audit } from "@/server/audit/log";
import { periodOf } from "@/lib/format";

/** Estado do loop, salvo em executions.state após cada passo (permite retomar após aprovação ou queda). */
type LoopState = {
  timeoutSeconds: number;
  provider?: ProviderId;
  model?: string;
  transcript?: unknown[];
  ordinal?: number;
  turns?: number;
  tokens?: number;
  /** Chamadas de ferramenta da rodada atual, com resultados já obtidos (evita repetir efeitos). */
  pending?: { calls: ToolCall[]; results: Record<string, ToolResultInput>; approvals: Record<string, string> } | null;
  finalText?: string;
};

class ExecutionFailure extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
  }
}

type Loaded = Awaited<ReturnType<typeof loadContext>>;

async function loadContext(exec: Execution) {
  return withOrg(exec.organizationId, exec.triggeredBy, async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, exec.organizationId));
    if (!exec.agentId) throw new ExecutionFailure("Execução sem agente.");
    const [agent] = await tx.select().from(agents).where(eq(agents.id, exec.agentId));
    if (!agent) throw new ExecutionFailure("Agente não encontrado.");
    let versionId = exec.agentVersionId ?? agent.publishedVersionId;
    if (!versionId) throw new ExecutionFailure("O agente não tem versão publicada.");
    if (!exec.agentVersionId) {
      await tx.update(executions).set({ agentVersionId: versionId }).where(eq(executions.id, exec.id));
      versionId = versionId!;
    }
    const [version] = await tx.select().from(agentVersions).where(eq(agentVersions.id, versionId));
    const toolRows = await tx.select().from(agentTools).where(eq(agentTools.agentVersionId, versionId));
    const kbRows = await tx.select({ id: agentKnowledgeBases.knowledgeBaseId }).from(agentKnowledgeBases).where(eq(agentKnowledgeBases.agentVersionId, versionId));
    let userName: string | null = null;
    if (exec.triggeredBy) {
      const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, exec.triggeredBy));
      userName = u?.name ?? null;
    }
    return { org, agent, version, toolRows, kbIds: kbRows.map((k) => k.id), userName };
  });
}

/** Histórico de conversa (somente texto) anterior a esta execução, para dar continuidade ao chat. */
async function conversationHistory(tx: Tx, exec: Execution, limit = 20) {
  if (!exec.conversationId) return [];
  const rows = await tx
    .select({ role: messages.role, content: messages.content, executionId: messages.executionId, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.conversationId, exec.conversationId), or(isNull(messages.executionId), ne(messages.executionId, exec.id)), ne(messages.role, "system")))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows
    .reverse()
    .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), text: m.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n") }))
    .filter((m) => m.text);
}

export async function processExecution(exec: Execution, workerId: string): Promise<void> {
  const state: LoopState = { timeoutSeconds: 300, ...(exec.state as LoopState | null) };
  let ctx: Loaded;
  try {
    ctx = await loadContext(exec);
  } catch (err) {
    return finishFailed(exec, err instanceof Error ? err.message : "Falha ao carregar o agente.");
  }
  const { org, agent, version } = ctx;
  const orgId = org.id;
  const period = periodOf(new Date(), org.timezone);
  const limits = version.limits;
  const deadline = exec.timeoutAt ? exec.timeoutAt.getTime() : Date.now() + state.timeoutSeconds * 1000;

  const db = <T,>(fn: (tx: Tx) => Promise<T>) => withOrg(orgId, exec.triggeredBy, fn);

  const addStep = async (s: { type: "llm" | "tool" | "approval" | "log"; name: string; status: "succeeded" | "failed" | "waiting" | "skipped"; input?: unknown; output?: unknown; error?: string; startedAt: Date }) => {
    state.ordinal = (state.ordinal ?? 0) + 1;
    const finishedAt = new Date();
    const [row] = await db((tx) =>
      tx
        .insert(executionSteps)
        .values({
          organizationId: orgId,
          executionId: exec.id,
          ordinal: state.ordinal!,
          type: s.type,
          name: s.name,
          status: s.status,
          input: s.input ?? null,
          output: s.output ?? null,
          error: s.error,
          startedAt: s.startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - s.startedAt.getTime(),
        })
        .returning({ id: executionSteps.id }),
    );
    return row.id;
  };

  const saveState = (extra: Partial<typeof executions.$inferInsert> = {}) =>
    db((tx) => tx.update(executions).set({ state: state as Record<string, unknown>, lockedAt: new Date(), ...extra }).where(eq(executions.id, exec.id)));

  try {
    // ---- Verificações antes de gastar recursos ----
    if (!exec.isTest && (org.status === "suspended" || org.status === "canceled")) throw new ExecutionFailure("Empresa suspensa: os agentes não executam tarefas.");
    if (!exec.isTest && agent.status !== "published") throw new ExecutionFailure("Agente não está publicado.");
    if (!state.transcript) {
      const allowed = await db((tx) => checkExecutionAllowed(tx, orgId, period, exec.isTest));
      if (!allowed.ok) throw new ExecutionFailure(allowed.reason);
    }

    const resolved = await resolveProvider(orgId, version.provider as ProviderId);
    if (!resolved) throw new ExecutionFailure(`Provedor de IA "${version.provider}" pendente: cadastre a chave em Configurações → Provedores de IA.`);
    const provider = resolved.provider;

    const enabledTools = ctx.toolRows.map((r) => ({ row: r, def: getTool(r.toolKey) })).filter((t) => t.def);
    const toolSpecs = enabledTools.map((t) => ({ name: t.def!.key, description: t.def!.description, inputSchema: toolJsonSchema(t.def!) }));
    const system = buildSystemPrompt({
      agent,
      version,
      orgName: org.name,
      toolNames: enabledTools.map((t) => t.def!.key),
      hasKnowledge: ctx.kbIds.length > 0 && enabledTools.some((t) => t.def!.key === "knowledge_search"),
    });

    // ---- Transcript inicial ----
    if (!state.transcript) {
      const text = String(exec.input.message ?? exec.input.task ?? "").trim();
      if (!text) throw new ExecutionFailure("Execução sem mensagem ou tarefa.");
      const flags = detectInjection(text);
      const history = await db((tx) => conversationHistory(tx, exec));
      const transcript: unknown[] = [];
      // Histórico alternado usuário/assistente (mensagens consecutivas do mesmo papel são unidas).
      const merged: { role: "user" | "assistant"; text: string }[] = [];
      for (const h of history) {
        const last = merged[merged.length - 1];
        if (last && last.role === h.role) last.text += `\n\n${h.text}`;
        else merged.push({ ...h });
      }
      while (merged[0]?.role === "assistant") merged.shift();
      if (merged[merged.length - 1]?.role === "user") merged.pop(); // pedido anterior que ficou sem resposta
      for (const m of merged) transcript.push(m.role === "user" ? provider.userMessage(m.text) : { role: "assistant", content: m.text });
      transcript.push(provider.userMessage(wrapUserTurn(text, { timezone: org.timezone, userName: ctx.userName, channel: exec.isTest ? "teste" : exec.kind })));
      state.transcript = transcript;
      state.provider = version.provider as ProviderId;
      state.model = version.model;
      if (flags.length) await addStep({ type: "log", name: "Possível tentativa de prompt injection na entrada", status: "succeeded", output: { padrões: flags }, startedAt: new Date() });
      await saveState();
    }

    const toolCtxBase: Omit<ToolContext, "config" | "signal"> = {
      orgId,
      orgTimezone: org.timezone,
      orgSettings: org.settings,
      agentId: agent.id,
      agentVersionId: version.id,
      executionId: exec.id,
      userId: exec.triggeredBy,
      knowledgeBaseIds: ctx.kbIds,
      isTest: exec.isTest,
    };

    /** Executa (ou recusa) as chamadas pendentes. Retorna false se precisar aguardar aprovação. */
    const runPendingCalls = async (): Promise<boolean> => {
      const pending = state.pending!;
      for (const call of pending.calls) {
        if (pending.results[call.id]) continue;
        const startedAt = new Date();
        const entry = enabledTools.find((t) => t.def!.key === call.name);
        if (!entry) {
          pending.results[call.id] = { id: call.id, name: call.name, content: `Ferramenta "${call.name}" não está liberada para este agente.`, isError: true };
          await addStep({ type: "tool", name: call.name, status: "failed", input: call.input, error: "Ferramenta não liberada", startedAt });
          continue;
        }
        const def = entry.def!;
        const parsed = def.input.safeParse(call.input);
        if (!parsed.success) {
          const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "entrada"}: ${i.message}`).join("; ");
          pending.results[call.id] = { id: call.id, name: call.name, content: `Parâmetros inválidos: ${msg}`, isError: true };
          await addStep({ type: "tool", name: def.name, status: "failed", input: call.input, error: `Parâmetros inválidos: ${msg}`, startedAt });
          continue;
        }
        const available = await def.availability({ orgId, orgSettings: org.settings, config: entry.row.config });
        if (!available.ok) {
          pending.results[call.id] = { id: call.id, name: call.name, content: `Indisponível: ${available.reason}`, isError: true };
          await addStep({ type: "tool", name: def.name, status: "failed", input: parsed.data, error: available.reason, startedAt });
          continue;
        }
        // Aprovação humana
        if (needsApproval(def, parsed.data, entry.row.requiresApproval)) {
          const approvalId = pending.approvals[call.id];
          if (!approvalId) {
            const [ap] = await db((tx) =>
              tx
                .insert(approvals)
                .values({ organizationId: orgId, executionId: exec.id, toolKey: def.key, toolCallId: call.id, payload: parsed.data as Record<string, unknown>, summary: def.summarize(parsed.data) })
                .returning({ id: approvals.id }),
            );
            pending.approvals[call.id] = ap.id;
            await addStep({ type: "approval", name: `Aprovação solicitada: ${def.name}`, status: "waiting", input: parsed.data, output: { approvalId: ap.id, summary: def.summarize(parsed.data) }, startedAt });
            continue;
          }
          const [ap] = await db((tx) => tx.select().from(approvals).where(eq(approvals.id, approvalId)));
          if (!ap || ap.status === "pending") continue;
          if (ap.status !== "approved") {
            pending.results[call.id] = { id: call.id, name: call.name, content: `Ação recusada pelo aprovador${ap.reason ? `: ${ap.reason}` : "."} Não execute esta ação.`, isError: true };
            await addStep({ type: "approval", name: `Ação recusada: ${def.name}`, status: "skipped", input: parsed.data, output: { reason: ap.reason }, startedAt });
            continue;
          }
          // aprovado: segue para execução usando os parâmetros APROVADOS (gravados na aprovação)
          parsed.data = ap.payload as typeof parsed.data;
        }
        // Execução da ferramenta
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(def.timeoutMs ?? 30000, Math.max(1000, deadline - Date.now())));
        try {
          const result = await def.execute({ ...toolCtxBase, config: entry.row.config, signal: controller.signal }, parsed.data);
          pending.results[call.id] = { id: call.id, name: call.name, content: result.content, isError: result.isError };
          await addStep({ type: "tool", name: def.name, status: result.isError ? "failed" : "succeeded", input: parsed.data, output: result.data ?? { content: result.content.slice(0, 2000) }, error: result.isError ? result.content.slice(0, 500) : undefined, startedAt });
        } catch (err) {
          const msg = err instanceof Error ? (err.name === "AbortError" ? "Tempo limite da ferramenta atingido." : err.message) : "Erro na ferramenta.";
          pending.results[call.id] = { id: call.id, name: call.name, content: `Erro: ${msg}`, isError: true };
          await addStep({ type: "tool", name: def.name, status: "failed", input: parsed.data, error: msg, startedAt });
        } finally {
          clearTimeout(timer);
        }
        await db((tx) => tx.insert(usageRecords).values({ organizationId: orgId, agentId: agent.id, executionId: exec.id, kind: "tool_call", quantity: 1, period, isTest: exec.isTest }));
        await saveState(); // cada resultado é salvo: uma queda não repete efeitos já realizados
      }
      const waiting = pending.calls.some((c) => !pending.results[c.id]);
      if (waiting) {
        await saveState({ status: "waiting_approval", lockedAt: null, lockedBy: null });
        return false;
      }
      state.transcript!.push(...provider.toolResultsMessage(pending.calls.map((c) => pending.results[c.id])));
      state.pending = null;
      await saveState();
      return true;
    };

    // Retomada: havia chamadas pendentes (aprovação decidida ou queda no meio das ferramentas).
    if (state.pending) {
      if (!(await runPendingCalls())) return;
    }

    // ---- Loop do agente ----
    for (;;) {
      const [cur] = await db((tx) => tx.select({ cancel: executions.cancelRequestedAt }).from(executions).where(eq(executions.id, exec.id)));
      if (cur?.cancel) return finishCanceled(exec, orgId);
      if (Date.now() > deadline) throw new ExecutionFailure("Tempo limite da execução atingido.");
      if ((state.turns ?? 0) >= limits.maxSteps) throw new ExecutionFailure(`Limite de ${limits.maxSteps} passos atingido sem concluir a tarefa.`);
      if ((state.tokens ?? 0) >= limits.maxTokensPerRun) throw new ExecutionFailure(`Limite de ${limits.maxTokensPerRun} tokens por execução atingido.`);

      const startedAt = new Date();
      const signal = AbortSignal.timeout(Math.max(1000, deadline - Date.now()));
      const turn = await provider.createTurn({
        model: version.model,
        system,
        tools: toolSpecs,
        transcript: state.transcript!,
        params: { maxTokens: version.params.maxTokens ?? 16000, effort: version.params.effort, temperature: version.params.temperature },
        signal,
      });
      state.turns = (state.turns ?? 0) + 1;
      state.tokens = (state.tokens ?? 0) + turn.usage.inputTokens + turn.usage.outputTokens;
      state.transcript!.push(turn.assistantMessage);
      await recordLlmUsage(exec, orgId, agent.id, period, version.provider, turn.servedModel, turn.usage);
      await addStep({
        type: "llm",
        name: `Raciocínio do modelo (rodada ${state.turns})`,
        status: turn.stop === "refusal" ? "failed" : "succeeded",
        input: { model: version.model },
        output: { text: turn.text.slice(0, 4000), toolCalls: turn.toolCalls.map((c) => c.name), stop: turn.stop, usage: turn.usage, servedModel: turn.servedModel },
        error: turn.stop === "refusal" ? `Recusa do modelo${turn.refusalDetail ? `: ${turn.refusalDetail}` : ""}` : undefined,
        startedAt,
      });
      if (turn.stop === "refusal") throw new ExecutionFailure("O modelo recusou esta solicitação por política de segurança.");

      if (turn.toolCalls.length === 0) {
        const finalText = turn.text || (turn.stop === "max_tokens" ? "(resposta interrompida pelo limite de tamanho)" : "");
        state.finalText = finalText;
        await saveState();
        return finishSucceeded(exec, orgId, finalText, turn.stop === "max_tokens");
      }
      state.pending = { calls: turn.toolCalls, results: {}, approvals: {} };
      await saveState();
      if (!(await runPendingCalls())) return;
    }
  } catch (err) {
    if (err instanceof ProviderError || err instanceof ExecutionFailure) {
      const retryable = err instanceof ProviderError ? err.retryable : err.retryable;
      if (retryable && exec.attempts < exec.maxAttempts && Date.now() < deadline) {
        const backoffMs = Math.min(5 * 60_000, 2 ** exec.attempts * 10_000);
        await db((tx) =>
          tx.update(executions).set({ status: "queued", runAfter: new Date(Date.now() + backoffMs), error: err.message, lockedAt: null, lockedBy: null, state: state as Record<string, unknown> }).where(eq(executions.id, exec.id)),
        );
        await addStep({ type: "log", name: "Nova tentativa agendada", status: "succeeded", output: { motivo: err.message, emSegundos: backoffMs / 1000 }, startedAt: new Date() });
        return;
      }
      return finishFailed(exec, err.message, state);
    }
    console.error(`[worker ${workerId}] erro inesperado na execução ${exec.id}:`, err);
    return finishFailed(exec, "Erro interno ao executar o agente.", state);
  }
}

async function recordLlmUsage(exec: Execution, orgId: string, agentId: string, period: string, provider: string, model: string, u: Usage) {
  const cost = estimateCostMicros(model, u);
  await withOrg(orgId, exec.triggeredBy, async (tx) => {
    await tx.insert(usageRecords).values({ organizationId: orgId, agentId, executionId: exec.id, kind: "llm_tokens", provider, model, tokensIn: u.inputTokens, tokensOut: u.outputTokens, cacheReadTokens: u.cacheReadTokens, costMicros: cost, period, isTest: exec.isTest });
    const [cur] = await tx.select({ i: executions.tokensIn, o: executions.tokensOut, c: executions.costMicros }).from(executions).where(eq(executions.id, exec.id));
    await tx.update(executions).set({ tokensIn: cur.i + u.inputTokens, tokensOut: cur.o + u.outputTokens, costMicros: cur.c + cost }).where(eq(executions.id, exec.id));
  });
}

async function saveAssistantMessage(tx: Tx, exec: Execution, orgId: string, text: string) {
  if (!exec.conversationId) return;
  const steps = await tx.select({ name: executionSteps.name, type: executionSteps.type, status: executionSteps.status }).from(executionSteps).where(and(eq(executionSteps.executionId, exec.id), inArray(executionSteps.type, ["tool"]))).orderBy(asc(executionSteps.ordinal));
  const content: MessageContent[] = [
    ...steps.map((s, i) => ({ type: "tool_call" as const, id: String(i), name: s.name, input: { status: s.status } })),
    { type: "text", text },
  ];
  await tx.insert(messages).values({ organizationId: orgId, conversationId: exec.conversationId, role: "assistant", content, executionId: exec.id });
  await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, exec.conversationId));
}

async function finishSucceeded(exec: Execution, orgId: string, text: string, truncated: boolean) {
  await withOrg(orgId, exec.triggeredBy, async (tx) => {
    await tx
      .update(executions)
      .set({ status: "succeeded", output: { text, truncated }, finishedAt: new Date(), error: null, lockedAt: null, lockedBy: null })
      .where(eq(executions.id, exec.id));
    await saveAssistantMessage(tx, exec, orgId, text);
    if (!exec.isTest) {
      const [org] = await tx.select({ tz: organizations.timezone }).from(organizations).where(eq(organizations.id, orgId));
      await tx.insert(usageRecords).values({ organizationId: orgId, agentId: exec.agentId, executionId: exec.id, kind: "execution", quantity: 1, period: periodOf(new Date(), org.tz) });
    }
  });
}

async function finishFailed(exec: Execution, error: string, state?: LoopState) {
  await withOrg(exec.organizationId, exec.triggeredBy, async (tx) => {
    await tx
      .update(executions)
      .set({ status: "failed", error, finishedAt: new Date(), lockedAt: null, lockedBy: null, ...(state ? { state: state as Record<string, unknown> } : {}) })
      .where(eq(executions.id, exec.id));
    await saveAssistantMessage(tx, exec, exec.organizationId, `⚠️ Não consegui concluir: ${error}`);
    await audit(tx, { organizationId: exec.organizationId, action: "execution.failed", summary: `Execução falhou: ${error.slice(0, 160)}`, entityType: "execution", entityId: exec.id });
  });
}

async function finishCanceled(exec: Execution, orgId: string) {
  await withOrg(orgId, exec.triggeredBy, (tx) =>
    tx.update(executions).set({ status: "canceled", finishedAt: new Date(), lockedAt: null, lockedBy: null, error: "Cancelada pelo usuário." }).where(eq(executions.id, exec.id)),
  );
}
