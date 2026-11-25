import "server-only";
import { sql } from "drizzle-orm";
import { withOrg } from "@/server/db/client";
import { embedTexts } from "./embeddings";

export type KnowledgeHit = { chunkId: string; documentId: string; title: string; content: string; score: number; method: "texto" | "vetorial" | "híbrida" };

/**
 * Busca nos trechos das bases autorizadas (sempre dentro da empresa — RLS).
 * Híbrida quando há embeddings: combina posição no ranking textual e vetorial (Reciprocal Rank Fusion).
 */
export async function searchKnowledge(orgId: string, knowledgeBaseIds: string[], query: string, limit = 6): Promise<KnowledgeHit[]> {
  if (!knowledgeBaseIds.length || !query.trim()) return [];
  const q = query.slice(0, 500);
  let queryVector: number[] | null = null;
  try {
    queryVector = (await embedTexts(orgId, [q]))?.vectors[0] ?? null;
  } catch {
    queryVector = null; // falha no provedor de embeddings não impede a busca textual
  }
  return withOrg(orgId, null, async (tx) => {
    const kbList = sql.join(knowledgeBaseIds.map((id) => sql`${id}::uuid`), sql`, `);
    const text = await tx.execute<{ id: string; document_id: string; title: string; content: string; rank: number }>(sql`
      select c.id, c.document_id, d.title, c.content,
             ts_rank_cd(c.tsv, websearch_to_tsquery('portuguese', ${q})) as rank
      from knowledge_chunks c join knowledge_documents d on d.id = c.document_id
      where c.knowledge_base_id in (${kbList}) and d.status = 'ready'
        and c.tsv @@ websearch_to_tsquery('portuguese', ${q})
      order by rank desc limit ${limit * 2}`);
    let textRows = [...text];
    if (textRows.length === 0) {
      // Sem correspondência exata: tenta com OR entre as palavras (consulta mais permissiva).
      const words = q.normalize("NFKC").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2).slice(0, 12);
      if (words.length) {
        const orQuery = words.join(" | ");
        const loose = await tx.execute<{ id: string; document_id: string; title: string; content: string; rank: number }>(sql`
          select c.id, c.document_id, d.title, c.content, ts_rank_cd(c.tsv, to_tsquery('portuguese', ${orQuery})) as rank
          from knowledge_chunks c join knowledge_documents d on d.id = c.document_id
          where c.knowledge_base_id in (${kbList}) and d.status = 'ready' and c.tsv @@ to_tsquery('portuguese', ${orQuery})
          order by rank desc limit ${limit * 2}`);
        textRows = [...loose];
      }
    }
    let vecRows: { id: string; document_id: string; title: string; content: string; distance: number }[] = [];
    if (queryVector) {
      const vec = `[${queryVector.join(",")}]`;
      vecRows = [
        ...(await tx.execute<{ id: string; document_id: string; title: string; content: string; distance: number }>(sql`
          select c.id, c.document_id, d.title, c.content, c.embedding <=> ${vec}::vector as distance
          from knowledge_chunks c join knowledge_documents d on d.id = c.document_id
          where c.knowledge_base_id in (${kbList}) and d.status = 'ready' and c.embedding is not null
          order by c.embedding <=> ${vec}::vector limit ${limit * 2}`)),
      ];
    }
    const scores = new Map<string, KnowledgeHit>();
    const add = (rows: { id: string; document_id: string; title: string; content: string }[], method: "texto" | "vetorial") =>
      rows.forEach((r, i) => {
        const prev = scores.get(r.id);
        const s = 1 / (60 + i + 1);
        scores.set(r.id, { chunkId: r.id, documentId: r.document_id, title: r.title, content: r.content, score: (prev?.score ?? 0) + s, method: prev ? "híbrida" : method });
      });
    add(textRows, "texto");
    add(vecRows, "vetorial");
    return [...scores.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  });
}
