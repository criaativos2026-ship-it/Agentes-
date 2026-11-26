/**
 * Função agendada da Netlify: a cada minuto, chama a rota protegida que processa a fila de execuções,
 * o ciclo de cobrança, automações agendadas e a limpeza LGPD.
 * Requer as variáveis APP_URL e CRON_SECRET no site da Netlify.
 * (Alternativa: rodar `npm run worker` num servidor/contêiner dedicado.)
 */
const workerCron = async () => {
  const base = (process.env.APP_URL || process.env.URL || "").replace(/\/$/, "");
  const url = `${base}/api/cron/worker`;
  // Funções agendadas têm 30 s; a rota continua processando no servidor mesmo se esta espera terminar antes.
  try {
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(25_000) });
    console.log(`[worker-cron] ${res.status} ${await res.text()}`);
  } catch (err) {
    console.log(`[worker-cron] chamada enviada (${err instanceof Error ? err.name : "erro"})`);
  }
};

export default workerCron;

export const config = { schedule: "* * * * *" };
