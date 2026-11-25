import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { withAuth } from "@/server/db/client";
import { passwordResetTokens, users } from "@/server/db/schema";
import { randomToken, sha256 } from "@/server/security/crypto";
import { hashPassword } from "./password";
import { revokeAllUserSessions } from "./session";
import { audit } from "@/server/audit/log";

const TTL_MS = 60 * 60 * 1000;

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Cria um link de redefinição (uso único, 1 hora). Devolve null se o e-mail não existir/estiver inativo. */
export async function createPasswordResetLink(email: string, createdBy: string | null = null) {
  return withAuth(async (tx) => {
    const [user] = await tx
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${email.toLowerCase()}`, eq(users.status, "active"), isNull(users.anonymizedAt)))
      .limit(1);
    if (!user) return null;
    const token = randomToken(32);
    await tx.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + TTL_MS),
      createdBy,
    });
    return { user, url: `${appUrl()}/redefinir-senha/${token}` };
  });
}

export async function isResetTokenValid(token: string) {
  if (!token || token.length > 200) return false;
  return withAuth(async (tx) => {
    const [row] = await tx
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, sha256(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
      .limit(1);
    return Boolean(row);
  });
}

/** Troca a senha com o token, invalida o token e encerra todas as sessões. */
export async function resetPasswordWithToken(token: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);
  const userId = await withAuth(async (tx) => {
    const [row] = await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.tokenHash, sha256(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
      .returning({ userId: passwordResetTokens.userId });
    if (!row) return null;
    await tx.update(users).set({ passwordHash, passwordChangedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, row.userId));
    await audit(tx, { actorUserId: row.userId, action: "auth.password_reset", summary: "Senha redefinida por link" });
    return row.userId;
  });
  if (userId) await revokeAllUserSessions(userId);
  return Boolean(userId);
}
