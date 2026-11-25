import "server-only";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { agentAccess, agents, organizationMembers } from "@/server/db/schema";
import { can, type OrgContext } from "@/server/auth/guards";

/**
 * Quais agentes a pessoa pode ver/usar:
 * - com "agents.view_all" (ou equipe da plataforma): todos os da empresa;
 * - sem regra de acesso cadastrada para o agente: todos os membros com "agents.use";
 * - com regra: apenas o papel ou usuário liberado.
 */
export async function visibleAgentIdsFilter(tx: Tx, ctx: OrgContext): Promise<SQL | undefined> {
  if (ctx.viaPlatform || can(ctx, "agents.view_all")) return undefined;
  if (!can(ctx, "agents.use")) return sql`false`;
  const [member] = await tx.select({ roleId: organizationMembers.roleId }).from(organizationMembers).where(eq(organizationMembers.id, ctx.memberId!));
  const restricted = tx.select({ id: agentAccess.agentId }).from(agentAccess);
  const allowed = tx
    .select({ id: agentAccess.agentId })
    .from(agentAccess)
    .where(or(eq(agentAccess.userId, ctx.user.id), member ? eq(agentAccess.roleId, member.roleId) : sql`false`));
  return or(sql`${agents.id} not in (${restricted})`, inArray(agents.id, allowed));
}

export async function canUseAgent(tx: Tx, ctx: OrgContext, agentId: string) {
  const filter = await visibleAgentIdsFilter(tx, ctx);
  const rows = await tx.select({ id: agents.id }).from(agents).where(and(eq(agents.id, agentId), filter));
  return rows.length > 0;
}
