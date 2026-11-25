import "server-only";
import { z } from "zod";
import { defineTool } from "../types";
import { searchKnowledge } from "@/server/knowledge/search";
import { untrusted } from "@/server/security/prompt-guard";

export const knowledgeSearch = defineTool({
  key: "knowledge_search",
  name: "Consultar base de conhecimento",
  description:
    "Busca trechos relevantes nos documentos autorizados da empresa (manuais, políticas, tabelas, perguntas e respostas). Use antes de responder dúvidas sobre a empresa. Cite o título do documento usado.",
  category: "conhecimento",
  input: z.object({ query: z.string().trim().min(2).max(500).describe("O que procurar, em linguagem natural"), limit: z.number().int().min(1).max(10).default(5) }),
  risk: "low",
  requiresApproval: false,
  summarize: (i) => `Buscar "${i.query}" na base de conhecimento`,
  async availability() {
    return { ok: true };
  },
  async execute(ctx, input) {
    if (!ctx.knowledgeBaseIds.length) return { content: "Este agente não tem bases de conhecimento vinculadas.", isError: true };
    const hits = await searchKnowledge(ctx.orgId, ctx.knowledgeBaseIds, input.query, input.limit);
    if (!hits.length) return { content: "Nenhum trecho encontrado para esta busca.", data: { hits: 0 } };
    const content = hits.map((h, i) => untrusted(`documento ${i + 1}: ${h.title}`, h.content, 4000)).join("\n\n");
    return { content, data: { hits: hits.map((h) => ({ title: h.title, method: h.method, score: Number(h.score.toFixed(4)) })) } };
  },
});
