import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { withUser, withPlatform } from "@/server/db/client";
import { auditLogs, messages, organizationMembers, organizations, roles, sessions, users } from "@/server/db/schema";
import { getSession } from "@/server/auth/guards";
import { audit } from "@/server/audit/log";

/** Portabilidade/acesso (LGPD art. 18): exporta os dados da própria pessoa em JSON. Nunca inclui senha/hash. */
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const uid = s.user.id;
  const data = await withUser(uid, async (tx) => {
    const [profile] = await tx
      .select({ id: users.id, name: users.name, email: users.email, locale: users.locale, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt, privacyVersion: users.privacyVersion, privacyAcceptedAt: users.privacyAcceptedAt, deletionRequestedAt: users.deletionRequestedAt })
      .from(users)
      .where(eq(users.id, uid));
    const memberships = await tx
      .select({ organization: organizations.name, role: roles.name, status: organizationMembers.status, since: organizationMembers.createdAt })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
      .where(eq(organizationMembers.userId, uid));
    const mySessions = await tx.select({ createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, ip: sessions.ip, userAgent: sessions.userAgent, revokedAt: sessions.revokedAt }).from(sessions).where(eq(sessions.userId, uid));
    return { profile, memberships, sessions: mySessions };
  });
  // Histórico e mensagens podem estar em várias empresas: leitura de sistema SEMPRE filtrada pela própria pessoa.
  const extra = await withPlatform(uid, async (tx) => {
    const history = await tx.select({ action: auditLogs.action, summary: auditLogs.summary, createdAt: auditLogs.createdAt }).from(auditLogs).where(eq(auditLogs.actorUserId, uid)).orderBy(desc(auditLogs.createdAt)).limit(5000);
    const sent = await tx.select({ createdAt: messages.createdAt, content: messages.content }).from(messages).where(eq(messages.userId, uid)).orderBy(desc(messages.createdAt)).limit(5000);
    await audit(tx, { actorUserId: uid, action: "privacy.data_exported", summary: "Exportação dos próprios dados (LGPD)" });
    return { history, messages: sent };
  });
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), ...data, ...extra }, null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="meus-dados-nexus.json"`,
      "Cache-Control": "no-store",
    },
  });
}
