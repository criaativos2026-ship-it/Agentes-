import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { withOrg } from "@/server/db/client";
import { integrationCredentials, integrations } from "@/server/db/schema";
import { audit } from "@/server/audit/log";
import { safeFetch } from "@/server/security/ssrf";
import { UserFacingError } from "@/server/errors";
import { GRAPH_VERSION_DEFAULT, integrationDef } from "./catalog";
import { openSecrets, sealSecrets } from "./store";

type TestResult = { ok: true; detail?: string } | { ok: false; error: string };

/** Teste REAL de comunicação de cada integração (nada é marcado como conectado sem passar aqui). */
async function testConnection(key: string, config: Record<string, string>, secrets: Record<string, string>): Promise<TestResult> {
  try {
    if (key === "whatsapp") {
      const v = config.graph_version || GRAPH_VERSION_DEFAULT;
      const r = await fetch(`https://graph.facebook.com/${v}/${encodeURIComponent(config.phone_number_id)}?fields=display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${secrets.access_token}` }, signal: AbortSignal.timeout(15000) });
      const b = (await r.json().catch(() => ({}))) as { display_phone_number?: string; verified_name?: string; error?: { message?: string } };
      return r.ok ? { ok: true, detail: `${b.verified_name ?? ""} ${b.display_phone_number ?? ""}`.trim() } : { ok: false, error: b.error?.message ?? `HTTP ${r.status}` };
    }
    if (key === "google_maps") {
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": secrets.api_key, "X-Goog-FieldMask": "places.displayName" },
        body: JSON.stringify({ textQuery: "Avenida Paulista, São Paulo", pageSize: 1 }),
        signal: AbortSignal.timeout(15000),
      });
      const b = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
      return r.ok ? { ok: true } : { ok: false, error: b.error?.message ?? `HTTP ${r.status}` };
    }
    if (key === "hubspot") {
      const r = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", { headers: { Authorization: `Bearer ${secrets.access_token}` }, signal: AbortSignal.timeout(15000) });
      const b = (await r.json().catch(() => ({}))) as { message?: string };
      return r.ok ? { ok: true } : { ok: false, error: b.message ?? `HTTP ${r.status}` };
    }
    if (key === "rest_api") {
      const base = new URL(config.base_url);
      if (base.protocol !== "https:") return { ok: false, error: "Use uma URL https." };
      const url = new URL(base.pathname.replace(/\/$/, "") + (config.health_path || "/"), base);
      const headers: Record<string, string> = {};
      if (config.header_name && secrets.header_value) headers[config.header_name] = secrets.header_value;
      const r = await safeFetch(url.toString(), { headers, allowlist: [base.hostname] });
      return r.status < 400 ? { ok: true, detail: `HTTP ${r.status}` } : { ok: false, error: `A API respondeu HTTP ${r.status}` };
    }
    if (key === "webhook_out") {
      const u = new URL(config.url);
      if (u.protocol !== "https:") return { ok: false, error: "Use uma URL https." };
      const body = JSON.stringify({ event: "nexus.test", data: { message: "Teste de conexão" }, sentAt: new Date().toISOString() });
      const sig = createHmac("sha256", secrets.signing_secret).update(body).digest("hex");
      const r = await safeFetch(config.url, { method: "POST", headers: { "content-type": "application/json", "x-nexus-signature": `sha256=${sig}` }, body, allowlist: [u.hostname] });
      return r.status < 400 ? { ok: true, detail: `HTTP ${r.status}` } : { ok: false, error: `Destino respondeu HTTP ${r.status}` };
    }
    return { ok: false, error: "Teste não disponível para esta integração." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha de comunicação." };
  }
}

