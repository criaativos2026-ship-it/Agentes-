import "server-only";
import type { Tx } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";

export type AuditEntry = {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

/**
 * Registra uma ação na auditoria, dentro da MESMA transação da ação
 * (se a ação falhar, o registro também não é gravado).
 * Nunca coloque senhas, tokens ou chaves em `metadata`.
 */
export async function audit(tx: Tx, entry: AuditEntry) {
  await tx.insert(auditLogs).values({
    organizationId: entry.organizationId ?? null,
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    summary: entry.summary,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata ?? {},
    ip: entry.ip ?? null,
  });
}
