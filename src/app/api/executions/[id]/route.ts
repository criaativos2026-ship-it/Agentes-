import { NextResponse } from "next/server";
import { getOrgContext, getSession, isPlatformUser, can } from "@/server/auth/guards";
import { executionOwner, getExecutionDetail } from "@/server/queries/executions";
import { uuidSchema } from "@/lib/validation";
import { hasAcceptedPrivacy } from "@/lib/privacy";

/** Acompanhamento ao vivo de uma execução (usado pelo chat e pela tela de detalhes). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const s = await getSession();
  if (!s || !hasAcceptedPrivacy(s.user)) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const owner = await executionOwner(id);
  if (!owner) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!isPlatformUser(s.user)) {
    const ctx = await getOrgContext(owner.slug);
    const allowed = ctx && (can(ctx, "executions.view_all") || (can(ctx, "executions.view") && owner.triggeredBy === s.user.id) || (can(ctx, "agents.use") && owner.triggeredBy === s.user.id));
    if (!allowed) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  }
  const d = await getExecutionDetail(owner.orgId, id);
  if (!d) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  return NextResponse.json(
    {
      id: d.exec.id,
      status: d.exec.status,
      error: d.exec.error,
      output: d.exec.output,
      tokens: d.exec.tokensIn + d.exec.tokensOut,
      steps: d.steps.map((st) => ({ id: st.id, ordinal: st.ordinal, type: st.type, name: st.name, status: st.status, durationMs: st.durationMs, error: st.error, output: st.type === "llm" ? null : st.output })),
      approvals: d.approvals.map((a) => ({ id: a.id, summary: a.summary, status: a.status })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
