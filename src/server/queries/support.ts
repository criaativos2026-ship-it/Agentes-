import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { organizations, supportTicketMessages, supportTickets, users } from "@/server/db/schema";
import { when } from "@/lib/format";

/** Chamados com mensagens. Para o cliente, notas internas são removidas AQUI (no servidor). */
export async function loadTickets(tx: Tx, opts: { staffView: boolean; tz?: string }) {
  const tickets = await tx.select({ t: supportTickets, orgName: organizations.name, opener: users.name }).from(supportTickets).innerJoin(organizations, eq(organizations.id, supportTickets.organizationId)).leftJoin(users, eq(users.id, supportTickets.openedBy)).orderBy(desc(supportTickets.updatedAt)).limit(100);
  const ids = tickets.map((x) => x.t.id);
  const msgs = ids.length
    ? await tx.select({ m: supportTicketMessages, author: users.name, staff: users.platformRole }).from(supportTicketMessages).leftJoin(users, eq(users.id, supportTicketMessages.authorId)).where(inArray(supportTicketMessages.ticketId, ids)).orderBy(asc(supportTicketMessages.createdAt))
    : [];
  return tickets.map(({ t, orgName, opener }) => ({
    ...t,
    orgName,
    opener,
    messages: msgs
      .filter((x) => x.m.ticketId === t.id && (opts.staffView || !x.m.isInternal))
      .map((x) => ({ id: x.m.id, body: x.m.body, author: x.author, isInternal: x.m.isInternal, isStaff: x.staff !== null, when: when(x.m.createdAt, opts.tz) })),
  }));
}
