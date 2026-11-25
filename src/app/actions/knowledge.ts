"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "@/server/db/client";
import { agentKnowledgeBases, knowledgeBases, knowledgeDocuments } from "@/server/db/schema";
import { assertOrgPermission } from "@/server/auth/guards";
import { ingestDocument } from "@/server/knowledge/ingest";
import { searchKnowledge } from "@/server/knowledge/search";
import { MAX_UPLOAD_BYTES } from "@/server/knowledge/extract";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { audit } from "@/server/audit/log";
import { parseForm, toErrorState, UserFacingError } from "@/server/actions/result";
import { optionalText, uuidSchema } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

async function kbOf(orgId: string, userId: string, kbId: string) {
  uuidSchema.parse(kbId);
  const [kb] = await withOrg(orgId, userId, (tx) => tx.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId)));
  if (!kb) throw new UserFacingError("Base de conhecimento não encontrada.");
  return kb;
}

export async function createKnowledgeBaseAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const d = parseForm(z.object({ slug: z.string(), name: z.string().trim().min(2).max(120), description: optionalText(500) }), form);
    const ctx = await assertOrgPermission(d.slug, "knowledge.manage");
    await withOrg(ctx.org.id, ctx.user.id, async (tx) => {
      const [kb] = await tx.insert(knowledgeBases).values({ organizationId: ctx.org.id, name: d.name, description: d.description, createdBy: ctx.user.id }).returning({ id: knowledgeBases.id });
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, action: "knowledge.base_created", summary: `Base de conhecimento "${d.name}" criada`, entityType: "knowledge_base", entityId: kb.id });
    });
    revalidatePath(`/app/${ctx.org.slug}/conhecimento`);
    return { ok: "Base criada." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function uploadDocumentAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const slug = String(form.get("slug") ?? "");
    const ctx = await assertOrgPermission(slug, "knowledge.manage");
    const kb = await kbOf(ctx.org.id, ctx.user.id, String(form.get("knowledgeBaseId") ?? ""));
    const lim = await hitRateLimit(`upload:${ctx.user.id}`, 60, 3600);
    if (!lim.allowed) throw new UserFacingError("Muitos envios em pouco tempo. Tente mais tarde.");
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new UserFacingError("Selecione ao menos um arquivo.");
    if (files.length > 10) throw new UserFacingError("Envie no máximo 10 arquivos por vez.");
    const results: string[] = [];
    for (const f of files) {
      if (f.size > MAX_UPLOAD_BYTES) throw new UserFacingError(`"${f.name}" passa de 10 MB.`);
      const r = await ingestDocument({ orgId: ctx.org.id, userId: ctx.user.id, knowledgeBaseId: kb.id, title: f.name.slice(0, 200), source: "upload", fileName: f.name, mime: f.type, bytes: Buffer.from(await f.arrayBuffer()) });
      results.push(`${f.name}: ${r.chunks} trechos${r.embedded ? " (com busca vetorial)" : ""}`);
    }
    revalidatePath(`/app/${ctx.org.slug}/conhecimento`);
    return { ok: `Processado: ${results.join("; ")}` };
  } catch (err) {
    return toErrorState(err);
  }
}

const textSchema = z.object({
  slug: z.string(),
  knowledgeBaseId: uuidSchema,
  title: z.string().trim().min(2).max(200),
  kind: z.enum(["text", "faq"]),
  content: z.string().trim().min(10, "Conteúdo muito curto.").max(500_000),
});

export async function addTextDocumentAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const d = parseForm(textSchema, form);
    const ctx = await assertOrgPermission(d.slug, "knowledge.manage");
    const kb = await kbOf(ctx.org.id, ctx.user.id, d.knowledgeBaseId);
    let text = d.content;
    if (d.kind === "faq") {
      // Formato: linhas "P: pergunta" e "R: resposta" → cada par vira um bloco (um trecho de busca).
      const pairs: string[] = [];
      let q = "";
      for (const line of d.content.split(/\r?\n/)) {
        const m = line.match(/^\s*([PR])\s*[:\-]\s*(.*)$/i);
        if (m && m[1].toUpperCase() === "P") q = m[2];
        else if (m && m[1].toUpperCase() === "R" && q) {
          pairs.push(`Pergunta: ${q}\nResposta: ${m[2]}`);
          q = "";
        }
      }
      if (!pairs.length) throw new UserFacingError('Use linhas "P: pergunta" seguidas de "R: resposta".');
      text = pairs.join("\n\n");
    }
    const r = await ingestDocument({ orgId: ctx.org.id, userId: ctx.user.id, knowledgeBaseId: kb.id, title: d.title, source: d.kind, text });
    revalidatePath(`/app/${ctx.org.slug}/conhecimento`);
    return { ok: `Adicionado (${r.chunks} trechos).` };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function deleteDocumentAction(slug: string, documentId: string): Promise<FormState> {
  try {
    const ctx = await assertOrgPermission(slug, "knowledge.manage");
    uuidSchema.parse(documentId);
    await withOrg(ctx.org.id, ctx.user.id, async (tx) => {
      const [doc] = await tx.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId)).returning({ title: knowledgeDocuments.title });
      if (!doc) throw new UserFacingError("Documento não encontrado.");
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, action: "knowledge.document_deleted", summary: `Documento "${doc.title}" removido` });
    });
    revalidatePath(`/app/${ctx.org.slug}/conhecimento`);
    return { ok: "Documento removido." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function deleteKnowledgeBaseAction(slug: string, kbId: string): Promise<FormState> {
  try {
    const ctx = await assertOrgPermission(slug, "knowledge.manage");
    const kb = await kbOf(ctx.org.id, ctx.user.id, kbId);
    await withOrg(ctx.org.id, ctx.user.id, async (tx) => {
      const [used] = await tx.select({ n: count() }).from(agentKnowledgeBases).where(eq(agentKnowledgeBases.knowledgeBaseId, kb.id));
      if (Number(used.n) > 0) throw new UserFacingError("Esta base está vinculada a agentes. Desvincule no Construtor antes de excluir.");
      await tx.delete(knowledgeBases).where(and(eq(knowledgeBases.id, kb.id), eq(knowledgeBases.organizationId, ctx.org.id)));
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, action: "knowledge.base_deleted", summary: `Base "${kb.name}" excluída` });
    });
    revalidatePath(`/app/${ctx.org.slug}/conhecimento`);
    return { ok: "Base excluída." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function searchTestAction(slug: string, kbId: string, query: string) {
  try {
    const ctx = await assertOrgPermission(slug, "knowledge.view");
    const kb = await kbOf(ctx.org.id, ctx.user.id, kbId);
    const q = z.string().trim().min(2).max(300).parse(query);
    const hits = await searchKnowledge(ctx.org.id, [kb.id], q, 5);
    return { ok: true as const, hits: hits.map((h) => ({ title: h.title, method: h.method, content: h.content.slice(0, 600) })) };
  } catch (err) {
    return { ok: false as const, ...toErrorState(err) };
  }
}
