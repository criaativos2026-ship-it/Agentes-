import "server-only";
import { and, eq } from "drizzle-orm";
import { withOrg } from "@/server/db/client";
import { integrationCredentials, integrations } from "@/server/db/schema";
import { getConnectedIntegration, sealSecrets } from "./store";

export function googleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri() {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/integrations/google/callback`;
}

/** Token de acesso válido (renova com o refresh_token quando faltar menos de 2 minutos). */
export async function googleAccessToken(orgId: string): Promise<{ token: string; integrationId: string } | null> {
  const integ = await getConnectedIntegration(orgId, "google");
  if (!integ) return null;
  const { access_token, refresh_token, expires_at } = integ.secrets;
  if (access_token && Number(expires_at) - Date.now() > 120_000) return { token: access_token, integrationId: integ.id };
  if (!refresh_token || !googleOAuthConfigured()) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) {
    await withOrg(orgId, null, (tx) =>
      tx.update(integrations).set({ status: "error", lastError: `Falha ao renovar acesso Google: ${body.error ?? res.status}`, lastCheckedAt: new Date() }).where(eq(integrations.id, integ.id)),
    );
    return null;
  }
  const secrets = { ...integ.secrets, access_token: body.access_token, expires_at: String(Date.now() + (body.expires_in ?? 3600) * 1000) };
  await withOrg(orgId, null, (tx) =>
    tx.update(integrationCredentials).set({ ciphertext: sealSecrets(orgId, "google", secrets), updatedAt: new Date() }).where(and(eq(integrationCredentials.integrationId, integ.id), eq(integrationCredentials.organizationId, orgId))),
  );
  return { token: body.access_token, integrationId: integ.id };
}

export async function googleApi<T>(orgId: string, url: string, init: RequestInit = {}): Promise<{ ok: true; data: T; integrationId: string } | { ok: false; error: string }> {
  const auth = await googleAccessToken(orgId);
  if (!auth) return { ok: false, error: "Integração Google não conectada ou acesso expirado. Reconecte na Central de integrações." };
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) return { ok: false, error: `Google respondeu ${res.status}: ${data?.error?.message ?? "erro"}` };
  return { ok: true, data, integrationId: auth.integrationId };
}
