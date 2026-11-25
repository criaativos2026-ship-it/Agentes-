import "server-only";
import { z } from "zod";
import { defineTool } from "../types";
import { isEmailConfigured, sendEmail } from "@/server/email";
import { getConnectedIntegration, recordIntegrationUsage } from "@/server/integrations/store";
import { GRAPH_VERSION_DEFAULT } from "@/server/integrations/catalog";
import { googleApi } from "@/server/integrations/google";
import { integrationStatus } from "@/server/integrations/store";

/** E-mail transacional pela plataforma (Resend). Ação externa: SEMPRE exige aprovação humana. */
export const sendEmailTool = defineTool({
  key: "send_email",
  name: "Enviar e-mail (plataforma)",
  description: "Envia um e-mail a um destinatário pelo serviço de e-mail da plataforma. Sempre passa por aprovação humana antes do envio.",
  category: "comunicação",
  input: z.object({
    to: z.string().trim().toLowerCase().email(),
    subject: z.string().trim().min(2).max(200),
    body: z.string().trim().min(2).max(20000).describe("Texto do e-mail"),
  }),
  risk: "high",
  requiresApproval: true,
  summarize: (i) => `Enviar e-mail para ${i.to} — assunto "${i.subject}"`,
  async availability() {
    return isEmailConfigured() ? { ok: true } : { ok: false, reason: "Envio de e-mail pendente: configure RESEND_API_KEY e EMAIL_FROM." };
  },
  async execute(_ctx, input) {
    const res = await sendEmail({ to: input.to, subject: input.subject, text: input.body });
    return res.sent ? { content: `E-mail enviado (id ${res.id}).`, data: { id: res.id } } : { content: `Envio falhou: ${res.reason}`, isError: true };
  },
});

export const gmailSend = defineTool({
  key: "gmail_send",
  name: "Enviar e-mail pelo Gmail da empresa",
  description: "Envia um e-mail pela conta Gmail conectada da empresa. Sempre passa por aprovação humana.",
  category: "comunicação",
  integration: "google",
  input: z.object({ to: z.string().trim().toLowerCase().email(), subject: z.string().trim().min(2).max(200), body: z.string().trim().min(2).max(20000) }),
  risk: "high",
  requiresApproval: true,
  summarize: (i) => `Enviar e-mail (Gmail) para ${i.to} — "${i.subject}"`,
  async availability(ctx) {
    return (await integrationStatus(ctx.orgId, "google")) === "connected" ? { ok: true } : { ok: false, reason: "Integração Google não conectada." };
  },
  async execute(ctx, input) {
    const subject = `=?UTF-8?B?${Buffer.from(input.subject).toString("base64")}?=`;
    const raw = Buffer.from(`To: ${input.to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${input.body}`).toString("base64url");
    const res = await googleApi<{ id: string }>(ctx.orgId, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw }) });
    if (!res.ok) return { content: res.error, isError: true };
    await recordIntegrationUsage(ctx.orgId, res.integrationId, "gmail.send", "ok", undefined, ctx.executionId);
    return { content: `E-mail enviado pelo Gmail (id ${res.data.id}).`, data: { id: res.data.id } };
  },
});

export const whatsappSend = defineTool({
  key: "whatsapp_send_message",
  name: "Enviar mensagem no WhatsApp",
  description:
    "Envia uma mensagem de texto pelo WhatsApp Business oficial da empresa. Só funciona dentro da janela de 24h desde a última mensagem do cliente; fora dela, use um modelo aprovado (template_name). Sempre passa por aprovação humana.",
  category: "comunicação",
  integration: "whatsapp",
  input: z.object({
    to: z.string().trim().regex(/^\+?\d{10,15}$/, "Telefone no formato internacional, só números (ex.: 5511999998888)"),
    text: z.string().trim().max(4000).optional(),
    template_name: z.string().trim().max(120).optional().describe("Nome do modelo aprovado (para fora da janela de 24h)"),
    template_language: z.string().trim().max(10).default("pt_BR"),
  }),
  risk: "high",
  requiresApproval: true,
  summarize: (i) => `WhatsApp para ${i.to}: ${i.template_name ? `modelo "${i.template_name}"` : `"${(i.text ?? "").slice(0, 80)}"`}`,
  async availability(ctx) {
    return (await integrationStatus(ctx.orgId, "whatsapp")) === "connected" ? { ok: true } : { ok: false, reason: "WhatsApp Business não conectado." };
  },
  async execute(ctx, input) {
    if (!input.text && !input.template_name) return { content: "Informe o texto ou um modelo aprovado.", isError: true };
    const integ = await getConnectedIntegration(ctx.orgId, "whatsapp");
    if (!integ) return { content: "WhatsApp Business não conectado.", isError: true };
    const version = integ.config.graph_version || GRAPH_VERSION_DEFAULT;
    const payload = input.template_name
      ? { messaging_product: "whatsapp", to: input.to.replace(/\D/g, ""), type: "template", template: { name: input.template_name, language: { code: input.template_language } } }
      : { messaging_product: "whatsapp", to: input.to.replace(/\D/g, ""), type: "text", text: { body: input.text } };
    const res = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(integ.config.phone_number_id)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${integ.secrets.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctx.signal,
    });
    const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    if (!res.ok) {
      await recordIntegrationUsage(ctx.orgId, integ.id, "whatsapp.send", "error", body.error?.message, ctx.executionId);
      return { content: `WhatsApp recusou o envio: ${body.error?.message ?? res.status}`, isError: true };
    }
    await recordIntegrationUsage(ctx.orgId, integ.id, "whatsapp.send", "ok", undefined, ctx.executionId);
    return { content: `Mensagem enviada (id ${body.messages?.[0]?.id}).`, data: { id: body.messages?.[0]?.id } };
  },
});
