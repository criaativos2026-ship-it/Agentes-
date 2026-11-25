import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { organizationMembers, rolePermissions, roles } from "@/server/db/schema";
import { audit } from "@/server/audit/log";
import { UserFacingError } from "@/server/errors";

/** Quantos membros ATIVOS (exceto `exceptMemberId`) conseguem gerenciar a equipe. */
async function countManagers(tx: Tx, orgId: string, exceptMemberId: string) {
  const managerRoles = tx
    .select({ id: rolePermissions.roleId })
    .from(rolePermissions)
    .where(eq(rolePermissions.permissionKey, "members.manage"));
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.status, "active"),
        ne(organizationMembers.id, exceptMemberId),
        inArray(organizationMembers.roleId, managerRoles),
      ),
    );
  return row.n;
}

async function roleCanManage(tx: Tx, roleId: string) {
  const r = await tx
    .select({ k: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionKey, "members.manage")));
  return r.length > 0;
}

/**
 * Altera o papel de um membro. Regras: o papel precisa ser de sistema ou da própria empresa;
 * a empresa nunca fica sem ao menos um administrador ativo.
 */
export async function changeMemberRole(tx: Tx, actorUserId: string | null, orgId: string, memberId: string, roleId: string) {
  const [m] = await tx.select().from(organizationMembers).where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)));
  if (!m) throw new UserFacingError("Membro não encontrado.");
  const [r] = await tx.select().from(roles).where(eq(roles.id, roleId));
  if (!r || (r.organizationId !== null && r.organizationId !== orgId)) throw new UserFacingError("Papel inválido para esta empresa.");
  if (m.roleId === roleId) return;
  if ((await roleCanManage(tx, m.roleId)) && !(await roleCanManage(tx, roleId)) && (await countManagers(tx, orgId, memberId)) === 0) {
    throw new UserFacingError("A empresa precisa de ao menos um administrador ativo.");
  }
  await tx.update(organizationMembers).set({ roleId }).where(eq(organizationMembers.id, memberId));
  await audit(tx, { organizationId: orgId, actorUserId, action: "member.role_changed", summary: `Papel alterado para "${r.name}"`, entityType: "member", entityId: memberId });
}

export async function setMemberStatus(tx: Tx, actorUserId: string | null, orgId: string, memberId: string, status: "active" | "disabled") {
  const [m] = await tx.select().from(organizationMembers).where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)));
  if (!m) throw new UserFacingError("Membro não encontrado.");
  if (actorUserId && m.userId === actorUserId && status === "disabled") throw new UserFacingError("Você não pode desativar o próprio acesso.");
  if (status === "disabled" && (await roleCanManage(tx, m.roleId)) && (await countManagers(tx, orgId, memberId)) === 0) {
    throw new UserFacingError("A empresa precisa de ao menos um administrador ativo.");
  }
  await tx.update(organizationMembers).set({ status }).where(eq(organizationMembers.id, memberId));
  await audit(tx, { organizationId: orgId, actorUserId, action: `member.${status === "active" ? "enabled" : "disabled"}`, summary: `Acesso de membro ${status === "active" ? "reativado" : "desativado"}`, entityType: "member", entityId: memberId });
  return m.userId;
}
