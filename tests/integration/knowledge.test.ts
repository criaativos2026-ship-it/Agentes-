import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDatabase } from "../helpers/db";
import { closeDb, withOrg, withPlatform } from "@/server/db/client";
import { knowledgeBases, users } from "@/server/db/schema";
import { createOrganization } from "@/server/services/organizations";
import { ingestDocument } from "@/server/knowledge/ingest";
import { searchKnowledge } from "@/server/knowledge/search";
import { chunkText } from "@/server/knowledge/extract";
import { analyzeTable } from "@/server/tools/builtin/table";

let userId: string, orgA: string, orgB: string, kbA: string, kbB: string;

beforeAll(async () => {
  await resetDatabase();
  delete process.env.OPENAI_API_KEY;
  [{ id: userId }] = await withPlatform(null, (tx) => tx.insert(users).values({ email: "kb@teste.local", name: "KB", passwordHash: "x" }).returning({ id: users.id }));
  orgA = (await withPlatform(userId, (tx) => createOrganization(tx, userId, { name: "Clínica A" }))).id;
  orgB = (await withPlatform(userId, (tx) => createOrganization(tx, userId, { name: "Clínica B" }))).id;
  [{ id: kbA }] = await withOrg(orgA, userId, (tx) => tx.insert(knowledgeBases).values({ organizationId: orgA, name: "Políticas" }).returning({ id: knowledgeBases.id }));
  [{ id: kbB }] = await withOrg(orgB, userId, (tx) => tx.insert(knowledgeBases).values({ organizationId: orgB, name: "Políticas B" }).returning({ id: knowledgeBases.id }));
});

afterAll(closeDb);

describe("base de conhecimento", () => {
  it("divide textos longos em trechos com sobreposição", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Parágrafo ${i} ` + "palavra ".repeat(40)).join("\n\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.length <= 1500)).toBe(true);
  });

  it("ingere texto e encontra por busca em português (com variação de palavras)", async () => {
    await ingestDocument({ orgId: orgA, userId, knowledgeBaseId: kbA, title: "Política de cancelamento", source: "text", text: "Consultas canceladas com menos de 24 horas de antecedência serão cobradas integralmente.\n\nReagendamentos são gratuitos." });
    const hits = await searchKnowledge(orgA, [kbA], "posso cancelar a consulta?");
    expect(hits[0]?.title).toBe("Política de cancelamento");
    expect(hits[0]?.method).toBe("texto");
  });

  it("recusa conteúdo duplicado na mesma base", async () => {
    await expect(
      ingestDocument({ orgId: orgA, userId, knowledgeBaseId: kbA, title: "Duplicado", source: "text", text: "Consultas canceladas com menos de 24 horas de antecedência serão cobradas integralmente.\n\nReagendamentos são gratuitos." }),
    ).rejects.toThrow(/já está/);
  });

  it("outra empresa não encontra os documentos — nem informando o ID da base", async () => {
    const hits = await searchKnowledge(orgB, [kbA], "cancelar consulta");
    expect(hits).toHaveLength(0);
  });

  it("CSV é analisado com números exatos (soma, filtro e agrupamento)", async () => {
    const csv = "mes,unidade,receita\njan,Centro,\"1.000,50\"\nfev,Centro,2000\njan,Norte,500\n";
    await ingestDocument({ orgId: orgA, userId, knowledgeBaseId: kbA, title: "vendas.csv", source: "upload", fileName: "vendas.csv", mime: "text/csv", bytes: Buffer.from(csv) });
    const ctx = { orgId: orgA, orgTimezone: "America/Sao_Paulo", orgSettings: {}, agentId: "x", agentVersionId: "x", executionId: "x", userId, knowledgeBaseIds: [kbA], config: {}, isTest: true, signal: new AbortController().signal };
    const r = await analyzeTable.execute(ctx, analyzeTable.input.parse({ document_title: "vendas", group_by: "unidade", value_column: "receita" }));
    const data = JSON.parse(r.content);
    expect(data.linhas).toBe(3);
    expect(data.estatisticas.receita.soma).toBe(3500.5);
    expect(data.grupos.Centro.soma).toBe(3000.5);
    const f = JSON.parse((await analyzeTable.execute(ctx, analyzeTable.input.parse({ document_title: "vendas", filter_column: "mes", filter_value: "jan" }))).content);
    expect(f.linhas).toBe(2);
  });

  it("rejeita arquivo com extensão falsa", async () => {
    await expect(
      ingestDocument({ orgId: orgB, userId, knowledgeBaseId: kbB, title: "falso.pdf", source: "upload", fileName: "falso.pdf", mime: "application/pdf", bytes: Buffer.from("não sou pdf") }),
    ).rejects.toThrow(/não é um PDF/);
  });
});
