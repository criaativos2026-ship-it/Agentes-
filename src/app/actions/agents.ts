"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg, withPlatform } from "@/server/db/client";
import { agentAccess, agents, agentVersions, roles } from "@/server/db/schema";
import { requirePlatformUser } from "@/server/auth/guards";
import {
  createAgent,
  ensureEditableDraft,
  publishDraft,
  publishVersion,
  setAgentStatus,
  setDraftKnowledgeBases,
  setDraftTools,
} from "@/server/agents/service";
import { sendChatMessage } from "@/server/execution/control";
import { drainQueue } from "@/server/execution/worker";
import { checkAgentSlot } from "@/server/billing/limits";
import { audit } from "@/server/audit/log";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { PROVIDERS } from "@/server/ai/models";
import { parseForm, toErrorState, UserFacingError } from "@/server/actions/result";
import { optionalText, uuidSchema } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

/** Agente → empresa (o super admin trabalha em todas; as alterações rodam no escopo da empresa dona). */
async function agentOrg(userId: string, agentId: string) {
  uuidSchema.parse(agentId);
  const [a] = await withPlatform(userId, (tx) => tx.select({ orgId: agents.organizationId, name: agents.name }).from(agents).where(eq(agents.id, agentId)));
  if (!a) throw new UserFacingError("Agente não encontrado.");
  return a.orgId;
}

const createSchema = z.object({
  organizationId: uuidSchema,
  name: z.string().trim().min(2, "Nome muito curto.").max(80),
  templateKey: optionalText(40),
});

export async function createAgentAction(_: FormState, form: FormData): Promise<FormState> {
  let id: string;
  try {
    const user = await requirePlatformUser();
    const data = parseForm(createSchema, form);
    const agent = await withOrg(data.organizationId, user.id, (tx) => createAgent(tx, user.id, data));
    id = agent.id;
  } catch (err) {
    return toErrorState(err);
  }
  revalidatePath("/admin/agentes");
  redirect(`/admin/agentes/${id}`);
}

const identitySchema = z.object({
  agentId: uuidSchema,
  name: z.string().trim().min(2).max(80),
  avatar: optionalText(8),
  category: z.string().trim().min(2).max(40),
  description: optionalText(1000),
  objective: optionalText(2000),
});

export async function updateIdentityAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requirePlatformUser();
    const d = parseForm(identitySchema, form);
    const orgId = await agentOrg(user.id, d.agentId);
    await withOrg(orgId, user.id, async (tx) => {
      await tx
        .update(agents)
        .set({ name: d.name, avatar: d.avatar ?? null, category: d.category, description: d.description ?? null, objective: d.objective ?? null, updatedAt: new Date() })
        .where(eq(agents.id, d.agentId));
      await audit(tx, { organizationId: orgId, actorUserId: user.id, action: "agent.identity_updated", summary: `Identidade do agente "${d.name}" atualizada`, entityType: "agent", entityId: d.agentId });
    });
    revalidatePath(`/admin/agentes/${d.agentId}`);
    return { ok: "Identidade salva." };
  } catch (err) {
    return toErrorState(err);
  }
}

const intelligenceSchema = z.object({
  agentId: uuidSchema,
  provider: z.enum(PROVIDERS.map((p) => p.id) as ["anthropic", "openai", "openai_compatible"]),
  model: z.string().trim().min(2).max(120).regex(/^[\w.:/-]+$/, "ID de modelo inválido."),
  systemPrompt: z.string().max(30000).default(""),
  instructions: z.string().max(30000).default(""),
  personality: z.string().max(4000).default(""),
  language: z.string().trim().min(2).max(10).default("pt-BR"),
  boundaries: z.string().max(10000).default(""),
  maxTokens: z.coerce.number().int().min(256).max(128000),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  temperature: z.coerce.number().min(0).max(2).optional(),
  maxSteps: z.coerce.number().int().min(1).max(50),
  timeoutSeconds: z.coerce.number().int().min(10).max(3600),
  maxTokensPerRun: z.coerce.number().int().min(1000).max(5_000_000),
});

