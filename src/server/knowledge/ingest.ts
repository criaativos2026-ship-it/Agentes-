import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { withOrg } from "@/server/db/client";
import { knowledgeChunks, knowledgeDocuments, usageRecords } from "@/server/db/schema";
import { sha256 } from "@/server/security/crypto";
import { audit } from "@/server/audit/log";
import { UserFacingError } from "@/server/errors";
import { periodOf } from "@/lib/format";
import { chunkTable, chunkText, extractText, fileKind } from "./extract";
import { embedTexts } from "./embeddings";

/**
 * Ingestão: extrai o texto, divide em trechos e (se houver provedor) gera embeddings.
 * O arquivo original NÃO é guardado — só o texto extraído (minimização de dados).
 */
export async function ingestDocument(input: {
  orgId: string;
  userId: string;
  knowledgeBaseId: string;
  title: string;
  source: "upload" | "text" | "faq";
  fileName?: string;
  mime?: string;
  bytes?: Buffer;
  text?: string;
}) {
  const hash = sha256(input.bytes ?? input.text ?? "");
  const [doc] = await withOrg(input.orgId, input.userId, async (tx) => {
    const dup = await tx.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.knowledgeBaseId, input.knowledgeBaseId), eq(knowledgeDocuments.sha256, hash)));
    if (dup.length) throw new UserFacingError("Este conteúdo já está nesta base.");
    return tx
      .insert(knowledgeDocuments)
      .values({
        organizationId: input.orgId,
        knowledgeBaseId: input.knowledgeBaseId,
        title: input.title,
        sourceType: input.source,
        mimeType: input.mime ?? (input.source === "upload" ? null : "text/plain"),
        sizeBytes: input.bytes?.byteLength ?? Buffer.byteLength(input.text ?? ""),
        sha256: hash,
        status: "processing",
        createdBy: input.userId,
      })
      .returning();
  });
  try {
    let pieces: string[];
    if (input.bytes && input.fileName) {
      const ex = await extractText(input.fileName, input.mime ?? "", input.bytes);
      pieces = ex.kind === "table" ? chunkTable(ex.header!, ex.rows!) : chunkText(ex.text);
      if (ex.kind === "text" && !ex.text) throw new Error("Nenhum texto encontrado no arquivo (PDF escaneado precisa de OCR).");
    } else {
      pieces = chunkText(input.text ?? "");
    }
    if (!pieces.length) throw new Error("Documento sem conteúdo.");
    if (pieces.length > 5000) throw new Error("Documento grande demais (mais de 5.000 trechos).");

    let vectors: number[][] | null = null;
    let embedError: string | null = null;
    try {
      const all: number[][] = [];
      let tokens = 0;
      for (let i = 0; i < pieces.length; i += 64) {
        const r = await embedTexts(input.orgId, pieces.slice(i, i + 64));
        if (!r) break;
        all.push(...r.vectors);
        tokens += r.tokens;
      }
      if (all.length === pieces.length) {
        vectors = all;
        await withOrg(input.orgId, input.userId, (tx) =>
          tx.insert(usageRecords).values({ organizationId: input.orgId, kind: "embedding", provider: "openai", model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small", tokensIn: tokens, period: periodOf() }),
        );
      }
    } catch (err) {
      embedError = err instanceof Error ? err.message : "falha nos embeddings";
    }

    await withOrg(input.orgId, input.userId, async (tx) => {
      for (let i = 0; i < pieces.length; i += 200) {
        await tx.insert(knowledgeChunks).values(
          pieces.slice(i, i + 200).map((content, j) => ({
            organizationId: input.orgId,
            knowledgeBaseId: input.knowledgeBaseId,
            documentId: doc.id,
            ordinal: i + j,
            content,
            embedding: vectors ? vectors[i + j] : null,
            tokenEstimate: Math.ceil(content.length / 4),
          })),
        );
      }
      await tx
        .update(knowledgeDocuments)
        .set({ status: "ready", chunkCount: pieces.length, embedded: vectors ? pieces.length : 0, error: embedError ? `Busca vetorial indisponível: ${embedError}` : null })
        .where(eq(knowledgeDocuments.id, doc.id));
      await audit(tx, { organizationId: input.orgId, actorUserId: input.userId, action: "knowledge.document_added", summary: `Documento "${input.title}" adicionado (${pieces.length} trechos)`, entityType: "document", entityId: doc.id });
    });
    return { id: doc.id, chunks: pieces.length, embedded: Boolean(vectors) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha ao processar.";
    await withOrg(input.orgId, input.userId, (tx) => tx.update(knowledgeDocuments).set({ status: "error", error: msg }).where(eq(knowledgeDocuments.id, doc.id)));
    throw new UserFacingError(`Não foi possível processar "${input.title}": ${msg}`);
  }
}

/** Texto completo reconstruído (para a ferramenta de análise de tabelas). */
export async function documentChunks(orgId: string, documentId: string) {
  return withOrg(orgId, null, (tx) => tx.select({ content: knowledgeChunks.content }).from(knowledgeChunks).where(eq(knowledgeChunks.documentId, documentId)).orderBy(asc(knowledgeChunks.ordinal)));
}

export { fileKind };