/** Salva credenciais (criptografadas) e testa a comunicação. Status final: connected ou error. */
export async function connectApiKeyIntegration(orgId: string, actorUserId: string, key: string, values: Record<string, string>) {
  const def = integrationDef(key);
  if (!def || def.auth === "oauth_google") throw new UserFacingError("Integração inválida.");
  const config: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  // Segredos já salvos são mantidos quando o campo vier vazio (não precisa redigitar).
  const existing = await withOrg(orgId, actorUserId, async (tx) => {
    const [row] = await tx.select({ id: integrations.id, ct: integrationCredentials.ciphertext }).from(integrations).leftJoin(integrationCredentials, eq(integrationCredentials.integrationId, integrations.id)).where(and(eq(integrations.organizationId, orgId), eq(integrations.providerKey, key)));
    return row;
  });
  const oldSecrets = existing?.ct ? openSecrets(orgId, key, existing.ct) : {};
  for (const f of def.fields) {
    const v = (values[f.key] ?? "").trim();
    if (f.secret) {
      const val = v || oldSecrets[f.key] || "";
      if (f.required && !val) throw new UserFacingError(`Informe: ${f.label}.`);
      if (val) secrets[f.key] = val;
    } else {
      if (f.required && !v) throw new UserFacingError(`Informe: ${f.label}.`);
      if (v) config[f.key] = v.slice(0, 500);
    }
  }
  if (key === "webhook_out" && !secrets.signing_secret) secrets.signing_secret = randomBytes(24).toString("base64url");
  const test = await testConnection(key, config, secrets);
  await withOrg(orgId, actorUserId, async (tx) => {
    const id = await upsertIntegration(tx, orgId, actorUserId, key, def.name, config);
    await tx
      .insert(integrationCredentials)
      .values({ organizationId: orgId, integrationId: id, kind: def.auth === "webhook" ? "webhook_secret" : "api_key", ciphertext: sealSecrets(orgId, key, secrets) })
      .onConflictDoUpdate({ target: integrationCredentials.integrationId, set: { ciphertext: sealSecrets(orgId, key, secrets), updatedAt: new Date() } });
    await tx
      .update(integrations)
      .set({ status: test.ok ? "connected" : "error", connectedAt: test.ok ? new Date() : null, lastCheckedAt: new Date(), lastError: test.ok ? null : test.error })
      .where(eq(integrations.id, id));
    await audit(tx, { organizationId: orgId, actorUserId, action: test.ok ? "integration.connected" : "integration.test_failed", summary: `${def.name}: ${test.ok ? "conectada (teste real OK)" : `teste falhou — ${test.error}`}`, entityType: "integration", entityId: id });
  });
  return test;
}

export async function upsertIntegration(tx: Tx, orgId: string, actorUserId: string, key: string, name: string, config: Record<string, string>) {
  const [row] = await tx
    .insert(integrations)
    .values({ organizationId: orgId, providerKey: key, name, config, createdBy: actorUserId, status: "pending_credentials" })
    .onConflictDoUpdate({ target: [integrations.organizationId, integrations.providerKey], set: { config, name } })
    .returning({ id: integrations.id });
  return row.id;
}

export async function retestIntegration(orgId: string, actorUserId: string, key: string) {
  const row = await withOrg(orgId, actorUserId, async (tx) => {
    const [r] = await tx.select({ id: integrations.id, config: integrations.config, ct: integrationCredentials.ciphertext }).from(integrations).leftJoin(integrationCredentials, eq(integrationCredentials.integrationId, integrations.id)).where(and(eq(integrations.organizationId, orgId), eq(integrations.providerKey, key)));
    return r;
  });
  if (!row?.ct) throw new UserFacingError("Integração sem credenciais.");
  if (key === "google") {
    const { googleAccessToken } = await import("./google");
    const t = await googleAccessToken(orgId);
    return t ? { ok: true as const } : { ok: false as const, error: "Não foi possível renovar o acesso. Reconecte a conta Google." };
  }
  const test = await testConnection(key, row.config, openSecrets(orgId, key, row.ct));
  await withOrg(orgId, actorUserId, (tx) =>
    tx.update(integrations).set({ status: test.ok ? "connected" : "error", lastCheckedAt: new Date(), lastError: test.ok ? null : test.error }).where(eq(integrations.id, row.id)),
  );
  return test;
}

export async function disconnectIntegration(orgId: string, actorUserId: string, key: string) {
  await withOrg(orgId, actorUserId, async (tx) => {
    const [row] = await tx.select({ id: integrations.id, name: integrations.name }).from(integrations).where(and(eq(integrations.organizationId, orgId), eq(integrations.providerKey, key)));
    if (!row) throw new UserFacingError("Integração não encontrada.");
    await tx.delete(integrationCredentials).where(eq(integrationCredentials.integrationId, row.id));
    await tx.update(integrations).set({ status: "disabled", connectedAt: null, lastError: null }).where(eq(integrations.id, row.id));
    await audit(tx, { organizationId: orgId, actorUserId, action: "integration.disconnected", summary: `${row.name} desconectada (credenciais apagadas)`, entityType: "integration", entityId: row.id });
  });
}
