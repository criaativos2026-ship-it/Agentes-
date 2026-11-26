import "server-only";
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { claimNext, recoverStale } from "./queue";
import { processExecution } from "./engine";
import { purgeOldRateLimits } from "@/server/auth/rate-limit";
import { runBillingCycle } from "@/server/billing/service";
import { purgeExpiredData } from "@/server/services/retention";
import { runScheduledWorkflows } from "@/server/workflows/service";

export const workerId = () => `${hostname()}-${process.pid}-${randomBytes(3).toString("hex")}`;

/**
 * Limites de tempo por chamada. Em hospedagem serverless (ex.: Netlify, 60 s por requisição) defina
 * WORKER_BUDGET_MS (tempo para começar trabalho novo) e WORKER_HARD_LIMIT_MS (limite absoluto):
 * as execuções são fatiadas e retomadas na chamada seguinte. No worker dedicado não há limite curto.
 */
export function sliceConfig(defaultBudget: number) {
  const budget = Number(process.env.WORKER_BUDGET_MS) || defaultBudget;
  const hard = Number(process.env.WORKER_HARD_LIMIT_MS) || 0;
  return { budgetMs: hard ? Math.min(budget, hard - 15_000) : budget, hardLimitMs: hard || undefined };
}

/** Processa execuções até esvaziar a fila ou acabar o tempo (rota de cron / chamada após enfileirar). */
export async function drainQueue(opts: { budgetMs: number; hardLimitMs?: number; maxJobs?: number; onlyId?: string; worker?: string }) {
  const id = opts.worker ?? workerId();
  const start = Date.now();
  const until = start + opts.budgetMs;
  const hardStopAt = opts.hardLimitMs ? start + opts.hardLimitMs : undefined;
  let processed = 0;
  while (Date.now() < until && processed < (opts.maxJobs ?? 50)) {
    const exec = await claimNext(id, opts.onlyId);
    if (!exec) break;
    await processExecution(exec, id, { sliceEndsAt: until, hardStopAt });
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
  await runScheduledWorkflows().catch((e) => console.error("[automações agendadas]", e));
  if (Date.now() - lastDaily > 60 * 60 * 1000) {
    lastDaily = Date.now();
    const billing = await runBillingCycle().catch((e) => (console.error("[cobrança]", e), null));
    const purged = await purgeExpiredData().catch((e) => (console.error("[retenção]", e), null));
    return { ...stale, billing, purged };
  }
  return stale;
}