export async function updateIntelligenceAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requirePlatformUser();
    const d = parseForm(intelligenceSchema, form);
    const orgId = await agentOrg(user.id, d.agentId);
    await withOrg(orgId, user.id, async (tx) => {
      const draft = await ensureEditableDraft(tx, user.id, d.agentId);
      await tx
        .update(agentVersions)
        .set({
          provider: d.provider,
          model: d.model,
          systemPrompt: d.systemPrompt,
          instructions: d.instructions,
          personality: d.personality,
          language: d.language,
          boundaries: d.boundaries,
          params: { maxTokens: d.maxTokens, effort: d.effort, temperature: d.temperature },
          limits: { maxSteps: d.maxSteps, timeoutSeconds: d.timeoutSeconds, maxTokensPerRun: d.maxTokensPerRun },
        })
        .where(eq(agentVersions.id, draft.id));
      await audit(tx, { organizationId: orgId, actorUserId: user.id, action: "agent.draft_updated", summary: `Configuração de inteligência atualizada (rascunho v${draft.version})`, entityType: "agent", entityId: d.agentId });
    });
    revalidatePath(`/admin/agentes/${d.agentId}`);
    return { ok: "Rascunho salvo. Teste e publique quando estiver pronto." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function updateToolsAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requirePlatformUser();
    const agentId = String(form.get("agentId") ?? "");
    const orgId = await agentOrg(user.id, agentId);
    const keys = form.getAll("tools").map(String);
    const tools = keys.map((key) => {
      const a = form.get(`approval:${key}`);
      return { key, requiresApproval: a === "always" ? true : a === "never" ? false : null };
    });
    await withOrg(orgId, user.id, async (tx) => {
      const draft = await setDraftTools(tx, user.id, agentId, tools);
      await audit(tx, { organizationId: orgId, actorUserId: user.id, action: "agent.tools_updated", summary: `Ferramentas do rascunho v${draft.version}: ${keys.join(", ") || "nenhuma"}`, entityType: "agent", entityId: agentId });
    });
    revalidatePath(`/admin/agentes/${agentId}`);
    return { ok: "Ferramentas salvas no rascunho." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function updateKnowledgeAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requirePlatformUser();
    const agentId = String(form.get("agentId") ?? "");
    const orgId = await agentOrg(user.id, agentId);
    const ids = form.getAll("kb").map(String);
    ids.forEach((i) => uuidSchema.parse(i));
    await withOrg(orgId, user.id, (tx) => setDraftKnowledgeBases(tx, user.id, agentId, ids));
    revalidatePath(`/admin/agentes/${agentId}`);
    return { ok: "Bases de conhecimento salvas no rascunho." };
  } catch (err) {
    return toErrorState(err);
  }
}

