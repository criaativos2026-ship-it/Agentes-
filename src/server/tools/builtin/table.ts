import "server-only";
import Papa from "papaparse";
import { z } from "zod";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { defineTool } from "../types";
import { withOrg } from "@/server/db/client";
import { knowledgeDocuments } from "@/server/db/schema";
import { documentChunks } from "@/server/knowledge/ingest";

const toNumber = (v: string) => {
  const s = v.trim().replace(/\s/g, "").replace(/^R\$/, "");
  if (!s) return NaN;
  // 1.234,56 (pt-BR) ou 1,234.56 / 1234.56
  const normalized = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  return Number(normalized);
};

/** Análise EXATA de planilhas/CSV da base de conhecimento (sem o modelo "chutar" números). */
export const analyzeTable = defineTool({
  key: "analyze_table",
  name: "Analisar planilha (CSV/XLSX)",
  description:
    "Calcula indicadores exatos sobre uma planilha da base de conhecimento: colunas, total de linhas, soma/média/mín/máx de colunas numéricas, com filtro opcional (coluna = valor) e agrupamento opcional. Informe parte do título do documento.",
  category: "dados",
  input: z.object({
    document_title: z.string().trim().min(2).max(200),
    filter_column: z.string().trim().max(120).optional(),
    filter_value: z.string().trim().max(200).optional(),
    group_by: z.string().trim().max(120).optional(),
    value_column: z.string().trim().max(120).optional().describe("Coluna numérica para somar/médias"),
    preview_rows: z.number().int().min(0).max(30).default(5),
  }),
  risk: "low",
  requiresApproval: false,
  summarize: (i) => `Analisar planilha "${i.document_title}"`,
  async availability() {
    return { ok: true };
  },
  async execute(ctx, input) {
    if (!ctx.knowledgeBaseIds.length) return { content: "Agente sem bases de conhecimento vinculadas.", isError: true };
    const docs = await withOrg(ctx.orgId, null, (tx) =>
      tx
        .select({ id: knowledgeDocuments.id, title: knowledgeDocuments.title, mime: knowledgeDocuments.mimeType })
        .from(knowledgeDocuments)
        .where(and(inArray(knowledgeDocuments.knowledgeBaseId, ctx.knowledgeBaseIds), ilike(knowledgeDocuments.title, `%${input.document_title.replace(/[%_]/g, "")}%`), eq(knowledgeDocuments.status, "ready")))
        .limit(5),
    );
    const doc = docs.find((d) => /\.(csv|xlsx)$/i.test(d.title) || /csv|spreadsheet|excel/.test(d.mime ?? "")) ?? docs[0];
    if (!doc) return { content: `Nenhuma planilha encontrada com "${input.document_title}".`, isError: true };
    const chunks = await documentChunks(ctx.orgId, doc.id);
    let header: string[] = [];
    const rows: Record<string, string>[] = [];
    for (const c of chunks) {
      const parsed = Papa.parse<Record<string, string>>(c.content, { header: true, skipEmptyLines: true });
      header = parsed.meta.fields ?? header;
      rows.push(...parsed.data);
    }
    if (!header.length) return { content: "O documento não é uma tabela.", isError: true };
    const pick = (name?: string) => (name ? header.find((h) => h.toLowerCase() === name.toLowerCase()) : undefined);
    let data = rows;
    const fc = pick(input.filter_column);
    if (input.filter_column && !fc) return { content: `Coluna de filtro inexistente. Colunas: ${header.join(", ")}`, isError: true };
    if (fc && input.filter_value !== undefined) data = data.filter((r) => (r[fc] ?? "").trim().toLowerCase() === input.filter_value!.toLowerCase());
    const numericCols = header.filter((h) => {
      const vals = data.slice(0, 200).map((r) => r[h] ?? "").filter((v) => v.trim());
      return vals.length > 0 && vals.every((v) => !Number.isNaN(toNumber(v)));
    });
    const stats = Object.fromEntries(
      numericCols.map((h) => {
        const nums = data.map((r) => toNumber(r[h] ?? "")).filter((n) => !Number.isNaN(n));
        const sum = nums.reduce((a, b) => a + b, 0);
        return [h, { soma: Number(sum.toFixed(4)), media: nums.length ? Number((sum / nums.length).toFixed(4)) : null, min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null, contagem: nums.length }];
      }),
    );
    let groups: Record<string, { linhas: number; soma?: number }> | undefined;
    const gb = pick(input.group_by);
    const vc = pick(input.value_column);
    if (input.group_by && !gb) return { content: `Coluna de agrupamento inexistente. Colunas: ${header.join(", ")}`, isError: true };
    if (gb) {
      groups = {};
      for (const r of data) {
        const k = (r[gb] ?? "").trim() || "(vazio)";
        const g = (groups[k] ??= { linhas: 0, ...(vc ? { soma: 0 } : {}) });
        g.linhas++;
        if (vc) g.soma = Number(((g.soma ?? 0) + (toNumber(r[vc] ?? "") || 0)).toFixed(4));
      }
    }
    const result = { documento: doc.title, colunas: header, linhas: data.length, linhasTotais: rows.length, estatisticas: stats, grupos: groups, amostra: data.slice(0, input.preview_rows) };
    return { content: JSON.stringify(result), data: { document: doc.title, rows: data.length } };
  },
});
