/**
 * Função agendada da Netlify: a cada minuto, chama a rota protegida que processa a fila de execuções,
 * o ciclo de cobrança, automações agendadas e a limpeza LGPD.
 * Requer as variáveis APP_URL e CRON_SECRET no site da Netlify.
 * (Alternativa: rodar `npm run worker` num servidor/contêiner dedicado.)
 */
const workerCron = async () => {
  const url = `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/api/cron/worker`;
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  console.log(`[worker-cron] ${res.status} ${await res.text()}`);
};

export default workerCron;

export const config = { schedule: "* * * * *" };
