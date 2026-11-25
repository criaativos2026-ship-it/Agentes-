import "server-only";
import { z } from "zod";
import { AccessDeniedError, UserFacingError } from "@/server/errors";

export type { FormState } from "@/lib/form-state";

export { UserFacingError };

/** Converte qualquer erro em mensagem segura (sem detalhes internos para o usuário). */
export function toErrorState(err: unknown): { error: string } {
  if (err instanceof UserFacingError || err instanceof AccessDeniedError) return { error: err.message };
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
  // redirect()/notFound() do Next precisam seguir adiante.
  if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string") {
    const digest = (err as { digest: string }).digest;
    if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) throw err;
  }
  console.error("[action] erro inesperado:", err);
  return { error: "Não foi possível concluir. Tente novamente em instantes." };
}

/** Lê FormData com um schema Zod (campos vazios viram undefined). */
export function parseForm<S extends z.ZodType>(schema: S, form: FormData): z.infer<S> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const value = typeof v === "string" ? v : v;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      (obj[key] ??= [] as unknown[]);
      (obj[key] as unknown[]).push(value);
    } else obj[k] = value === "" ? undefined : value;
  }
  return schema.parse(obj);
}
