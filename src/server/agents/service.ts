import "server-only";
import { and, desc, eq, inArray, like, max } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { agentKnowledgeBases, agents, agentTemplates, agentTools, agentVersions, knowledgeBases, type AgentVersion } from "@/server/db/schema";
import { DEFAULT_LIMITS } from "@/server/db/schema";
import { DEFAULT_MODEL } from "@/server/ai/models";
import { getTool } from "@/server/tools/registry";
import { audit } from "@/server/audit/log";
import { UserFacingError } from "@/server/errors";
import { slugify } from "@/lib/validation";

async function uniqueAgentSlug(tx: Tx, orgId: string, name: string) {
  const base = slugify(name);
  const taken = new Set((await tx.select({ s: agents.slug }).from(agents).where(and(eq(agents.organizationId, orgId), like(agents.slug, `${base}%`)))).map((r) => r.s));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** Cria o agente com a versão 1 (rascunho). Opcionalmente parte de um modelo do catálogo. */
export async function createAgent(tx: Tx, actorUserId: string, input: { organizationId: string; name: string; category?: string; templateKey?: string }) {
  let template: typeof agentTemplates.$inferSelect | undefined;
  if (input.templateKey) {
    [template] = await tx.select().from(agentTemplates).where(eq(agentTemplates.key, input.templateKey));
    if (!template) throw new UserFacingError("Modelo de agente não encontrado.");
  }
  const [agent] = await tx
    .insert(agents)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      slug: await uniqueAgentSlug(tx, input.organizationId, input.name),
      category: input.category ?? template?.category ?? "personalizado",
      description: template?.description,
      objective: template?.objective,
      templateKey: template?.key,
      createdBy: actorUserId,
    })
    .returning();
  const [version] = await tx
    .insert(agentVersions)
    .values({
      organizationId: input.organizationId,
      agentId: agent.id,
      version: 1,
      provider: "anthropic",
      model: DEFAULT_MODEL,
      systemPrompt: template?.systemPrompt ?? "",
      personality: template?.personality ?? "",
      params: { maxTokens: 16000, effort: "medium" },
      limits: DEFAULT_LIMITS,
      createdBy: actorUserId,
    })
    .returning();
  const suggested = (template?.suggestedTools ?? []).filter((k) => getTool(k));
  if (suggested.length) await tx.insert(agentTools).values(suggested.map((toolKey) => ({ organizationId: input.organizationId, agentVersionId: version.id, toolKey })));
  await tx.update(agents).set({ draftVersionId: version.id }).where(eq(agents.id, agent.id));
  await audit(tx, { organizationId: input.organizationId, actorUserId, action: "agent.created", summary: `Agente "${agent.name}" criado${template ? ` a partir do modelo "${template.name}"` : ""}`, entityType: "agent", entityId: agent.id });
  return { ...agent, draftVersionId: version.id };
}

/**
 * Devolve uma versão de rascunho EDITÁVEL. Se o rascunho atual já foi publicado (travado),
 * cria uma nova versão copiando configuração, ferramentas e bases.
 */
export async function ensureEditableDraft(tx: Tx, actorUserId: string, agentId: string): Promise<AgentVersion> {
  const [agent] = await tx.select().from(agents).where(eq(agents.id, agentId));
  if (!agent) throw new UserFacingError("Agente não encontrado.");
  const sourceId = agent.draftVersionId ?? agent.publishedVersionId;
  const [source] = sourceId ? await tx.select().from(agentVersions).where(eq(agentVersions.id, sourceId)) : [];
  if (source && !source.lockedAt) return source;
  const [{ v }] = await tx.select({ v: max(agentVersions.version) }).from(agentVersions).where(eq(agentVersions.agentId, agentId));
  const [draft] = await tx
    .insert(agentVersions)
    .values({
      organizationId: agent.organizationId,
      agentId,
      version: (v ?? 0) + 1,
      provider: source?.provider ?? "anthropic",
      model: source?.model ?? DEFAULT_MODEL,
      systemPrompt: source?.systemPrompt ?? "",
      instructions: source?.instructions ?? "",
      personality: source?.personality ?? "",
      language: source?.language ?? "pt-BR",
      boundaries: source?.boundaries ?? "",
      params: source?.params ?? { maxTokens: 16000, effort: "medium" },
      limits: source?.limits ?? DEFAULT_LIMITS,
      createdBy: actorUserId,
    })
    .returning();
  if (source) {
    const tools = await tx.select().from(agentTools).where(eq(agentTools.agentVersionId, source.id));
    if (tools.length) await tx.insert(agentTools).values(tools.map((t) => ({ organizationId: t.organizationId, agentVersionId: draft.id, toolKey: t.toolKey, config: t.config, requiresApproval: t.requiresApproval })));
    const kbs = await tx.select().from(agentKnowledgeBases).where(eq(agentKnowledgeBases.agentVersionId, source.id));
    if (kbs.length) await tx.insert(agentKnowledgeBases).values(kbs.map((k) => ({ organizationId: k.organizationId, agentVersionId: draft.id, knowledgeBaseId: k.knowledgeBaseId })));
  }
  await tx.update(agents).set({ draftVersionId: draft.id, updatedAt: new Date() }).where(eq(agents.id, agentId));
  return draft;
}

