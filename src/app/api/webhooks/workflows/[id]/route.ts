import { NextResponse } from "next/server";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { withOrg, withPlatform } from "@/server/db/client";
import { workflows } from "@/server/db/schema";
import { startWorkflowRun } from "@/server/workflows/service";
import { drainQueue, sliceConfig } from "@/server/execution/worker";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { safeEqual, sha256 } from "@/server/security/crypto";
import { uuidSchema } from "@/lib/validation";

/**
 * Gatilho externo de automação: POST com "Authorization: Bearer <token>" e corpo JSON (ou texto).
 * Cabeçalho opcional "Idempotency-Key" evita disparos duplicados.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  const lim = await hitRateLimit(`wfhook:${id}`, 120, 60);
  if (!lim.allowed) return NextResponse.json({ error: "muitas requisições" }, { status: 429 });
  const [wf] = await withPlatform(null, (tx) => tx.select().from(workflows).where(eq(workflows.id, id)));
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!wf || wf.triggerType !== "webhook" || !wf.webhookSecretHash || !token || !safeEqual(sha256(token), wf.webhookSecretHash)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  if (wf.status !== "active") return NextResponse.json({ error: "automação inativa" }, { status: 409 });
  const raw = (await req.text()).slice(0, 50_000);
  let text = raw;
  try {
    text = JSON.stringify(JSON.parse(raw));
  } catch {
    /* corpo em texto */
  }
  const key = req.headers.get("idempotency-key")?.slice(0, 100);
  const res = await withOrg(wf.organizationId, null, (tx) => startWorkflowRun(tx, wf, { text, triggeredBy: null, source: "webhook", idempotencyKey: key ? `hook:${wf.id}:${key}` : undefined }));
  after(() => drainQueue({ ...sliceConfig(280_000) }).catch(() => undefined));
  return NextResponse.json({ runId: res.runId, executionId: res.executionId, duplicate: res.duplicate }, { status: res.duplicate ? 200 : 202 });
}
