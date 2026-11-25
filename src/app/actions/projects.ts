"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withPlatform } from "@/server/db/client";
import { customProjects, projectEvents } from "@/server/db/schema";
import { requirePlatformUser } from "@/server/auth/guards";
import { audit } from "@/server/audit/log";
import { parseForm, toErrorState, UserFacingError } from "@/server/actions/result";
import { optionalText, uuidSchema } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

const STATUSES = ["new", "discovery", "development", "configuration", "testing", "awaiting_approval", "active", "maintenance", "suspended"] as const;

const lines = (v?: string) => (v ?? "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 50);

const projectSchema = z.object({
  id: uuidSchema.optional(),
  organizationId: uuidSchema,
  name: z.string().trim().min(2).max(120),
  segment: optionalText(120),
  businessDescription: optionalText(5000),
  objectives: optionalText(5000),
  needs: optionalText(5000),
  processes: optionalText(10000),
  plannedAgents: optionalText(3000),
  requiredIntegrations: z.array(z.string().max(40)).default([]),
  ownerUserId: uuidSchema.optional(),
  goLiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function saveProjectAction(_: FormState, form: FormData): Promise<FormState> {
  let id: string | undefined;
  try {
    const user = await requirePlatformUser();
    const d = parseForm(projectSchema, form);
    // Processos: uma linha por processo, "*" no início = automatizar.
    const processes = lines(d.processes).map((l) => ({ name: l.replace(/^\*\s*/, "").split(":")[0].trim(), description: l.includes(":") ? l.split(":").slice(1).join(":").trim() : "", automate: l.startsWith("*") }));
    const values = {
      organizationId: d.organizationId,
      name: d.name,
      segment: d.segment ?? null,
      businessDescription: d.businessDescription ?? null,
      objectives: d.objectives ?? null,
      needs: d.needs ?? null,
      processes,
      plannedAgents: lines(d.plannedAgents),
      requiredIntegrations: d.requiredIntegrations,
      ownerUserId: d.ownerUserId ?? null,
      goLiveDate: d.goLiveDate ?? null,
      updatedAt: new Date(),
    };
    id = await withPlatform(user.id, async (tx) => {
      if (d.id) {
        const [p] = await tx.update(customProjects).set(values).where(eq(customProjects.id, d.id)).returning({ id: customProjects.id });
        if (!p) throw new UserFacingError("Projeto não encontrado.");
        await tx.insert(projectEvents).values({ organizationId: d.organizationId, projectId: p.id, type: "updated", message: "Levantamento atualizado", userId: user.id });
        return p.id;
      }
      const [p] = await tx.insert(customProjects).values(values).returning({ id: customProjects.id });
      await tx.insert(projectEvents).values({ organizationId: d.organizationId, projectId: p.id, type: "created", message: "Projeto criado", toStatus: "new", userId: user.id });
      await audit(tx, { organizationId: d.organizationId, actorUserId: user.id, action: "project.created", summary: `Projeto personalizado "${d.name}" criado`, entityType: "project", entityId: p.id });
      return p.id;
    });
    if (d.id) {
      revalidatePath(`/admin/projetos/${id}`);
      return { ok: "Projeto salvo." };
    }
  } catch (err) {
    return toErrorState(err);
  }
  redirect(`/admin/projetos/${id}`);
}

export async function changeProjectStatusAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requirePlatformUser();
    const d = parseForm(z.object({ id: uuidSchema, status: z.enum(STATUSES), note: optionalText(2000) }), form);
    await withPlatform(user.id, async (tx) => {
      const [p] = await tx.select().from(customProjects).where(eq(customProjects.id, d.id));
      if (!p) throw new UserFacingError("Projeto não encontrado.");
      if (p.status === d.status && !d.note) throw new UserFacingError("Nada mudou.");
      if (p.status !== d.status) await tx.update(customProjects).set({ status: d.status, updatedAt: new Date() }).where(eq(customProjects.id, d.id));
      await tx.insert(projectEvents).values({ organizationId: p.organizationId, projectId: p.id, type: p.status !== d.status ? "status" : "note", message: d.note ?? "Status alterado", fromStatus: p.status !== d.status ? p.status : null, toStatus: p.status !== d.status ? d.status : null, userId: user.id });
      if (p.status !== d.status) await audit(tx, { organizationId: p.organizationId, actorUserId: user.id, action: "project.status_changed", summary: `Projeto "${p.name}": ${p.status} → ${d.status}`, entityType: "project", entityId: p.id });
    });
    revalidatePath(`/admin/projetos/${d.id}`);
    return { ok: "Registrado no histórico." };
  } catch (err) {
    return toErrorState(err);
  }
}