export async function setDraftTools(tx: Tx, actorUserId: string, agentId: string, tools: { key: string; requiresApproval: boolean | null }[]) {
  const draft = await ensureEditableDraft(tx, actorUserId, agentId);
  for (const t of tools) if (!getTool(t.key)) throw new UserFacingError(`Ferramenta desconhecida: ${t.key}`);
  await tx.delete(agentTools).where(eq(agentTools.agentVersionId, draft.id));
  if (tools.length) await tx.insert(agentTools).values(tools.map((t) => ({ organizationId: draft.organizationId, agentVersionId: draft.id, toolKey: t.key, requiresApproval: t.requiresApproval })));
  return draft;
}

export async function setDraftKnowledgeBases(tx: Tx, actorUserId: string, agentId: string, kbIds: string[]) {
  const draft = await ensureEditableDraft(tx, actorUserId, agentId);
  if (kbIds.length) {
    // Só bases da MESMA empresa do agente (o RLS também impede, mas a mensagem fica clara).
    const valid = await tx.select({ id: knowledgeBases.id }).from(knowledgeBases).where(and(inArray(knowledgeBases.id, kbIds), eq(knowledgeBases.organizationId, draft.organizationId)));
    if (valid.length !== kbIds.length) throw new UserFacingError("Base de conhecimento inválida para esta empresa.");
  }
  await tx.delete(agentKnowledgeBases).where(eq(agentKnowledgeBases.agentVersionId, draft.id));
  if (kbIds.length) await tx.insert(agentKnowledgeBases).values(kbIds.map((id) => ({ organizationId: draft.organizationId, agentVersionId: draft.id, knowledgeBaseId: id })));
  return draft;
}

/** Publica o rascunho atual: trava a versão (imutável) e a torna a versão em produção. */
export async function publishDraft(tx: Tx, actorUserId: string, agentId: string, notes?: string) {
  const [agent] = await tx.select().from(agents).where(eq(agents.id, agentId));
  if (!agent?.draftVersionId) throw new UserFacingError("Nada para publicar.");
  const [draft] = await tx.select().from(agentVersions).where(eq(agentVersions.id, agent.draftVersionId));
  if (draft.lockedAt && agent.publishedVersionId === draft.id && agent.status === "published") throw new UserFacingError("Esta versão já está publicada.");
  if (!draft.systemPrompt.trim() && !draft.instructions.trim()) throw new UserFacingError("Defina o prompt de sistema ou as instruções antes de publicar.");
  if (!draft.lockedAt) await tx.update(agentVersions).set({ lockedAt: new Date(), notes: notes ?? draft.notes }).where(eq(agentVersions.id, draft.id));
  await tx.update(agents).set({ publishedVersionId: draft.id, status: "published", publishedAt: new Date(), updatedAt: new Date() }).where(eq(agents.id, agentId));
  await audit(tx, { organizationId: agent.organizationId, actorUserId, action: "agent.published", summary: `Agente "${agent.name}" publicado (versão ${draft.version})`, entityType: "agent", entityId: agentId, metadata: { version: draft.version } });
  return draft;
}

/** Volta a uma versão anterior: ela vira a publicada (sem alterar o rascunho). */
export async function publishVersion(tx: Tx, actorUserId: string, agentId: string, versionId: string) {
  const [agent] = await tx.select().from(agents).where(eq(agents.id, agentId));
  const [v] = await tx.select().from(agentVersions).where(and(eq(agentVersions.id, versionId), eq(agentVersions.agentId, agentId)));
  if (!agent || !v) throw new UserFacingError("Versão não encontrada.");
  if (!v.lockedAt) await tx.update(agentVersions).set({ lockedAt: new Date() }).where(eq(agentVersions.id, v.id));
  await tx.update(agents).set({ publishedVersionId: v.id, status: "published", publishedAt: new Date(), updatedAt: new Date() }).where(eq(agents.id, agentId));
  await audit(tx, { organizationId: agent.organizationId, actorUserId, action: "agent.version_restored", summary: `Agente "${agent.name}": versão ${v.version} publicada novamente`, entityType: "agent", entityId: agentId });
}

export async function setAgentStatus(tx: Tx, actorUserId: string, agentId: string, status: "draft" | "testing" | "published" | "disabled") {
  const [agent] = await tx.select().from(agents).where(eq(agents.id, agentId));
  if (!agent) throw new UserFacingError("Agente não encontrado.");
  if (status === "published" && !agent.publishedVersionId) throw new UserFacingError("Publique uma versão primeiro.");
  await tx.update(agents).set({ status, updatedAt: new Date() }).where(eq(agents.id, agentId));
  await audit(tx, { organizationId: agent.organizationId, actorUserId, action: `agent.status_${status}`, summary: `Agente "${agent.name}": status alterado para ${status}`, entityType: "agent", entityId: agentId });
}

export async function listVersions(tx: Tx, agentId: string) {
  return tx.select().from(agentVersions).where(eq(agentVersions.agentId, agentId)).orderBy(desc(agentVersions.version));
}
