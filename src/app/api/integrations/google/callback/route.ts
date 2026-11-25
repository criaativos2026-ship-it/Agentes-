import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getSession } from "@/server/auth/guards";
import { withOrg } from "@/server/db/client";
import { integrationCredentials, integrations } from "@/server/db/schema";
import { googleRedirectUri } from "@/server/integrations/google";
import { verifyState } from "@/server/integrations/oauth-state";
import { sealSecrets } from "@/server/integrations/store";
import { upsertIntegration } from "@/server/integrations/connect";
import { integrationDef } from "@/server/integrations/catalog";
import { audit } from "@/server/audit/log";
import { safeEqual } from "@/server/security/crypto";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const state = verifyState(u.searchParams.get("state") ?? "");
  const store = await cookies();
  const nonce = store.get("nexus_oauth_nonce")?.value ?? "";
  store.delete("nexus_oauth_nonce");
  const session = await getSession();
  if (!state || !session || state.userId !== session.user.id || !nonce || !safeEqual(nonce, state.nonce)) {
    return NextResponse.redirect(new URL("/?erro=oauth", req.url));
  }
  const back = new URL(`/app/${state.slug}/integracoes`, req.url);
  const code = u.searchParams.get("code");
  if (!code) {
    back.searchParams.set("erro", `Autorização Google não concedida (${u.searchParams.get("error") ?? "cancelada"}).`);
    return NextResponse.redirect(back);
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: googleRedirectUri(), grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(15000),
  });
  const tok = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string };
  if (!tokenRes.ok || !tok.access_token) {
    back.searchParams.set("erro", `Falha ao obter acesso do Google: ${tok.error_description ?? tokenRes.status}`);
    return NextResponse.redirect(back);
  }
  // Teste real: consulta a identidade da conta autorizada.
  const me = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const info = (await me.json().catch(() => ({}))) as { email?: string };
  if (!me.ok || !info.email) {
    back.searchParams.set("erro", "Não foi possível confirmar a conta Google.");
    return NextResponse.redirect(back);
  }
  const secrets = { access_token: tok.access_token, refresh_token: tok.refresh_token ?? "", expires_at: String(Date.now() + (tok.expires_in ?? 3600) * 1000) };
  await withOrg(state.orgId, state.userId, async (tx) => {
    const id = await upsertIntegration(tx, state.orgId, state.userId, "google", integrationDef("google")!.name, { email: info.email! });
    await tx.insert(integrationCredentials).values({ organizationId: state.orgId, integrationId: id, kind: "oauth", ciphertext: sealSecrets(state.orgId, "google", secrets) }).onConflictDoUpdate({ target: integrationCredentials.integrationId, set: { ciphertext: sealSecrets(state.orgId, "google", secrets), updatedAt: new Date() } });
    await tx.update(integrations).set({ status: tok.refresh_token ? "connected" : "error", scopes: (tok.scope ?? "").split(" "), connectedAt: new Date(), lastCheckedAt: new Date(), lastError: tok.refresh_token ? null : "O Google não enviou refresh_token: remova o acesso do app na conta Google e conecte de novo." }).where(eq(integrations.id, id));
    await audit(tx, { organizationId: state.orgId, actorUserId: state.userId, action: "integration.connected", summary: `Google conectado (${info.email})`, entityType: "integration", entityId: id });
  });
  back.searchParams.set("ok", "google");
  return NextResponse.redirect(back);
}
