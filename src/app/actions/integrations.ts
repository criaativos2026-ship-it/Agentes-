"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertOrgPermission } from "@/server/auth/guards";
import { connectApiKeyIntegration, disconnectIntegration, retestIntegration } from "@/server/integrations/connect";
import { integrationDef } from "@/server/integrations/catalog";
import { isEncryptionConfigured } from "@/server/security/crypto";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { toErrorState, UserFacingError } from "@/server/actions/result";
import type { FormState } from "@/lib/form-state";

export async function connectIntegrationAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const slug = String(form.get("slug") ?? "");
    const key = z.string().max(40).parse(form.get("key"));
    const ctx = await assertOrgPermission(slug, "integrations.manage");
    if (!isEncryptionConfigured()) throw new UserFacingError("O servidor ainda não tem ENCRYPTION_KEY: não é possível guardar credenciais com segurança.");
    const def = integrationDef(key);
    if (!def) throw new UserFacingError("Integração inválida.");
    const lim = await hitRateLimit(`integration:${ctx.org.id}:${key}`, 20, 3600);
    if (!lim.allowed) throw new UserFacingError("Muitas tentativas. Aguarde um pouco.");
    const values = Object.fromEntries(def.fields.map((f) => [f.key, String(form.get(f.key) ?? "")]));
    const test = await connectApiKeyIntegration(ctx.org.id, ctx.user.id, key, values);
    revalidatePath(`/app/${ctx.org.slug}/integracoes`);
    return test.ok ? { ok: `${def.name} conectada — teste de comunicação OK${test.detail ? ` (${test.detail})` : ""}.` } : { error: `Credenciais salvas, mas o teste falhou: ${test.error}` };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function retestIntegrationAction(slug: string, key: string): Promise<FormState> {
  try {
    const ctx = await assertOrgPermission(slug, "integrations.manage");
    const r = await retestIntegration(ctx.org.id, ctx.user.id, z.string().max(40).parse(key));
    revalidatePath(`/app/${ctx.org.slug}/integracoes`);
    return r.ok ? { ok: "Comunicação OK." } : { error: `Teste falhou: ${r.error}` };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function disconnectIntegrationAction(slug: string, key: string): Promise<FormState> {
  try {
    const ctx = await assertOrgPermission(slug, "integrations.manage");
    await disconnectIntegration(ctx.org.id, ctx.user.id, z.string().max(40).parse(key));
    revalidatePath(`/app/${ctx.org.slug}/integracoes`);
    return { ok: "Integração desconectada e credenciais apagadas." };
  } catch (err) {
    return toErrorState(err);
  }
}
