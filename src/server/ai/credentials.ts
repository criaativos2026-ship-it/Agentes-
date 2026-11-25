import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { withOrg, withPlatform } from "@/server/db/client";
import { aiProviderCredentials } from "@/server/db/schema";
import { decryptSecret, encryptSecret, keyHint } from "@/server/security/crypto";
import { audit } from "@/server/audit/log";
import { UserFacingError } from "@/server/errors";
import type { LLMProvider, ProviderId } from "./types";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenAIProvider } from "./providers/openai";
import { PROVIDERS } from "./models";

const aad = (orgId: string | null, provider: string) => `ai:${orgId ?? "platform"}:${provider}`;

export type ResolvedProvider = { provider: LLMProvider; source: "org" | "platform" | "env"; keyHint: string };

type Factory = (id: ProviderId, apiKey: string, baseUrl?: string | null) => LLMProvider;
const defaultFactory: Factory = (id, apiKey, baseUrl) =>
  id === "anthropic" ? new AnthropicProvider(apiKey, baseUrl ?? undefined) : new OpenAIProvider(id, apiKey, baseUrl ?? undefined);
let factory: Factory = defaultFactory;

/** Somente para testes automatizados: substitui a criação de provedores por um dublê. */
export function __setProviderFactoryForTests(f: Factory | null) {
  if (process.env.NODE_ENV === "production" && !process.env.NEXUS_E2E_FAKE_LLM) throw new Error("Indisponível em produção.");
  factory = f ?? defaultFactory;
}

/**
 * Descobre qual chave usar para a empresa: chave própria da empresa > chave da plataforma (banco) > variável de ambiente.
 * Retorna null quando nada estiver configurado (o agente fica PENDENTE, sem simular respostas).
 */
export async function resolveProvider(orgId: string, providerId: ProviderId): Promise<ResolvedProvider | null> {
  if (process.env.NEXUS_E2E_FAKE_LLM === "1") {
    const { createE2EFakeProvider } = await import("./providers/e2e-fake");
    return { provider: createE2EFakeProvider(), source: "env", keyHint: "dublê de teste E2E" };
  }
  const own = await withOrg(orgId, null, (tx) =>
    tx.select().from(aiProviderCredentials).where(and(eq(aiProviderCredentials.organizationId, orgId), eq(aiProviderCredentials.provider, providerId))).limit(1),
  );
  if (own[0]) return { provider: factory(providerId, decryptSecret(own[0].ciphertext, aad(orgId, providerId)), own[0].baseUrl), source: "org", keyHint: own[0].keyHint };

  const platform = await withPlatform(null, (tx) =>
    tx.select().from(aiProviderCredentials).where(and(isNull(aiProviderCredentials.organizationId), eq(aiProviderCredentials.provider, providerId))).limit(1),
  );
  if (platform[0]) return { provider: factory(providerId, decryptSecret(platform[0].ciphertext, aad(null, providerId)), platform[0].baseUrl), source: "platform", keyHint: platform[0].keyHint };

  const envKey = PROVIDERS.find((p) => p.id === providerId)?.envKey;
  const fromEnv = envKey ? process.env[envKey] : undefined;
  if (fromEnv) return { provider: factory(providerId, fromEnv), source: "env", keyHint: keyHint(fromEnv) };
  return null;
}

/** Salva (ou substitui) a chave da PLATAFORMA e faz um teste real de comunicação. */
export async function savePlatformProviderKey(actorUserId: string, input: { provider: ProviderId; apiKey: string; baseUrl?: string; testModel: string }) {
  const p = PROVIDERS.find((x) => x.id === input.provider);
  if (!p) throw new UserFacingError("Provedor inválido.");
  if (p.needsBaseUrl && !input.baseUrl) throw new UserFacingError("Informe a URL base do provedor compatível.");
  if (input.baseUrl) {
    const u = new URL(input.baseUrl);
    if (u.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(u.hostname)) throw new UserFacingError("Use uma URL https.");
  }
  const test = await factory(input.provider, input.apiKey.trim(), input.baseUrl).ping(input.testModel);
  const ciphertext = encryptSecret(input.apiKey.trim(), aad(null, input.provider));
  await withPlatform(actorUserId, async (tx) => {
    await tx.delete(aiProviderCredentials).where(and(isNull(aiProviderCredentials.organizationId), eq(aiProviderCredentials.provider, input.provider)));
    await tx.insert(aiProviderCredentials).values({
      organizationId: null,
      provider: input.provider,
      baseUrl: input.baseUrl ?? null,
      ciphertext,
      keyHint: keyHint(input.apiKey),
      status: test.ok ? "verified" : "error",
      lastCheckedAt: new Date(),
      lastError: test.ok ? null : test.error,
    });
    await audit(tx, { actorUserId, action: "ai.provider_key_saved", summary: `Chave do provedor ${p.label} salva (${test.ok ? "teste OK" : "teste falhou"})`, metadata: { provider: input.provider } });
  });
  return test;
}

export async function removePlatformProviderKey(actorUserId: string, provider: ProviderId) {
  await withPlatform(actorUserId, async (tx) => {
    await tx.delete(aiProviderCredentials).where(and(isNull(aiProviderCredentials.organizationId), eq(aiProviderCredentials.provider, provider)));
    await audit(tx, { actorUserId, action: "ai.provider_key_removed", summary: `Chave do provedor ${provider} removida` });
  });
}

export async function listPlatformProviderStatus(actorUserId: string) {
  const rows = await withPlatform(actorUserId, (tx) =>
    tx
      .select({ provider: aiProviderCredentials.provider, keyHint: aiProviderCredentials.keyHint, status: aiProviderCredentials.status, lastCheckedAt: aiProviderCredentials.lastCheckedAt, lastError: aiProviderCredentials.lastError, baseUrl: aiProviderCredentials.baseUrl })
      .from(aiProviderCredentials)
      .where(isNull(aiProviderCredentials.organizationId)),
  );
  return PROVIDERS.map((p) => {
    const db = rows.find((r) => r.provider === p.id);
    const env = p.envKey && process.env[p.envKey] ? keyHint(process.env[p.envKey]!) : null;
    return { ...p, db: db ?? null, env };
  });
}
