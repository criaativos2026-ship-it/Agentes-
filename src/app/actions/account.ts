"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { withAuth, withUser } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { getSession, requireUser } from "@/server/auth/guards";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { revokeAllUserSessions } from "@/server/auth/session";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { audit } from "@/server/audit/log";
import { parseForm, toErrorState, UserFacingError } from "@/server/actions/result";
import { emailSchema, nameSchema, passwordSchema, uuidSchema } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

export async function updateProfileAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const { name } = parseForm(z.object({ name: nameSchema }), form);
    await withUser(user.id, async (tx) => {
      await tx.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, user.id));
      await audit(tx, { actorUserId: user.id, action: "user.profile_updated", summary: "Nome atualizado no perfil" });
    });
    revalidatePath("/", "layout");
    return { ok: "Perfil atualizado." };
  } catch (err) {
    return toErrorState(err);
  }
}

const passwordChange = z
  .object({ current: z.string().min(1, "Informe a senha atual."), password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: "As senhas não conferem." });

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const s = await getSession();
    if (!s) throw new UserFacingError("Sessão expirada.");
    const data = parseForm(passwordChange, form);
    const lim = await hitRateLimit(`pwchange:${s.user.id}`, 5, 900);
    if (!lim.allowed) throw new UserFacingError("Muitas tentativas. Aguarde 15 minutos.");
    const [u] = await withUser(s.user.id, (tx) => tx.select({ hash: users.passwordHash }).from(users).where(eq(users.id, s.user.id)));
    if (!(await verifyPassword(u.hash, data.current))) throw new UserFacingError("Senha atual incorreta.");
    const hash = await hashPassword(data.password);
    await withUser(s.user.id, async (tx) => {
      await tx.update(users).set({ passwordHash: hash, passwordChangedAt: new Date() }).where(eq(users.id, s.user.id));
      await audit(tx, { actorUserId: s.user.id, action: "auth.password_changed", summary: "Senha alterada pelo próprio usuário" });
    });
    await revokeAllUserSessions(s.user.id, s.sessionId);
    return { ok: "Senha alterada. As outras sessões foram encerradas." };
  } catch (err) {
    return toErrorState(err);
  }
}

const emailChange = z.object({ email: emailSchema, current: z.string().min(1, "Confirme com sua senha atual.") });

export async function changeEmailAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const s = await getSession();
    if (!s) throw new UserFacingError("Sessão expirada.");
    const data = parseForm(emailChange, form);
    const [u] = await withUser(s.user.id, (tx) => tx.select({ hash: users.passwordHash }).from(users).where(eq(users.id, s.user.id)));
    if (!(await verifyPassword(u.hash, data.current))) throw new UserFacingError("Senha atual incorreta.");
    await withAuth(async (tx) => {
      const [taken] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${data.email}`).limit(1);
      if (taken && taken.id !== s.user.id) throw new UserFacingError("Este e-mail já está em uso.");
      await tx.update(users).set({ email: data.email, updatedAt: new Date() }).where(eq(users.id, s.user.id));
      await audit(tx, { actorUserId: s.user.id, action: "privacy.email_changed", summary: "E-mail da conta corrigido pelo titular" });
    }, s.user.id);
    revalidatePath("/conta");
    return { ok: "E-mail atualizado." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function revokeSessionAction(sessionId: string): Promise<FormState> {
  try {
    const s = await getSession();
    if (!s) throw new UserFacingError("Sessão expirada.");
    uuidSchema.parse(sessionId);
    if (sessionId === s.sessionId) throw new UserFacingError("Para encerrar a sessão atual, use Sair.");
    await withUser(s.user.id, (tx) =>
      tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, s.user.id), isNull(sessions.revokedAt))),
    );
    revalidatePath("/conta");
    return { ok: "Sessão encerrada." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function revokeOtherSessionsAction(): Promise<FormState> {
  const s = await getSession();
  if (!s) return { error: "Sessão expirada." };
  await revokeAllUserSessions(s.user.id, s.sessionId);
  revalidatePath("/conta");
  return { ok: "Todas as outras sessões foram encerradas." };
}

export async function requestDeletionAction(cancel = false): Promise<FormState> {
  try {
    const user = await requireUser();
    await withUser(user.id, async (tx) => {
      await tx.update(users).set({ deletionRequestedAt: cancel ? null : new Date() }).where(eq(users.id, user.id));
      await audit(tx, {
        actorUserId: user.id,
        action: cancel ? "privacy.deletion_canceled" : "privacy.deletion_requested",
        summary: cancel ? "Pedido de exclusão de dados cancelado" : "Pedido de exclusão de dados registrado (LGPD)",
      });
    });
    revalidatePath("/conta");
    return { ok: cancel ? "Pedido cancelado." : "Pedido registrado. A equipe da plataforma fará a exclusão." };
  } catch (err) {
    return toErrorState(err);
  }
}
