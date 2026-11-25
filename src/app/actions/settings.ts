"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/server/auth/guards";
import { removePlatformProviderKey, savePlatformProviderKey } from "@/server/ai/credentials";
import { isEncryptionConfigured } from "@/server/security/crypto";
import { parseForm, toErrorState, UserFacingError } from "@/server/actions/result";
import type { FormState } from "@/lib/form-state";

const keySchema = z.object({
  provider: z.enum(["anthropic", "openai", "openai_compatible"]),
  apiKey: z.string().trim().min(10, "Chave muito curta.").max(500),
  baseUrl: z.string().trim().url("URL inválida.").optional(),
  testModel: z.string().trim().min(2).max(120).regex(/^[\w.:/-]+$/),
});

export async function saveProviderKeyAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requireSuperAdmin();
    if (!isEncryptionConfigured()) throw new UserFacingError("Configure ENCRYPTION_KEY no servidor antes de salvar chaves.");
    const data = parseForm(keySchema, form);
    const test = await savePlatformProviderKey(user.id, data);
    revalidatePath("/admin/configuracoes");
    return test.ok ? { ok: "Chave salva e comunicação testada com sucesso." } : { error: `Chave salva, mas o teste falhou: ${test.error}` };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function removeProviderKeyAction(provider: string): Promise<FormState> {
  try {
    const user = await requireSuperAdmin();
    const p = z.enum(["anthropic", "openai", "openai_compatible"]).parse(provider);
    await removePlatformProviderKey(user.id, p);
    revalidatePath("/admin/configuracoes");
    return { ok: "Chave removida." };
  } catch (err) {
    return toErrorState(err);
  }
}
