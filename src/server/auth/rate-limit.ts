import "server-only";
import { sql } from "drizzle-orm";
import { runScoped } from "@/server/db/client";
import { sha256 } from "@/server/security/crypto";

export type RateLimitResult = { allowed: boolean; count: number; limit: number; resetAt: Date };

/**
 * Limite por janela fixa, guardado no banco (funciona com vários servidores/instâncias serverless).
 * A chave é sempre transformada em hash: nenhum e-mail ou IP fica em texto claro nesta tabela.
 */
export async function hitRateLimit(rawKey: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const key = sha256(rawKey);
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000);
  const resetAt = new Date(windowStart.getTime() + windowSeconds * 1000);
  const count = await runScoped({ scope: "auth" }, async (tx) => {
    const rows = await tx.execute<{ count: number }>(sql`
      insert into rate_limit_buckets (key, window_start, count) values (${key}, ${windowStart.toISOString()}, 1)
      on conflict (key, window_start) do update set count = rate_limit_buckets.count + 1
      returning count`);
    return Number(rows[0]?.count ?? 1);
  });
  return { allowed: count <= limit, count, limit, resetAt };
}

/** Consulta sem incrementar. */
export async function peekRateLimit(rawKey: string, limit: number, windowSeconds: number) {
  const key = sha256(rawKey);
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const count = await runScoped({ scope: "auth" }, async (tx) => {
    const rows = await tx.execute<{ count: number }>(
      sql`select count from rate_limit_buckets where key = ${key} and window_start = ${windowStart.toISOString()}`,
    );
    return Number(rows[0]?.count ?? 0);
  });
  return count >= limit;
}

export async function clearRateLimit(rawKey: string) {
  const key = sha256(rawKey);
  await runScoped({ scope: "auth" }, (tx) => tx.execute(sql`delete from rate_limit_buckets where key = ${key}`));
}

/** Limpeza periódica de janelas antigas (chamada pelo worker). */
export async function purgeOldRateLimits() {
  await runScoped({ scope: "auth" }, (tx) =>
    tx.execute(sql`delete from rate_limit_buckets where window_start < now() - interval '1 day'`),
  );
}
