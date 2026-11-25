import "server-only";
import { OpenAIProvider } from "@/server/ai/providers/openai";
import { resolveProvider } from "@/server/ai/credentials";
import { EMBEDDING_DIMENSIONS } from "@/server/db/schema";

/**
 * Embeddings para a busca vetorial. Provedor: OpenAI (a Anthropic não oferece API de embeddings).
 * Modelo configurável por EMBEDDING_MODEL (padrão text-embedding-3-small, 1536 dimensões).
 * Sem chave OpenAI configurada, a busca usa só texto completo — e isso é informado na interface.
 */
const MODEL = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";

async function client(orgId: string) {
  if (process.env.NEXUS_E2E_FAKE_LLM === "1") return null;
  const resolved = await resolveProvider(orgId, "openai");
  if (!resolved) return null;
  return resolved.provider instanceof OpenAIProvider ? resolved.provider : null;
}

export async function embeddingsAvailable(orgId: string) {
  return (await client(orgId)) !== null;
}

export async function embedTexts(orgId: string, texts: string[]): Promise<{ vectors: number[][]; tokens: number } | null> {
  const provider = await client(orgId);
  if (!provider || texts.length === 0) return null;
  return provider.embed(texts, MODEL, EMBEDDING_DIMENSIONS);
}
