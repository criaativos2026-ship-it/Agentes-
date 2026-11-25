import "server-only";
import { and, count, eq, ne, sql } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { auditLogs, messages, organizationMembers, users } from "@/server/db/schema";
import { audit } from "@/server/audit/log";
import { hashPassword } from "@/server/auth/password";
import { randomToken } from "@/server/security/crypto";
import { UserFacingError } from "@/server/errors";
import { ANONYMOUS_NAME } from "@/lib/privacy";

/**
 * Exclusão por anonimização (LGPD): remove nome, e-mail e senha da pessoa, desativa os acessos e
 * troca o nome nos registros de auditoria. Registros operacionais continuam (relatórios corretos,
 * sem identificar ninguém). Irreversível. Escopo: plataforma.
 */
export async function anonymizeUser(tx: Tx, actorUserId: string, userId: string) {
  if (actorUserId === userId) throw new UserFacingError("Você não pode anonimizar a própria conta.");
  const [u] = await tx.select().from(users).where(eq(users.id, userId));
  if (!u) throw new UserFacingError("Usuário não encontrado.");
  if (u.anonymizedAt) throw new UserFacingError("Conta já anonimizada.");
  if (u.platformRole === "super_admin") {
    const [others] = await tx
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.platformRole, "super_admin"), eq(users.status, "active"), ne(users.id, userId)));
    if (Number(others.n) === 0) throw new UserFacingError("A plataforma precisa de ao menos um super administrador ativo.");
  }
  const oldName = u.name;
  const oldEmail = u.email;
  await tx
    .update(users)
    .set({
      name: ANONYMOUS_NAME,
      email: `removido-${u.id}@anonimo.invalid`,
      passwordHash: await hashPassword(randomToken(24)),
      platformRole: null,
      status: "disabled",
      privacyVersion: null,
      privacyAcceptedAt: null,
      deletionRequestedAt: null,
      anonymizedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  await tx.update(organizationMembers).set({ status: "disabled", jobTitle: null }).where(eq(organizationMembers.userId, userId));
  for (const value of [oldName, oldEmail]) {
    if (value.length < 3) continue;
    await tx.update(auditLogs).set({ summary: sql`replace(${auditLogs.summary}, ${value}, ${ANONYMOUS_NAME})` }).where(sql`${auditLogs.summary} like ${"%" + value + "%"}`);
  }
  // Mensagens enviadas pela pessoa nos chats continuam (são dados da empresa), mas desvinculadas.
  await tx.update(messages).set({ userId: null }).where(eq(messages.userId, userId));
  await audit(tx, { actorUserId, action: "privacy.user_anonymized", summary: "Conta anonimizada a pedido do titular (LGPD)", entityType: "user", entityId: userId });
}
