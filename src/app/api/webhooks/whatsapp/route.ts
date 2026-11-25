import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { withOrg, withPlatform } from "@/server/db/client";
import { agents, agentVersions, conversations, integrations, messages } from "@/server/db/schema";
import { enqueueExecution } from "@/server/execution/queue";
import { recordIntegrationUsage } from "@/server/integrations/store";
import { safeEqual } from "@/server/security/crypto";

/** Verificação do webhook pela Meta (GET com hub.challenge). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && u.searchParams.get("hub.mode") === "subscribe" && safeEqual(u.searchParams.get("hub.verify_token") ?? "", token)) {
    return new NextResponse(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

type WaPayload = { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; messages?: { id: string; from: string; type: string; text?: { body?: string } }[]; contacts?: { profile?: { name?: string } }[] } }[] }[] };

/**
 * Mensagens recebidas. A assinatura X-Hub-Signature-256 (HMAC com WHATSAPP_APP_SECRET) é obrigatória.
 * Cada mensagem vira uma conversa (canal whatsapp) e, se a empresa definiu um "agente de entrada"
 * na integração, uma execução para esse agente. Respostas pelo WhatsApp passam por aprovação humana.
 */
export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  if (!secret || !safeEqual(sig, `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }
  const payload = JSON.parse(raw) as WaPayload;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      const phoneId = v?.metadata?.phone_number_id;
      if (!phoneId || !v?.messages?.length) continue;
      // Descobre a empresa dona do número (leitura de sistema, filtrada pelo ID do número).
      const [integ] = await withPlatform(null, (tx) =>
        tx.select({ id: integrations.id, orgId: integrations.organizationId, config: integrations.config }).from(integrations).where(and(eq(integrations.providerKey, "whatsapp"), eq(integrations.status, "connected"), sql`${integrations.config}->>'phone_number_id' = ${phoneId}`)).limit(1),
      );
      if (!integ) continue;
      for (const m of v.messages) {
        const text = m.type === "text" ? (m.text?.body ?? "") : `[mensagem do tipo ${m.type}]`;
        await withOrg(integ.orgId, null, async (tx) => {
          const agentId = integ.config.inbound_agent_id;
          const [agent] = agentId ? await tx.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.status, "published"))) : [];
          if (!agent?.publishedVersionId) return;
          const [conv] = await tx.insert(conversations).values({ organizationId: integ.orgId, agentId: agent.id, channel: "whatsapp", title: `WhatsApp ${m.from}` }).returning({ id: conversations.id });
          const [ver] = await tx.select().from(agentVersions).where(eq(agentVersions.id, agent.publishedVersionId));
          const { execution, duplicate } = await enqueueExecution(tx, {
            organizationId: integ.orgId,
            agentId: agent.id,
            agentVersionId: ver.id,
            conversationId: conv.id,
            triggeredBy: null,
            kind: "chat",
            input: { message: `Mensagem recebida no WhatsApp de ${m.from}:\n${text}\n\nSe for responder, use whatsapp_send_message para o número ${m.from}.` },
            idempotencyKey: `wa:${m.id}`,
            timeoutSeconds: ver.limits.timeoutSeconds,
          });
          if (!duplicate) await tx.insert(messages).values({ organizationId: integ.orgId, conversationId: conv.id, role: "user", content: [{ type: "text", text }], executionId: execution.id });
        });
        await recordIntegrationUsage(integ.orgId, integ.id, "whatsapp.inbound", "ok");
      }
    }
  }
  return NextResponse.json({ ok: true });
}
