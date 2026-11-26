"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "@/server/db/client";
import { workflows } from "@/server/db/schema";
import { assertOrgPermission } from "@/server/auth/guards";
import { definitionSchema } from "@/server/workflows/definition";
import { startWorkflowRun } from "@/server/workflows/service";
import { drainQueue, sliceConfig } from "@/server/execution/worker";
import { randomToken, sha256 } from "@/server/security/crypto";
import { audit } from "@/server/audit/log";
import { toErrorState, UserFacingError } from "@/server/actions/result";
import { optionalText, uuidSchema } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

const saveSchema = z.object({
  slug: z.string(),
  id: uuidSchema.optional(),
  name: z.string().trim().min(2).max(120),
  description: optionalText(1000),
  triggerType: z.enum(["manual", "webhook", "schedule"]),
  everyMinutes: z.coerce.number().int().min(5).max(10080).optional(),
  scheduleInput: optionalText(2000),
  definition: z.string().max(100_000),
});

export async function saveWorkflowAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const raw = Object.fromEntries([...form.entries()].map(([k, v]) => [k, v === "" ? undefined : v]));
    const d = saveSchema.parse(raw);
    const ctx = await assertOrgPermission(d.slug, "workflows.manage");
    let json: unknown;
    try {
      json = JSON.parse(d.definition);
    } catch {
      throw new UserFacingError("Definição inválida.");
    }
    const def = definitionSchema.safeParse(json);
    if (!def.success) throw new UserFacingError(def.error.issues[0]?.message ?? "Definição inválida.");
    if (d.triggerType === "schedule" && !d.everyMinutes) throw new UserFacingError("Informe o intervalo da agenda (mínimo 5 minutos).");
    const triggerConfig = d.triggerType === "schedule" ? { everyMinutes: d.everyMinutes, input: d.scheduleInput ?? "" } : {};
    const id = await withOrg(ctx.org.id, ctx.user.id, async (tx) => {
      if (d.id) {
        const [w] = await tx.select().from(workflows).where(eq(workflows.id, d.id));
        if (!w) throw new UserFacingError("Automação não encontrada.");
        await tx.update(workflows).set({ name: d.name, description: d.description ?? null, triggerType: d.triggerType, triggerConfig, definition: def.data, version: w.version + 1, updatedAt: new Date() }).where(eq(workflows.id, d.id));
        await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, action: "workflow.updated", summary: `Automação "${d.name}" atualizada (v${w.version + 1})` });
        return d.id;
      }
      const [w] = await tx.insert(workflows).values({ organizationId: ctx.org.id, name: d.name, description: d.description, triggerType: d.triggerType, triggerConfig, definition: def.data, createdBy: ctx.user.id }).returning({ id: workflows.id });
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, action: "workflow.created", summary: `Automação "${d.name}" criada` });
      return w.id;
    });
    revalidatePath(`/app/${ctx.org.slug}/automacoes`);
    return { ok: "Automação salva.", id };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function setWorkflowStatusAction(slug: string, id: string, status: "active" | "paused" | "draft"): Promise<FormState> {
  try {
    const ctx = await assertOrgPermission(slug, "workflows.manage");
    uuidSchema.parse(id);
    z.enum(["active", "paused", "draft"]).parse(status);
    await withOrg(ctx.org.id, ctx.user.id, async (tx) => {
      const [w] = await tx.update(workflows).set({ status, updatedAt: new Date() }).where(and(eq(workflows.id, id), eq(workflows.organizationId, ctx.org.id))).returning();
      if (!w) throw new UserFacingError("Automação não encontrada.");
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, action: `workflow.${status}`, summary: `Automação "${w.name}": ${status === "active" ? "ativada" : status === "paused" ? "pausada" : "rascunho"}` });
    });
    revalidatePath(`/app/${ctx.org.slug}/automacoes`);
    return { ok: "Status atualizado." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function runWorkflowNowAction(slug: string, id: string, text: string): Promise<FormState> {
  try {
    const ctx = await assertOrgPermission(slug, "workflows.manage");
    uuidSchema.parse(id);
    const input = z.string().max(20000).parse(text);
    const res = await withOrg(ctx.org.id, ctx.user.id, async (tx) => {
      const [w] = await tx.select().from(workflows).where(eq(workflows.id, id));
      if (!w) throw new UserFacingError("Automação não encontrada.");
      return startWorkflowRun(tx, w, { text: input, triggeredBy: ctx.user.id, source: "manual" });
    });
    after(() => drainQueue({ ...sliceConfig(280_000) }).catch(() => undefined));
    revalidatePath(`/app/${ctx.org.slug}/automacoes`);
    return { ok: "Automação disparada.", id: res.executionId };
  } catch (err) {
    return toErrorState(err);
  }
}

/** Gera um novo token do webhook (mostrado UMA vez; no banco fica só o hash). */
export async function rotateWebhookTokenAction(slug: string, id: string): Promise<FormState & { token?: string }> {
  try {
    const ctx = await assertOrgPermission(slug, "workflows.manage");
    uuidSchema.parse(id);
    const token = randomToken(24);
    await withOrg(ctx.org.id, ctx.user.id, async (tx) => {
      const [w] = await tx.update(workflows).set({ webhookSecretHash: sha256(token) }).where(eq(workflows.id, id)).returning({ name: workflows.name });
      if (!w) throw new UserFacingError("Automação não encontrada.");
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, action: "workflow.webhook_token_rotated", summary: `Token do webhook da automação "${w.name}" gerado` });
    });
    return { ok: "Token gerado. Copie agora: ele não será exibido novamente.", token };
  } catch (err) {
    return toErrorState(err);
  }
}
