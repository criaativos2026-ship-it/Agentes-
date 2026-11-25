import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { can, getOrgContext } from "@/server/auth/guards";
import { googleOAuthConfigured, googleRedirectUri } from "@/server/integrations/google";
import { integrationDef } from "@/server/integrations/catalog";
import { signState } from "@/server/integrations/oauth-state";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("org") ?? "";
  const ctx = await getOrgContext(slug);
  const back = new URL(`/app/${slug}/integracoes`, req.url);
  if (!ctx || !can(ctx, "integrations.manage")) return NextResponse.redirect(new URL("/", req.url));
  if (!googleOAuthConfigured()) {
    back.searchParams.set("erro", "Google OAuth pendente: o servidor ainda não tem GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET.");
    return NextResponse.redirect(back);
  }
  const { state, nonce } = signState({ orgId: ctx.org.id, slug: ctx.org.slug, userId: ctx.user.id });
  (await cookies()).set("nexus_oauth_nonce", nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/integrations", maxAge: 600 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", (integrationDef("google")?.scopes ?? []).join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
