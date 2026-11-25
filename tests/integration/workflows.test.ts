import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDatabase } from "../helpers/db";
import { closeDb, withOrg, withPlatform } from "@/server/db/client";
import { approvals, executions, users, workflows } from "@/server/db/schema";
import { __setProviderFactoryForTests } from "@/server/ai/credentials";
import type { LLMProvider, TurnRequest } from "@/server/ai/types";
import { createAgent, publishDraft } from "@/server/agents/service";
import { createOrganization } from "@/server/services/organizations";
import { claimNext } from "@/server/execution/queue";
import { processExecution } from "@/server/execution/engine";
import { decideApproval } from "@/server/execution/control";
import { startWorkflowRun } from "@/server/workflows/service";
import { definitionSchema } from "@/server/workflows/definition";

const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
// Provedor roteirizado: classifica como QUENTE se a tarefa mencionar "orçamento".
const provider: LLMProvider = {
  id: "anthropic",
  userMessage: (t) => ({ role: "user", content: t }),
  toolResultsMessage: () => [],
  ping: async () => ({ ok: true }),
  async createTurn(req: TurnRequest) {
    const last = String((req.transcript.at(-1) as { content: string }).content);
    const text = last.includes("Classifique") ? (last.includes("orçamento") ? "QUENTE" : "FRIO") : `Abordagem preparada para: ${last.split("Mensagem:\n")[1]?.slice(0, 40)}`;
    return { text, toolCalls: [], stop: "end", usage, servedModel: req.model, assistantMessage: { role: "assistant", content: [{ type: "text", text }] } };
  },
};

let adminId: string, orgId: string, qualifier: string, seller: string;

async function drain() {
  for (let i = 0; i < 20; i++) {
    const e = await claimNext("t");
    if (!e) return;
    await processExecution(e, "t");
  }
}

beforeAll(async () => {
  await resetDatabase();
  __setProviderFactoryForTests(() => provider);
  process.env.ANTHROPIC_API_KEY = "sk-test";
  [{ id: adminId }] = await withPlatform(null, (tx) => tx.insert(users).values({ email: "wf@teste.local", name: "WF", passwordHash: "x", platformRole: "super_admin" }).returning({ id: users.id }));
  orgId = (await withPlatform(adminId, (tx) => createOrganization(tx, adminId, { name: "Imobiliária WF", status: "active" }))).id;
  for (const [name, set] of [["Qualificador", (id: string) => (qualifier = id)], ["Comercial", (id: string) => (seller = id)]] as const) {
    const a = await withOrg(orgId, adminId, (tx) => createAgent(tx, adminId, { organizationId: orgId, name, templateKey: "vendas" }));
    await withOrg(orgId, adminId, (tx) => publishDraft(tx, adminId, a.id));
    set(a.id);
  }
});
afterAll(async () => {
  __setProviderFactoryForTests(null);
  await closeDb();
});

async function makeWorkflow() {
  const definition = definitionSchema.parse({
    nodes: [
      { id: "qualificar", type: "agent", agentId: qualifier, prompt: "Classifique o lead (QUENTE/FRIO): {{input}}" },
      { id: "quente", type: "condition", source: "last", operator: "contains", value: "QUENTE", else: "fim" },
      { id: "aprovar", type: "approval", summary: "Abordar o lead: {{input}}" },
      { id: "abordar", type: "agent", agentId: seller, prompt: "Prepare a abordagem para {{input}} (classificação {{node.qualificar}})" },
      { id: "fim", type: "end" },
    ],
  });
  const [wf] = await withOrg(orgId, adminId, (tx) => tx.insert(workflows).values({ organizationId: orgId, name: "Novo lead", definition, status: "active" }).returning());
  return wf;
}

describe("workflows", () => {
  it("valida referências inexistentes", () => {
    expect(definitionSchema.safeParse({ nodes: [{ id: "a", type: "end" }, { id: "b", type: "approval", summary: "xxx", next: "zz" }] }).success).toBe(false);
  });

  it("lead quente: agente → condição → aprovação → agente → fim", async () => {
    const wf = await makeWorkflow();
    const { executionId } = await withOrg(orgId, adminId, (tx) => startWorkflowRun(tx, wf, { text: "Maria pediu orçamento de apartamento", triggeredBy: adminId, source: "manual" }));
    await drain();
    let [e] = await withPlatform(null, (tx) => tx.select().from(executions).where(eq(executions.id, executionId)));
    expect(e.status).toBe("waiting_approval");
    const [ap] = await withOrg(orgId, null, (tx) => tx.select().from(approvals).where(eq(approvals.executionId, executionId)));
    expect(ap.summary).toContain("Maria pediu orçamento");
    await withOrg(orgId, adminId, (tx) => decideApproval(tx, adminId, orgId, ap.id, "approved"));
    await drain();
    [e] = await withPlatform(null, (tx) => tx.select().from(executions).where(eq(executions.id, executionId)));
    expect(e.status).toBe("succeeded");
    const out = e.output as { outputs: Record<string, string> };
    expect(out.outputs.qualificar).toBe("QUENTE");
    expect(out.outputs.abordar).toContain("Abordagem preparada");
  });

  it("lead frio: condição falsa encerra sem pedir aprovação", async () => {
    const wf = await makeWorkflow();
    const { executionId } = await withOrg(orgId, adminId, (tx) => startWorkflowRun(tx, wf, { text: "Só curiosidade", triggeredBy: adminId, source: "manual" }));
    await drain();
    const [e] = await withPlatform(null, (tx) => tx.select().from(executions).where(eq(executions.id, executionId)));
    expect(e.status).toBe("succeeded");
    const aps = await withOrg(orgId, null, (tx) => tx.select().from(approvals).where(eq(approvals.executionId, executionId)));
    expect(aps).toHaveLength(0);
  });

  it("agente de outra empresa não pode ser usado num workflow", async () => {
    const other = await withPlatform(adminId, (tx) => createOrganization(tx, adminId, { name: "Outra", status: "active" }));
    const definition = { nodes: [{ id: "x", type: "agent", agentId: qualifier, prompt: "oi" }] };
    const [wf] = await withOrg(other.id, adminId, (tx) => tx.insert(workflows).values({ organizationId: other.id, name: "Intruso", definition, status: "active" }).returning());
    const { executionId } = await withOrg(other.id, adminId, (tx) => startWorkflowRun(tx, wf, { text: "x", triggeredBy: adminId, source: "manual" }));
    await drain();
    const [e] = await withPlatform(null, (tx) => tx.select().from(executions).where(eq(executions.id, executionId)));
    expect(e.status).toBe("failed");
    expect(e.error).toMatch(/indisponível/);
  });
});
