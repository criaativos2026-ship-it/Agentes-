import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { defineTool } from "../types";
import { getConnectedIntegration, integrationStatus, recordIntegrationUsage } from "@/server/integrations/store";
import { safeFetch } from "@/server/security/ssrf";
import { untrusted } from "@/server/security/prompt-guard";

const connected = (key: string, label: string) => async (ctx: { orgId: string }) =>
  (await integrationStatus(ctx.orgId, key)) === "connected" ? ({ ok: true } as const) : ({ ok: false, reason: `${label} não conectado.` } as const);

export const hubspotSearchContacts = defineTool({
  key: "hubspot_search_contacts",
  name: "Consultar contatos no HubSpot",
  description: "Busca contatos no HubSpot por texto (nome, e-mail, empresa).",
  category: "crm",
  integration: "hubspot",
  input: z.object({ query: z.string().trim().min(2).max(120), limit: z.number().int().min(1).max(50).default(10) }),
  risk: "low",
  requiresApproval: false,
  summarize: (i) => `Buscar contatos HubSpot: "${i.query}"`,
  availability: connected("hubspot", "HubSpot"),
  async execute(ctx, input) {
    const integ = await getConnectedIntegration(ctx.orgId, "hubspot");
    if (!integ) return { content: "HubSpot não conectado.", isError: true };
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${integ.secrets.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: input.query, limit: input.limit, properties: ["firstname", "lastname", "email", "company", "phone"] }),
      signal: ctx.signal,
    });
    const body = (await res.json().catch(() => ({}))) as { results?: unknown[]; message?: string };
    if (!res.ok) return { content: `HubSpot respondeu ${res.status}: ${body.message ?? ""}`, isError: true };
    await recordIntegrationUsage(ctx.orgId, integ.id, "hubspot.search", "ok", undefined, ctx.executionId);
    return { content: untrusted("hubspot", JSON.stringify(body.results ?? [])), data: { count: body.results?.length ?? 0 } };
  },
});

export const hubspotCreateContact = defineTool({
  key: "hubspot_create_contact",
  name: "Cadastrar contato no HubSpot",
  description: "Cria um contato no HubSpot com dados obtidos de fontes reais. Nunca invente dados.",
  category: "crm",
  integration: "hubspot",
  input: z.object({
    email: z.string().trim().toLowerCase().email(),
    firstname: z.string().trim().max(100).optional(),
    lastname: z.string().trim().max(100).optional(),
    company: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(40).optional(),
  }),
  risk: "medium",
  requiresApproval: false,
  summarize: (i) => `Cadastrar contato ${i.email} no HubSpot`,
  availability: connected("hubspot", "HubSpot"),
  async execute(ctx, input) {
    const integ = await getConnectedIntegration(ctx.orgId, "hubspot");
    if (!integ) return { content: "HubSpot não conectado.", isError: true };
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
      method: "POST",
      headers: { Authorization: `Bearer ${integ.secrets.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ properties: input }),
      signal: ctx.signal,
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      await recordIntegrationUsage(ctx.orgId, integ.id, "hubspot.create_contact", "error", body.message, ctx.executionId);
      return { content: `HubSpot respondeu ${res.status}: ${body.message ?? ""}`, isError: true };
    }
    await recordIntegrationUsage(ctx.orgId, integ.id, "hubspot.create_contact", "ok", undefined, ctx.executionId);
    return { content: `Contato criado no HubSpot (id ${body.id}).`, data: { id: body.id } };
  },
});

export const restApiRequest = defineTool({
  key: "rest_api_request",
  name: "Consultar sistema da empresa (API REST)",
  description: "Chama a API REST conectada da empresa (ERP/sistema próprio). Informe apenas o caminho (ex.: /pedidos?status=aberto). Métodos que alteram dados exigem aprovação.",
  category: "integração",
  integration: "rest_api",
  input: z.object({
    path: z.string().trim().regex(/^\/[^\s]*$/, "Use um caminho começando com /").max(1000),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
    json_body: z.record(z.string(), z.unknown()).optional(),
  }),
  risk: "medium",
  requiresApproval: (i) => i.method !== "GET",
  summarize: (i) => `${i.method} ${i.path} na API da empresa`,
  availability: connected("rest_api", "API REST"),
  timeoutMs: 20000,
  async execute(ctx, input) {
    const integ = await getConnectedIntegration(ctx.orgId, "rest_api");
    if (!integ) return { content: "API REST não conectada.", isError: true };
    const base = new URL(integ.config.base_url);
    const url = new URL(base.pathname.replace(/\/$/, "") + input.path, base);
    const headers: Record<string, string> = input.json_body ? { "content-type": "application/json" } : {};
    if (integ.config.header_name && integ.secrets.header_value) headers[integ.config.header_name] = integ.secrets.header_value;
    try {
      const res = await safeFetch(url.toString(), { method: input.method, headers, body: input.json_body ? JSON.stringify(input.json_body) : undefined, allowlist: [base.hostname] });
      await recordIntegrationUsage(ctx.orgId, integ.id, `rest.${input.method.toLowerCase()}`, res.status < 400 ? "ok" : "error", `HTTP ${res.status}`, ctx.executionId);
      return { content: `HTTP ${res.status}\n${untrusted("api da empresa", res.body, 15000)}`, isError: res.status >= 400, data: { status: res.status } };
    } catch (err) {
      return { content: `Falha: ${err instanceof Error ? err.message : "erro"}`, isError: true };
    }
  },
});

export const sendWebhook = defineTool({
  key: "send_webhook",
  name: "Enviar evento por webhook",
  description: "Envia um evento JSON assinado para o webhook de saída configurado (Zapier, Make, n8n, sistemas próprios).",
  category: "automação",
  integration: "webhook_out",
  input: z.object({ event: z.string().trim().min(2).max(80).regex(/^[a-z0-9_.-]+$/i), data: z.record(z.string(), z.unknown()) }),
  risk: "medium",
  requiresApproval: false,
  summarize: (i) => `Enviar evento "${i.event}" por webhook`,
  availability: connected("webhook_out", "Webhook de saída"),
  async execute(ctx, input) {
    const integ = await getConnectedIntegration(ctx.orgId, "webhook_out");
    if (!integ) return { content: "Webhook não conectado.", isError: true };
    const body = JSON.stringify({ event: input.event, data: input.data, sentAt: new Date().toISOString(), executionId: ctx.executionId });
    const signature = createHmac("sha256", integ.secrets.signing_secret).update(body).digest("hex");
    const host = new URL(integ.config.url).hostname;
    try {
      const res = await safeFetch(integ.config.url, { method: "POST", headers: { "content-type": "application/json", "x-nexus-signature": `sha256=${signature}` }, body, allowlist: [host] });
      await recordIntegrationUsage(ctx.orgId, integ.id, "webhook.send", res.status < 400 ? "ok" : "error", `HTTP ${res.status}`, ctx.executionId);
      return { content: `Webhook respondeu HTTP ${res.status}.`, isError: res.status >= 400 };
    } catch (err) {
      return { content: `Falha no envio: ${err instanceof Error ? err.message : "erro"}`, isError: true };
    }
  },
});
