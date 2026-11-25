/**
 * Worker dedicado: processa a fila de execuções continuamente.
 * Uso: npm run worker   (precisa das mesmas variáveis de ambiente do app)
 * Pode rodar várias instâncias em paralelo (a fila usa FOR UPDATE SKIP LOCKED).
 */
import { drainQueue, maintenance, workerId } from "../src/server/execution/worker";
import { closeDb } from "../src/server/db/client";

const id = workerId();
let running = true;
process.on("SIGTERM", () => (running = false));
process.on("SIGINT", () => (running = false));
console.log(`[worker ${id}] iniciado`);

let lastMaintenance = 0;
while (running) {
  try {
    if (Date.now() - lastMaintenance > 60_000) {
      const r = await maintenance();
      if (r.requeued || r.timedOut) console.log(`[worker] recuperadas: ${r.requeued} · tempo esgotado: ${r.timedOut}`);
      lastMaintenance = Date.now();
    }
    const n = await drainQueue({ budgetMs: 30_000, worker: id });
    if (n === 0) await new Promise((r) => setTimeout(r, 1000));
  } catch (err) {
    console.error("[worker] erro no ciclo:", err);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
await closeDb();
console.log(`[worker ${id}] encerrado`);
