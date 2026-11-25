"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg, withPlatform } from "@/server/db/client";
import { supportTicketMessages, supportTickets, tasks } from "@/server/db/schema";
import { assertOrgPermission, requirePlatformUser } from "@/server/auth/guards";
import { audit } from "@/server/audit/log";
import { parseForm, toErrorState, UserFacingError } from "@/server/actions/result";
import { uuidSchema } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

export async function openTicketAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const d = parseForm(z.object({ slug: z.string(), subject: z.string().trim().min(4).max(200), body: z.string().trim().min(5).max(10000), priority: z.enum(["low", "normal", "high", "urgent"]).default("normal") }), form);
    const ctx = await assertOrgPermission(d.slug, "support.use");
    await withOrg(ctx.org.id, ctx.user.id, async (tx) => {
      const [t] = await tx.insert(supportTickets).values({ organizationId: ctx.org.id, openedBy: ctx.user.id, subject: d.subject, priority: d.priority }).returning({ id: supportTickets.id });
      await tx.insert(supportTicketMessages).values({ organizationId: ctx.org.id, ticketId: t.id, authorId: ctx.user.id, body: d.body });
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, action: "support.ticket_opened", summary: `Chamado aberto: ${d.subject}`, entityType: "ticket", entityId: t.id });
    });
    revalidatePath(`/app/${ctx.org.slug}/suporte`);
    return { ok: "Chamado aberto. A equipe NEXUS vai responder por aqui." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function replyTicketAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const d = parseForm(z.object({ slug: z.string().optional(), ticketId: uuidSchema, body: z.string().trim().min(1).max(10000), internal: z.literal("on").optional(), status: z.enum(["open", "in_progress", "waiting_customer", "resolved", "closed"]).optional() }), form);
    if (d.slug) {
      const ctx = await assertOrgPermission(d.slug, "support.use");
      await withOrg(ctx.org.id, ctx.user.id, async (tx) => {
        const [t] = await tx.select().from(supportTickets).where(eq(supportTickets.id, d.ticketId));
        if (!t) throw new UserFacingError("Chamado não encontrado.");
        if (t.status === "closed") throw new UserFacingError("Chamado encerrado. Abra um novo.");
        await tx.insert(supportTicketMessages).values({ organizationId: ctx.org.id, ticketId: t.id, authorId: ctx.user.id, body: d.body, isInternal: false });
        await tx.update(supportTickets).set({ status: t.status === "waiting_customer" || t.status === "resolved" ? "open" : t.status, updatedAt: new Date() }).where(eq(supportTickets.id, t.id));
      });
      revalidatePath(`/app/${ctx.org.slug}/suporte`);
    } else {
      const user = await requirePlatformUser();
      await withPlatform(user.id, async (tx) => {
        const [t] = await tx.select().from(supportTickets).where(eq(supportTickets.id, d.ticketId));
        if (!t) throw new UserFacingError("Chamado não encontrado.");
        await tx.insert(supportTicketMessages).values({ organizationId: t.organizationId, ticketId: t.id, authorId: user.id, body: d.body, isInternal: d.internal === "on" });
        await tx.update(supportTickets).set({ status: d.status ?? (d.internal ? t.status : "waiting_customer"), assignedTo: t.assignedTo ?? user.id, updatedAt: new Date() }).where(eq(supportTickets.id, t.id));
      });
      revalidatePath("/admin/suporte");
    }
    return { ok: "Mensagem enviada." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function createTaskAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const d = parseForm(z.object({ slug: z.string(), title: z.string().trim().min(3).max(200), description: z.string().trim().max(4000).optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), form);
    const ctx = await assertOrgPermission(d.slug, "tasks.manage");
    await withOrg(ctx.org.id, ctx.user.id, (tx) => tx.insert(tasks).values({ organizationId: ctx.org.id, title: d.title, description: d.description, dueAt: d.dueDate ? new Date(`${d.dueDate}T12:00:00Z`) : null, createdBy: ctx.user.id, assigneeId: ctx.user.id }));
    revalidatePath(`/app/${ctx.org.slug}/tarefas`);
    return { ok: "Tarefa criada." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function setTaskStatusAction(slug: string, taskId: string, status: "open" | "in_progress" | "done" | "canceled"): Promise<FormState> {
  try {
    const ctx = await assertOrgPermission(slug, "tasks.manage");
    uuidSchema.parse(taskId);
    z.enum(["open", "in_progress", "done", "canceled"]).parse(status);
    await withOrg(ctx.org.id, ctx.user.id, (tx) => tx.update(tasks).set({ status }).where(and(eq(tasks.id, taskId), eq(tasks.organizationId, ctx.org.id))));
    revalidatePath(`/app/${ctx.org.slug}/tarefas`);
    return { ok: "Tarefa atualizada." };
  } catch (err) {
    return toErrorState(err);
  }
}
