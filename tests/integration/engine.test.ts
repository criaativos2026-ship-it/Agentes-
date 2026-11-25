/**
 * Motor de execução com um provedor ROTEIRIZADO (dublê de teste — não existe no produto).
 * Cobre: resposta simples, ferramentas, validação de parâmetros, ferramenta não liberada, aprovação
 * (aprovar/recusar), retentativa, falha definitiva, cancelamento, limite de passos, idempotência,
 * provedor pendente, empresa suspensa e registro de consumo.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDatabase } from "../helpers/db";
import { closeDb, withOrg, withPlatform } from "@/server/db/client";
import { agentTools, agents, approvals, executions, executionSteps, messages, organizations, tasks, usageRecords, users, crmOpportunities } from "@/server/db/schema";
import { __setProviderFactoryForTests } from "@/server/ai/credentials";
import { ProviderError, type LLMProvider, type TurnRequest, type TurnResult } from "@/server/ai/types";
import { createAgent, ensureEditableDraft, publishDraft, setDraftTools } from "@/server/agents/service";
import { claimNext } from "@/server/execution/queue";
import { processExecution } from "@/server/execution/engine";
import { cancelExecution, decideApproval, sendChatMessage } from "@/server/execution/control";
import { createOrganization } from "@/server/services/organizations";

type Script = ((req: TurnRequest) => TurnResult | Promise<TurnResult>)[];
let script: Script = [];
let calls: TurnRequest[] = [];
const usage = { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 };
const text = (t: string): TurnResult => ({ text: t, toolCalls: [], stop: "end", usage, servedModel: "claude-opus-5-5", assistantMessage: { role: "assistant", content: [{ type: "text", text: t }] } });
const tool = (name: string, input: unknown, id = `call_${name}_${Math.random().toString(36).slice(2, 7)}`): TurnResult => ({
  text: "",
  toolCalls: [{ id, name, input }],
  stop: "tool_use",
  usage,
  servedModel: "claude-opus-5-5",
  assistantMessage: { role: "assistant", content: [{ type: "tool_use", id, name, input }] },
});

const scripted: LLMProvider = {
  id: "anthropic",
  userMessage: (t) => ({ role: "user", content: t }),
  toolResultsMessage: (rs) => [{ role: "user", content: rs.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content, is_error: r.isError })) }],
  ping: async () => ({ ok: true }),
  async createTurn(req) {
    calls.push(structuredClone({ ...req, signal: undefined }));
    const next = script.shift();
    if (!next) throw new Error("Roteiro do teste acabou.");
    return next(req);
  },
};

let adminId: string, orgId: string, agentId: string;

async function runNext() {
  const exec = await claimNext("test-worker");
  if (!exec) throw new Error("Nada na fila");
  await processExecution(exec, "test-worker");
  const [e] = await withPlatform(null, (tx) => tx.select().from(executions).where(eq(executions.id, exec.id)));
  return e;
}

async function chat(textMsg: string, opts: { isTest?: boolean; clientRequestId?: string } = {}) {
  return withOrg(orgId, adminId, async (tx) => {
    const [a] = await tx.select().from(agents).where(eq(agents.id, agentId));
    const version = opts.isTest ? await ensureEditableDraft(tx, adminId, agentId) : (await tx.query.agentVersions.findFirst({ where: (v, { eq }) => eq(v.id, a.publishedVersionId!) }))!;
    return sendChatMessage(tx, { orgId, userId: adminId, agentId, version, text: textMsg, isTest: opts.isTest ?? false, clientRequestId: opts.clientRequestId });
  });
}

async function setTools(list: { key: string; requiresApproval?: boolean | null }[]) {
  await withOrg(orgId, adminId, async (tx) => {
    await setDraftTools(tx, adminId, agentId, list.map((t) => ({ key: t.key, requiresApproval: t.requiresApproval ?? null })));
    await publishDraft(tx, adminId, agentId).catch(() => undefined);
  });
}

beforeAll(async () => {
  await resetDatabase();
  __setProviderFactoryForTests(() => scripted);
  process.env.ANTHROPIC_API_KEY = "sk-test-not-used";
  [{ id: adminId }] = await withPlatform(null, (tx) => tx.insert(users).values({ email: "admin@engine.test", name: "Admin", passwordHash: "x", platformRole: "super_admin" }).returning({ id: users.id }));
  const org = await withPlatform(adminId, (tx) => createOrganization(tx, adminId, { name: "Empresa Motor", status: "active" }));
  orgId = org.id;
  const agent = await withOrg(orgId, adminId, (tx) => createAgent(tx, adminId, { organizationId: orgId, name: "Agente Teste", templateKey: "administrativo" }));
  agentId = agent.id;
  await withOrg(orgId, adminId, (tx) => publishDraft(tx, adminId, agentId));
});

afterAll(async () => {
  __setProviderFactoryForTests(null);
  await closeDb();
});

beforeEach(() => {
  script = [];
  calls = [];
});

describe("motor de execução", () => {
  it("responde em texto, grava a resposta, os passos e o consumo", async () => {
    script = [() => text("Olá! Como posso ajudar?")];
    const { conversationId } = await chat("oi");
    const e = await runNext();
    expect(e.status).toBe("succeeded");
    expect(e.output).toMatchObject({ text: "Olá! Como posso ajudar?" });
    expect(e.tokensIn).toBe(1000);
    expect(e.costMicros).toBe(1000 * 4 + 200 * 20); // preços de tabela do claude-opus-5-5
    const msgs = await withOrg(orgId, null, (tx) => tx.select().from(messages).where(eq(messages.conversationId, conversationId)));
    expect(msgs.map((m) => m.role).sort()).toEqual(["assistant", "user"]);
    const usageRows = await withOrg(orgId, null, (tx) => tx.select().from(usageRecords).where(eq(usageRecords.executionId, e.id)));
    expect(usageRows.map((u) => u.kind).sort()).toEqual(["execution", "llm_tokens"]);
    // O prompt de sistema contém as regras de segurança e não contém data/hora (cache estável).
    expect(calls[0].system).toContain("Regras de segurança");
    expect(calls[0].system).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("continua a conversa com o histórico anterior", async () => {
    script = [() => text("Primeira")];
    const first = await chat("mensagem 1");
    await runNext();
    script = [() => text("Segunda")];
    await withOrg(orgId, adminId, async (tx) => {
      const [a] = await tx.select().from(agents).where(eq(agents.id, agentId));
      const v = (await tx.query.agentVersions.findFirst({ where: (v, { eq }) => eq(v.id, a.publishedVersionId!) }))!;
      await sendChatMessage(tx, { orgId, userId: adminId, agentId, version: v, conversationId: first.conversationId, text: "mensagem 2", isTest: false });
    });
    await runNext();
    const transcript = calls[1].transcript as { role: string; content: unknown }[];
    expect(transcript.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(String(transcript[0].content)).toBe("mensagem 1");
  });

  it("executa ferramenta liberada (cria tarefa na própria empresa) e devolve o resultado ao modelo", async () => {
    await setTools([{ key: "create_task" }]);
    script = [() => tool("create_task", { title: "Ligar para o cliente" }), () => text("Tarefa criada.")];
    await chat("crie uma tarefa");
    const e = await runNext();
    expect(e.status).toBe("succeeded");
    const t = await withOrg(orgId, null, (tx) => tx.select().from(tasks).where(eq(tasks.executionId, e.id)));
    expect(t[0].title).toBe("Ligar para o cliente");
    const steps = await withOrg(orgId, null, (tx) => tx.select().from(executionSteps).where(eq(executionSteps.executionId, e.id)));
    expect(steps.map((s) => s.type)).toEqual(["llm", "tool", "llm"]);
    const last = calls[1].transcript.at(-1) as { content: { type: string; is_error?: boolean }[] };
    expect(last.content[0].type).toBe("tool_result");
    expect(last.content[0].is_error).toBeFalsy();
  });

  it("parâmetros inválidos viram erro para o modelo (sem executar nada)", async () => {
    script = [() => tool("create_task", { title: "x" }), () => text("Desculpe.")];
    await chat("tarefa inválida");
    const e = await runNext();
    expect(e.status).toBe("succeeded");
    const last = calls[1].transcript.at(-1) as { content: { content: string; is_error: boolean }[] };
    expect(last.content[0].is_error).toBe(true);
    expect(last.content[0].content).toMatch(/Parâmetros inválidos/);
  });

  it("ferramenta não liberada para o agente é recusada", async () => {
    script = [() => tool("crm_register_opportunity", { name: "Fulano" }), () => text("Não posso.")];
    await chat("registre um lead");
    await runNext();
    const last = calls[1].transcript.at(-1) as { content: { content: string; is_error: boolean }[] };
    expect(last.content[0].content).toMatch(/não está liberada/);
    const leads = await withOrg(orgId, null, (tx) => tx.select().from(crmOpportunities));
    expect(leads).toHaveLength(0);
  });

  it("ação com aprovação: pausa, aprovação executa com os parâmetros aprovados", async () => {
    await setTools([{ key: "create_task" }, { key: "crm_register_opportunity", requiresApproval: true }]);
    script = [() => tool("crm_register_opportunity", { name: "Maria Lead", company: "ACME" })];
    await chat("registre a Maria");
    const paused = await runNext();
    expect(paused.status).toBe("waiting_approval");
    const [ap] = await withOrg(orgId, null, (tx) => tx.select().from(approvals).where(eq(approvals.executionId, paused.id)));
    expect(ap.status).toBe("pending");
    expect(ap.summary).toContain("Maria Lead");
    expect(await withOrg(orgId, null, (tx) => tx.select().from(crmOpportunities))).toHaveLength(0);

    await withOrg(orgId, adminId, (tx) => decideApproval(tx, adminId, orgId, ap.id, "approved"));
    script = [() => text("Registrado após aprovação.")];
    const done = await runNext();
    expect(done.status).toBe("succeeded");
    const leads = await withOrg(orgId, null, (tx) => tx.select().from(crmOpportunities));
    expect(leads.map((l) => l.name)).toEqual(["Maria Lead"]);
  });

  it("ação recusada não é executada e o modelo é avisado", async () => {
    script = [() => tool("crm_register_opportunity", { name: "João Lead" })];
    await chat("registre o João");
    const paused = await runNext();
    const [ap] = await withOrg(orgId, null, (tx) => tx.select().from(approvals).where(eq(approvals.executionId, paused.id)));
    await withOrg(orgId, adminId, (tx) => decideApproval(tx, adminId, orgId, ap.id, "rejected", "Não autorizado"));
    script = [() => text("Ok, não registrei.")];
    const done = await runNext();
    expect(done.status).toBe("succeeded");
    const leads = await withOrg(orgId, null, (tx) => tx.select().from(crmOpportunities).where(eq(crmOpportunities.name, "João Lead")));
    expect(leads).toHaveLength(0);
    const last = calls[1].transcript.at(-1) as { content: { content: string }[] };
    expect(last.content[0].content).toMatch(/recusada pelo aprovador: Não autorizado/);
  });

  it("ferramentas de risco alto SEMPRE exigem aprovação, mesmo com override", async () => {
    await setTools([{ key: "send_email", requiresApproval: false }]);
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "teste@exemplo.com";
    script = [() => tool("send_email", { to: "cliente@exemplo.com", subject: "Oi", body: "Mensagem" })];
    await chat("mande um e-mail");
    const e = await runNext();
    expect(e.status).toBe("waiting_approval");
    delete process.env.RESEND_API_KEY;
    await withOrg(orgId, adminId, (tx) => cancelExecution(tx, adminId, orgId, e.id));
    const [after] = await withPlatform(null, (tx) => tx.select().from(executions).where(eq(executions.id, e.id)));
    expect(after.status).toBe("canceled");
    const [ap] = await withOrg(orgId, null, (tx) => tx.select().from(approvals).where(eq(approvals.executionId, e.id)));
    expect(ap.status).toBe("expired");
  });

  it("ferramenta sem credencial informa que está pendente (não finge sucesso)", async () => {
    await setTools([{ key: "web_search" }]);
    delete process.env.TAVILY_API_KEY;
    script = [() => tool("web_search", { query: "notícias" }), () => text("Sem pesquisa disponível.")];
    await chat("pesquise");
    await runNext();
    const last = calls[1].transcript.at(-1) as { content: { content: string; is_error: boolean }[] };
    expect(last.content[0].is_error).toBe(true);
    expect(last.content[0].content).toMatch(/pendente/);
  });

  it("erro temporário do provedor reagenda a execução; erro definitivo falha", async () => {
    script = [
      () => {
        throw new ProviderError("Limite de uso", true, 429);
      },
    ];
    await chat("teste de retentativa");
    const e = await runNext();
    expect(e.status).toBe("queued");
    expect(e.runAfter.getTime()).toBeGreaterThan(Date.now());
    await withPlatform(null, (tx) => tx.update(executions).set({ runAfter: new Date() }).where(eq(executions.id, e.id)));
    script = [
      () => {
        throw new ProviderError("Chave inválida", false, 401);
      },
    ];
    const e2 = await runNext();
    expect(e2.status).toBe("failed");
    expect(e2.error).toBe("Chave inválida");
  });

  it("para ao atingir o limite de passos", async () => {
    await setTools([{ key: "current_datetime" }]);
    await withOrg(orgId, adminId, async (tx) => {
      const d = await ensureEditableDraft(tx, adminId, agentId);
      await tx.update((await import("@/server/db/schema")).agentVersions).set({ limits: { maxSteps: 2, timeoutSeconds: 300, maxTokensPerRun: 100000 } }).where(eq((await import("@/server/db/schema")).agentVersions.id, d.id));
      await publishDraft(tx, adminId, agentId);
    });
    script = [() => tool("current_datetime", {}), () => tool("current_datetime", {}), () => tool("current_datetime", {})];
    await chat("loop");
    const e = await runNext();
    expect(e.status).toBe("failed");
    expect(e.error).toMatch(/Limite de 2 passos/);
  });

  it("pedido repetido com a mesma chave não cria execução duplicada", async () => {
    const a = await chat("duplicado", { clientRequestId: "req-123" });
    const b = await chat("duplicado", { clientRequestId: "req-123" });
    expect(b.duplicate).toBe(true);
    expect(b.executionId).toBe(a.executionId);
    expect(b.conversationId).toBe(a.conversationId);
    const all = await withOrg(orgId, null, (tx) => tx.select().from(executions).where(eq(executions.idempotencyKey, `chat:${adminId}:req-123`)));
    expect(all).toHaveLength(1);
    await withOrg(orgId, adminId, (tx) => cancelExecution(tx, adminId, orgId, a.executionId));
  });

  it("empresa suspensa não executa (exceto testes do construtor)", async () => {
    await withPlatform(null, (tx) => tx.update(organizations).set({ status: "suspended" }).where(eq(organizations.id, orgId)));
    await chat("algo");
    const e = await runNext();
    expect(e.status).toBe("failed");
    expect(e.error).toMatch(/suspensa/);
    script = [() => text("teste ok")];
    await chat("teste no construtor", { isTest: true });
    const t = await runNext();
    expect(t.error ?? "").toBe("");
    expect(t.status).toBe("succeeded");
    expect(t.isTest).toBe(true);
    await withPlatform(null, (tx) => tx.update(organizations).set({ status: "active" }).where(eq(organizations.id, orgId)));
  });

  it("sem chave do provedor, a execução falha com mensagem de pendência", async () => {
    __setProviderFactoryForTests(null);
    delete process.env.ANTHROPIC_API_KEY;
    await chat("sem chave");
    const e = await runNext();
    expect(e.status).toBe("failed");
    expect(e.error).toMatch(/pendente/);
    __setProviderFactoryForTests(() => scripted);
    process.env.ANTHROPIC_API_KEY = "sk-test-not-used";
  });

  it("dados da execução ficam invisíveis para outra empresa", async () => {
    const other = await withPlatform(adminId, (tx) => createOrganization(tx, adminId, { name: "Outra Empresa" }));
    const seen = await withOrg(other.id, null, (tx) => tx.select().from(executions));
    expect(seen).toHaveLength(0);
    const seenTools = await withOrg(other.id, null, (tx) => tx.select().from(agentTools));
    expect(seenTools).toHaveLength(0);
  });
});
