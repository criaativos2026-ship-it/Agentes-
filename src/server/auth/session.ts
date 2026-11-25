import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { withAuth } from "@/server/db/client";
import { sessions, users, type User } from "@/server/db/schema";
import { randomToken, sha256 } from "@/server/security/crypto";

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY;
const RENEW_WHEN_LEFT_MS = 15 * DAY;

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-nexus_session" : "nexus_session";

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Cria a sessão e devolve o token em texto claro (vai só para o cookie; no banco fica o hash). */
export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await withAuth(async (tx) => {
    await tx.insert(sessions).values({
      userId,
      tokenHash: sha256(token),
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    });
  });
  return { token, expiresAt };
}

export type SessionUser = Pick<
  User,
  "id" | "email" | "name" | "platformRole" | "status" | "privacyVersion" | "privacyAcceptedAt" | "locale"
>;

/**
 * Valida o token: sessão existente, não revogada, não expirada e usuário ATIVO.
 * Renova a validade (expiração deslizante) quando faltam menos de 15 dias.
 */
export async function validateSessionToken(token: string): Promise<{ sessionId: string; user: SessionUser } | null> {
  if (!token || token.length > 200) return null;
  const tokenHash = sha256(token);
  return withAuth(async (tx) => {
    const [row] = await tx
      .select({
        sessionId: sessions.id,
        expiresAt: sessions.expiresAt,
        lastSeenAt: sessions.lastSeenAt,
        user: {
          id: users.id,
          email: users.email,
          name: users.name,
          platformRole: users.platformRole,
          status: users.status,
          privacyVersion: users.privacyVersion,
          privacyAcceptedAt: users.privacyAcceptedAt,
          locale: users.locale,
        },
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .limit(1);
    if (!row || row.user.status !== "active") return null;

    const now = Date.now();
    const renew = row.expiresAt.getTime() - now < RENEW_WHEN_LEFT_MS;
    // Atualiza "visto por último" no máximo a cada 5 minutos para não escrever a cada requisição.
    if (renew || now - row.lastSeenAt.getTime() > 5 * 60 * 1000) {
      await tx
        .update(sessions)
        .set({ lastSeenAt: new Date(), ...(renew ? { expiresAt: new Date(now + SESSION_TTL_MS) } : {}) })
        .where(eq(sessions.id, row.sessionId));
    }
    return { sessionId: row.sessionId, user: row.user };
  });
}

export async function revokeSessionByToken(token: string) {
  const tokenHash = sha256(token);
  await withAuth((tx) => tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, tokenHash)));
}

/** Encerra todas as sessões de um usuário (troca de senha, desativação, anonimização). */
export async function revokeAllUserSessions(userId: string, exceptSessionId?: string) {
  await withAuth(async (tx) => {
    const rows = await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (exceptSessionId && rows.some((r) => r.id === exceptSessionId)) {
      await tx.update(sessions).set({ revokedAt: null }).where(eq(sessions.id, exceptSessionId));
    }
  });
}
