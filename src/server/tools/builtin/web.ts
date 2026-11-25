import "server-only";
import { z } from "zod";
import { defineTool } from "../types";
import { safeFetch } from "@/server/security/ssrf";
import { untrusted } from "@/server/security/prompt-guard";

export const httpRequest = defineTool({
  key: "http_request",
  name: "Consultar API externa (domínios liberados)",
  description:
    "Faz uma requisição HTTP a uma API externa cujo domínio foi liberado pela empresa. GET para consultas; POST/PUT/PATCH/DELETE alteram dados e exigem aprovação humana.",
  category: "web",
  input: z.object({
    url: z.string().url().max(2000),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
    json_body: z.record(z.string(), z.unknown()).optional().describe("Corpo JSON (para POST/PUT/PATCH)"),
  }),
  risk: "medium",
  requiresApproval: (i) => i.method !== "GET",
  summarize: (i) => `${i.method} ${i.url}`,
  async availability(ctx) {
    return ctx.orgSettings.httpAllowlist?.length ? { ok: true } : { ok: false, reason: "A empresa não tem domínios liberados para APIs externas (configure em Empresas → Dados)." };
  },
  timeoutMs: 20000,
  async execute(ctx, input) {
    try {
      const res = await safeFetch(input.url, {
        method: input.method,
        headers: input.json_body ? { "content-type": "application/json" } : undefined,
        body: input.json_body ? JSON.stringify(input.json_body) : undefined,
        allowlist: ctx.orgSettings.httpAllowlist ?? [],
      });
      return {
        content: `HTTP ${res.status}${res.truncated ? " (resposta truncada)" : ""}\n${untrusted(input.url, res.body, 15000)}`,
        data: { status: res.status, contentType: res.contentType, bytes: res.body.length, truncated: res.truncated },
        isError: res.status >= 400,
      };
    } catch (err) {
      return { content: `Falha na requisição: ${err instanceof Error ? err.message : "erro"}`, isError: true };
    }
  },
});

/** Pesquisa na internet via Tavily (https://docs.tavily.com). Sem TAVILY_API_KEY a ferramenta fica PENDENTE. */
export const webSearch = defineTool({
  key: "web_search",
  name: "Pesquisar na internet",
  description: "Pesquisa na internet e devolve resultados com título, link e resumo. Use para informações públicas e atuais; sempre cite os links.",
  category: "web",
  input: z.object({ query: z.string().trim().min(2).max(300), max_results: z.number().int().min(1).max(10).default(5) }),
  risk: "low",
  requiresApproval: false,
  summarize: (i) => `Pesquisar "${i.query}"`,
  async availability() {
    return process.env.TAVILY_API_KEY ? { ok: true } : { ok: false, reason: "Pesquisa na internet pendente: configure TAVILY_API_KEY no servidor." };
  },
  timeoutMs: 25000,
  async execute(ctx, input) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
      body: JSON.stringify({ query: input.query, max_results: input.max_results, search_depth: "basic" }),
      signal: ctx.signal,
    });
    const body = (await res.json().catch(() => ({}))) as { results?: { title: string; url: string; content: string }[]; detail?: unknown };
    if (!res.ok) return { content: `A pesquisa falhou (HTTP ${res.status}).`, isError: true, data: { status: res.status } };
    const results = body.results ?? [];
    const text = results.map((r, i) => untrusted(`resultado ${i + 1}: ${r.url}`, `${r.title}\n${r.url}\n${r.content}`, 3000)).join("\n\n");
    return { content: text || "Nenhum resultado.", data: { results: results.map((r) => ({ title: r.title, url: r.url })) } };
  },
});
