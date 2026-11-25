import "server-only";
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { claimNext, recoverStale } from "./queue";
import { processExecution } from "./engine";
import { purgeOldRateLimits } from "@/server/auth/rate-limit";
import { runBillingCycle } from "@/server/billing/service";
import { purgeExpiredData } from "@/server/services/retention";

export const workerId = () => `${hostname()}-${process.pid}-${randomBytes(3).toString("hex")}`;

/** Processa execuções até esvaziar a fila ou acabar o tempo (rota de cron / chamada após enfileirar). */
export async function drainQueue(opts: { budgetMs: number; maxJobs?: number; onlyId?: string; worker?: string }) {
  const id = opts.worker ?? workerId();
  const until = Date.now() + opts.budgetMs;
  let processed = 0;
  while (Date.now() < until && processed < (opts.maxJobs ?? 50)) {
    const exec = await claimNext(id, opts.onlyId);
    if (!exec) break;
    await processExecution(exec, id);
    processed++;
    if (opts.onlyId) break;
  }
  return processed;
}

let lastDaily = 0;

/** Manutenção periódica: execuções presas, limites de tentativas; 1x por hora: cobrança e retenção (LGPD). */
export async function maintenance() {
  const stale = await recoverStale();
  await purgeOldRateLimits();
  if (Date.now() - lastDaily > 60 * 60 * 1000) {
    lastDaily = Date.now();
    const billing = await runBillingCycle().catch((e) => (console.error("[cobrança]", e), null));
    const purged = await purgeExpiredData().catch((e) => (console.error("[retenção]", e), null));
    return { ...stale, billing, purged };
  }
  return stale;
}
