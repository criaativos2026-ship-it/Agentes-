import "server-only";
import { and, inArray, lt, sql } from "drizzle-orm";
import { withPlatform } from "@/server/db/client";
import { auditLogs, conversations, executions, notifications, passwordResetTokens, sessions } from "@/server/db/schema";
import { RETENTION_DAYS } from "@/lib/privacy";

/**
 * Limpeza automática por prazo (LGPD): apaga registros operacionais mais antigos que RETENTION_DAYS
 * (execuções finalizadas e seus passos, conversas, notificações, auditoria) e credenciais temporárias vencidas.
 */
export async function purgeExpiredData(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 864e5);
  return withPlatform(null, async (tx) => {
    const ex = await tx.delete(executions).where(and(lt(executions.createdAt, cutoff), inArray(executions.status, ["succeeded", "failed", "canceled", "timed_out"]))).returning({ id: executions.id });
    const conv = await tx.delete(conversations).where(lt(conversations.updatedAt, cutoff)).returning({ id: conversations.id });
    const notif = await tx.delete(notifications).where(lt(notifications.createdAt, cutoff)).returning({ id: notifications.id });
    const audits = await tx.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff)).returning({ id: auditLogs.id });
    await tx.delete(sessions).where(sql`${sessions.expiresAt} < now() - interval '7 days' or (${sessions.revokedAt} is not null and ${sessions.revokedAt} < now() - interval '7 days')`);
    await tx.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, new Date(now.getTime() - 864e5)));
    return { executions: ex.length, conversations: conv.length, notifications: notif.length, audit: audits.length };
  });
}
