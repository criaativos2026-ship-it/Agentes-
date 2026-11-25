import { NextResponse } from "next/server";
import { drainQueue, maintenance } from "@/server/execution/worker";
import { safeEqual } from "@/server/security/crypto";

export const maxDuration = 300;

/**
 * Processamento da fila para hospedagem serverless: um agendador (ex.: Netlify Scheduled Functions,
 * Vercel Cron, cron externo) chama esta rota a cada minuto com "Authorization: Bearer CRON_SECRET".
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16 || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const stale = await maintenance();
  const processed = await drainQueue({ budgetMs: 240_000 });
  return NextResponse.json({ processed, ...stale });
}
