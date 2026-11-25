import "server-only";
import { z } from "zod";
import { defineTool } from "../types";
import { googleApi } from "@/server/integrations/google";
import { getConnectedIntegration, integrationStatus, recordIntegrationUsage } from "@/server/integrations/store";
import { untrusted } from "@/server/security/prompt-guard";

const googleReady = async (ctx: { orgId: string }) =>
  (await integrationStatus(ctx.orgId, "google")) === "connected" ? ({ ok: true } as const) : ({ ok: false, reason: "Integração Google não conectada." } as const);

export const calendarCreateEvent = defineTool({
  key: "calendar_create_event",
  name: "Criar evento na Agenda Google",
  description: "Cria um evento na agenda principal da conta Google conectada. Datas em ISO 8601 com fuso (ex.: 2026-12-01T14:00:00-03:00).",
  category: "integração",
  integration: "google",
  input: z.object({
    summary: z.string().trim().min(2).max(200),
    description: z.string().trim().max(4000).optional(),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    attendees: z.array(z.string().email()).max(20).default([]),
  }),
  risk: "medium",
  requiresApproval: (i) => i.attendees.length > 0,
  summarize: (i) => `Criar evento "${i.summary}" em ${i.start}${i.attendees.length ? ` com ${i.attendees.length} convidado(s)` : ""}`,
  availability: googleReady,
  async execute(ctx, input) {
    const res = await googleApi<{ id: string; htmlLink: string }>(ctx.orgId, "https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      body: JSON.stringify({ summary: input.summary, description: input.description, start: { dateTime: input.start }, end: { dateTime: input.end }, attendees: input.attendees.map((email) => ({ email })) }),
    });
    if (!res.ok) return { content: res.error, isError: true };
    await recordIntegrationUsage(ctx.orgId, res.integrationId, "calendar.create_event", "ok", undefined, ctx.executionId);
    return { content: `Evento criado: ${res.data.htmlLink}`, data: { id: res.data.id } };
  },
});

export const sheetsAppendRow = defineTool({
  key: "sheets_append_row",
  name: "Registrar linha em Planilha Google",
  description: "Acrescenta uma linha ao final de uma planilha Google (ID da planilha e nome da aba).",
  category: "integração",
  integration: "google",
  input: z.object({
    spreadsheet_id: z.string().trim().regex(/^[a-zA-Z0-9-_]{20,100}$/),
    sheet: z.string().trim().min(1).max(100).default("Página1"),
    values: z.array(z.union([z.string().max(2000), z.number(), z.boolean()])).min(1).max(50),
  }),
  risk: "medium",
  requiresApproval: false,
  summarize: (i) => `Adicionar linha na planilha ${i.spreadsheet_id} (${i.sheet})`,
  availability: googleReady,
  async execute(ctx, input) {
    const range = encodeURIComponent(`${input.sheet}!A1`);
    const res = await googleApi<{ updates?: { updatedRange?: string } }>(
      ctx.orgId,
      `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheet_id}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: [input.values] }) },
    );
    if (!res.ok) return { content: res.error, isError: true };
    await recordIntegrationUsage(ctx.orgId, res.integrationId, "sheets.append", "ok", undefined, ctx.executionId);
    return { content: `Linha registrada (${res.data.updates?.updatedRange ?? "ok"}).` };
  },
});

export const driveListFiles = defineTool({
  key: "drive_list_files",
  name: "Listar arquivos do Google Drive",
  description: "Lista arquivos do Google Drive da conta conectada, opcionalmente filtrando pelo nome.",
  category: "integração",
  integration: "google",
  input: z.object({ name_contains: z.string().trim().max(100).optional(), limit: z.number().int().min(1).max(50).default(20) }),
  risk: "low",
  requiresApproval: false,
  summarize: (i) => `Listar arquivos do Drive${i.name_contains ? ` com "${i.name_contains}"` : ""}`,
  availability: googleReady,
  async execute(ctx, input) {
    const q = ["trashed = false", input.name_contains ? `name contains '${input.name_contains.replace(/['\\]/g, "")}'` : null].filter(Boolean).join(" and ");
    const url = `https://www.googleapis.com/drive/v3/files?pageSize=${input.limit}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&q=${encodeURIComponent(q)}`;
    const res = await googleApi<{ files: { id: string; name: string; mimeType: string; webViewLink: string }[] }>(ctx.orgId, url);
    if (!res.ok) return { content: res.error, isError: true };
    await recordIntegrationUsage(ctx.orgId, res.integrationId, "drive.list", "ok", undefined, ctx.executionId);
    return { content: untrusted("google drive", JSON.stringify(res.data.files)), data: { count: res.data.files.length } };
  },
});

export const mapsSearchPlaces = defineTool({
  key: "maps_search_places",
  name: "Buscar empresas e locais (Google Maps)",
  description: "Busca empresas/locais pelo Google Places (ex.: 'imobiliárias em Campinas'). Retorna nome, endereço, telefone e site quando disponíveis.",
  category: "integração",
  integration: "google_maps",
  input: z.object({ query: z.string().trim().min(3).max(200), max_results: z.number().int().min(1).max(20).default(10) }),
  risk: "low",
  requiresApproval: false,
  summarize: (i) => `Buscar locais: "${i.query}"`,
  async availability(ctx) {
    return (await integrationStatus(ctx.orgId, "google_maps")) === "connected" ? { ok: true } : { ok: false, reason: "Google Maps não conectado." };
  },
  async execute(ctx, input) {
    const integ = await getConnectedIntegration(ctx.orgId, "google_maps");
    if (!integ) return { content: "Google Maps não conectado.", isError: true };
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": integ.secrets.api_key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating",
      },
      body: JSON.stringify({ textQuery: input.query, languageCode: "pt-BR", pageSize: input.max_results }),
      signal: ctx.signal,
    });
    const body = (await res.json().catch(() => ({}))) as { places?: unknown[]; error?: { message?: string } };
    if (!res.ok) {
      await recordIntegrationUsage(ctx.orgId, integ.id, "maps.search", "error", body.error?.message, ctx.executionId);
      return { content: `Google Maps respondeu ${res.status}: ${body.error?.message ?? ""}`, isError: true };
    }
    await recordIntegrationUsage(ctx.orgId, integ.id, "maps.search", "ok", undefined, ctx.executionId);
    return { content: untrusted("google maps", JSON.stringify(body.places ?? [])), data: { count: body.places?.length ?? 0 } };
  },
});
