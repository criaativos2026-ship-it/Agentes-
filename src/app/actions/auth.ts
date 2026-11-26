"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withAuth, withPlatform, withUser } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, revokeSessionByToken, SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";
import { clearRateLimit, hitRateLimit } from "@/server/auth/rate-limit";
import { getSession, requestMeta } from "@/server/auth/guards";
import { createPasswordResetLink, resetPasswordWithToken } from "@/server/auth/password-reset";
import { sendEmail, isEmailConfigured } from "@/server/email";
import { audit } from "@/server/audit/log";
import { emailSchema, nameSchema, passwordSchema } from "@/lib/validation";
import { setupTokenValid } from "@/server/auth/setup";
import { PRIVACY_VERSION } from "@/lib/privacy";
import type { FormState } from "@/lib/form-state";

const LOGIN_LIMIT = { perEmail: 8, perIp: 30, windowSeconds: 15 * 60 };

async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
}

// ---------------------------------------------------------------------------
// Entrar
// ---------------------------------------------------------------------------

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Informe a senha.").max(200) });

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  const typedEmail = String(form.get("email") ?? "").slice(0, 254);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { email: typedEmail } };
  const { email, password } = parsed.data;
  const meta = await requestMeta();

  const byEmail = await hitRateLimit(`login:email:${email}`, LOGIN_LIMIT.perEmail, LOGIN_LIMIT.windowSeconds);
  const byIp = await hitRateLimit(`login:ip:${meta.ip ?? "?"}`, LOGIN_LIMIT.perIp, LOGIN_LIMIT.windowSeconds);
  if (!byEmail.allowed || !byIp.allowed) {
    return { error: "Muitas tentativas. Aguarde 15 minutos e tente novamente.", fields: { email } };
  }

  const [user] = await withAuth((tx) =>
    tx
      .select({ id: users.id, passwordHash: users.passwordHash, status: users.status, platformRole: users.platformRole })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1),
  );

  const ok = user ? await verifyPassword(user.passwordHash, password) : (await burnPasswordCheck(password), false);
  if (!user || !ok || user.status !== "active") {
    await withAuth((tx) =>
      audit(tx, { action: "auth.login_failed", summary: "Tentativa de login recusada", metadata: { reason: !user ? "unknown_email" : !ok ? "bad_password" : "disabled" }, ip: meta.ip }),
    );
    return { error: "E-mail ou senha incorretos.", fields: { email } };
  }

  await clearRateLimit(`login:email:${email}`);
  const { token, expiresAt } = await createSession(user.id, meta);
  await withAuth(async (tx) => {
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await audit(tx, { actorUserId: user.id, action: "auth.login", summary: "Login realizado", ip: meta.ip });
  }, user.id);
  await setSessionCookie(token, expiresAt);
  redirect("/");
}

// ---------------------------------------------------------------------------
// Sair
// ---------------------------------------------------------------------------

export async function logout() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSessionByToken(token);
  store.delete(SESSION_COOKIE);
  redirect("/entrar");
}

// ---------------------------------------------------------------------------
// Primeiro acesso: só existe enquanto NÃO houver usuários. Cria o super administrador.
// ---------------------------------------------------------------------------

const setupSchema = z
  .object({ name: nameSchema, email: emailSchema, password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: "As senhas não conferem.", path: ["confirm"] });

export async function setupFirstAdmin(_: FormState, form: FormData): Promise<FormState> {
  if (!setupTokenValid(String(form.get("code") ?? ""))) return { error: "Código de primeiro acesso inválido." };
  const parsed = setupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { email: String(form.get("email") ?? ""), name: String(form.get("name") ?? "") } };
  if (form.get("privacy") !== "on") return { error: "É preciso aceitar o aviso de privacidade.", fields: { email: parsed.data.email, name: parsed.data.name } };
  const meta = await requestMeta();
  const limited = await hitRateLimit(`setup:ip:${meta.ip ?? "?"}`, 10, 3600);
  if (!limited.allowed) return { error: "Muitas tentativas. Tente mais tarde." };

  const passwordHash = await hashPassword(parsed.data.password);
  // Trava de concorrência: advisory lock garante que só UMA requisição cria o primeiro usuário.
  const created = await withPlatform(null, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424242)`);
    const [row] = await tx.select({ n: count() }).from(users);
    if (Number(row.n) > 0) return null;
    const [u] = await tx
      .insert(users)
      .values({
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        platformRole: "super_admin",
        privacyVersion: PRIVACY_VERSION,
        privacyAcceptedAt: new Date(),
      })
      .returning({ id: users.id });
    await audit(tx, { actorUserId: u.id, action: "platform.setup", summary: "Primeiro acesso: super administrador criado", ip: meta.ip });
    return u;
  });
  if (!created) redirect("/entrar");

  const { token, expiresAt } = await createSession(created.id, meta);
  await setSessionCookie(token, expiresAt);
  redirect("/admin");
}

// ---------------------------------------------------------------------------
// Recuperação de senha
// ---------------------------------------------------------------------------

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const meta = await requestMeta();
  const lim = await hitRateLimit(`reset:ip:${meta.ip ?? "?"}`, 10, 3600);
  const limEmail = await hitRateLimit(`reset:email:${parsed.data}`, 3, 3600);
  if (!lim.allowed || !limEmail.allowed) return { error: "Muitas solicitações. Tente novamente mais tarde." };

  if (!isEmailConfigured()) {
    return {
      error:
        "O envio de e-mails ainda não está configurado nesta plataforma. Peça ao administrador um link de redefinição de senha.",
    };
  }
  const link = await createPasswordResetLink(parsed.data);
  if (link) {
    const res = await sendEmail({
      to: link.user.email,
      subject: "Redefinição de senha — NEXUS AI",
      text: `Olá, ${link.user.name}.\n\nPara criar uma nova senha, acesse (válido por 1 hora):\n${link.url}\n\nSe você não pediu, ignore este e-mail.`,
    });
    if (!res.sent) console.error("[reset] falha ao enviar e-mail:", res.reason);
  }
  // Mesma resposta exista ou não a conta (não revela quem tem cadastro).
  return { ok: "Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha." };
}

const resetSchema = z
  .object({ token: z.string().min(10).max(200), password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: "As senhas não conferem." });

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const ok = await resetPasswordWithToken(parsed.data.token, parsed.data.password);
  if (!ok) return { error: "Este link é inválido ou expirou. Peça um novo." };
  redirect("/entrar?senha=redefinida");
}

// ---------------------------------------------------------------------------
// Aceite do aviso de privacidade (LGPD)
// ---------------------------------------------------------------------------

export async function acceptPrivacy(_: FormState, form: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s) redirect("/entrar");
  if (form.get("agree") !== "on") return { error: "Marque a caixa para confirmar que leu e concorda." };
  await withUser(s.user.id, async (tx) => {
    await tx.update(users).set({ privacyVersion: PRIVACY_VERSION, privacyAcceptedAt: new Date() }).where(eq(users.id, s.user.id));
    await audit(tx, { actorUserId: s.user.id, action: "privacy.accepted", summary: `Aviso de privacidade aceito (versão ${PRIVACY_VERSION})` });
  });
  redirect("/");
}