/** Quem pode usar o agente (vazio = todos com permissão de usar agentes). */
export async function updateAccessAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requirePlatformUser();
    const agentId = String(form.get("agentId") ?? "");
    const orgId = await agentOrg(user.id, agentId);
    const roleIds = form.getAll("role").map(String);
    roleIds.forEach((i) => uuidSchema.parse(i));
    await withOrg(orgId, user.id, async (tx) => {
      if (roleIds.length) {
        const valid = await tx.select({ id: roles.id, org: roles.organizationId }).from(roles);
        for (const r of roleIds) {
          const v = valid.find((x) => x.id === r);
          if (!v || (v.org && v.org !== orgId)) throw new UserFacingError("Papel inválido.");
        }
      }
      await tx.delete(agentAccess).where(eq(agentAccess.agentId, agentId));
      if (roleIds.length) await tx.insert(agentAccess).values(roleIds.map((roleId) => ({ organizationId: orgId, agentId, roleId })));
      await audit(tx, { organizationId: orgId, actorUserId: user.id, action: "agent.access_updated", summary: roleIds.length ? `Acesso ao agente restrito a ${roleIds.length} papel(éis)` : "Acesso ao agente liberado para todos que usam agentes", entityType: "agent", entityId: agentId });
    });
    revalidatePath(`/admin/agentes/${agentId}`);
    return { ok: "Permissões de acesso salvas." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function publishAgentAction(agentId: string, notes?: string): Promise<FormState> {
  try {
    const user = await requirePlatformUser();
    const orgId = await agentOrg(user.id, agentId);
    const v = await withOrg(orgId, user.id, async (tx) => {
      const [a] = await tx.select({ status: agents.status }).from(agents).where(eq(agents.id, agentId));
      if (a.status !== "published") {
        const slot = await checkAgentSlot(tx, orgId);
        if (!slot.ok) throw new UserFacingError(slot.reason);
      }
      return publishDraft(tx, user.id, agentId, notes?.slice(0, 500));
    });
    revalidatePath(`/admin/agentes/${agentId}`);
    return { ok: `Versão ${v.version} publicada. O cliente já pode usar o agente.` };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function publishVersionAction(agentId: string, versionId: string): Promise<FormState> {
  try {
    const user = await requirePlatformUser();
    uuidSchema.parse(versionId);
    const orgId = await agentOrg(user.id, agentId);
    await withOrg(orgId, user.id, (tx) => publishVersion(tx, user.id, agentId, versionId));
    revalidatePath(`/admin/agentes/${agentId}`);
    return { ok: "Versão publicada." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function setAgentStatusAction(agentId: string, status: "testing" | "published" | "disabled"): Promise<FormState> {
  try {
    const user = await requirePlatformUser();
    z.enum(["testing", "published", "disabled"]).parse(status);
    const orgId = await agentOrg(user.id, agentId);
    await withOrg(orgId, user.id, (tx) => setAgentStatus(tx, user.id, agentId, status));
    revalidatePath(`/admin/agentes/${agentId}`);
    return { ok: status === "disabled" ? "Agente desativado." : status === "published" ? "Agente reativado." : "Agente marcado como em testes." };
  } catch (err) {
    return toErrorState(err);
  }
}

/** Área de testes: conversa com o RASCUNHO (não consome cota do cliente, marcada como teste). */
export async function sendTestMessageAction(input: { agentId: string; conversationId?: string; text: string; clientRequestId: string }) {
  try {
    const user = await requirePlatformUser();
    const text = z.string().trim().min(1, "Escreva uma mensagem.").max(20000).parse(input.text);
    const orgId = await agentOrg(user.id, input.agentId);
    const lim = await hitRateLimit(`chat-test:${user.id}`, 30, 60);
    if (!lim.allowed) throw new UserFacingError("Muitas mensagens em pouco tempo. Aguarde um minuto.");
    const res = await withOrg(orgId, user.id, async (tx) => {
      const draft = await ensureEditableDraft(tx, user.id, input.agentId);
      return sendChatMessage(tx, { orgId, userId: user.id, agentId: input.agentId, version: draft, conversationId: input.conversationId, text, isTest: true, clientRequestId: input.clientRequestId });
    });
    after(() => drainQueue({ budgetMs: 280_000, onlyId: res.executionId }).catch((e) => console.error("[after] falha ao processar", e)));
    return { ok: true as const, ...res };
  } catch (err) {
    return { ok: false as const, ...toErrorState(err) };
  }
}

export async function deleteTestConversationsAction(agentId: string): Promise<FormState> {
  try {
    const user = await requirePlatformUser();
    const orgId = await agentOrg(user.id, agentId);
    const { conversations } = await import("@/server/db/schema");
    await withOrg(orgId, user.id, (tx) => tx.delete(conversations).where(and(eq(conversations.agentId, agentId), eq(conversations.isTest, true))));
    revalidatePath(`/admin/agentes/${agentId}`);
    return { ok: "Conversas de teste apagadas." };
  } catch (err) {
    return toErrorState(err);
  }
}
