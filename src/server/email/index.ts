import "server-only";

/**
 * E-mail transacional via Resend (API REST oficial: https://resend.com/docs/api-reference/emails/send-email).
 * Sem RESEND_API_KEY o envio fica PENDENTE: as funções retornam { sent: false, reason } e NUNCA fingem envio.
 */
export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export type EmailResult = { sent: true; id: string } | { sent: false; reason: string };

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string }): Promise<EmailResult> {
  if (!isEmailConfigured()) return { sent: false, reason: "Envio de e-mail não configurado (RESEND_API_KEY / EMAIL_FROM)." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [input.to], subject: input.subject, text: input.text, html: input.html }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) return { sent: false, reason: body.message ?? `Falha no envio (HTTP ${res.status}).` };
    return { sent: true, id: body.id };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Falha de rede no envio." };
  }
}
