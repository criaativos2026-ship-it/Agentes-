import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2Icon } from "lucide-react";
import { requireOrgPermission } from "@/server/auth/guards";
import { listPendingApprovals } from "@/server/queries/org";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { ApprovalButtons } from "@/components/executions/execution-controls";
import { when } from "@/lib/format";

export const metadata: Metadata = { title: "Aprovações" };

export default async function ApprovalsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrgPermission(org, "approvals.decide");
  const list = await listPendingApprovals(ctx);
  return (
    <>
      <PageHeader eyebrow={ctx.org.name} title="Aprovações" description="Ações sensíveis dos agentes (envios externos, alterações importantes) só acontecem depois da sua aprovação." />
      {list.length === 0 ? (
        <EmptyState icon={CheckCircle2Icon} title="Nada aguardando aprovação" />
      ) : (
        <div className="grid gap-3">
          {list.map((a) => (
            <Card key={a.id}>
              <CardContent className="grid gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{a.summary}</p>
                    <p className="text-xs text-ink-subtle">
                      {a.agentName} · pedido de {a.by ?? "gatilho automático"} · {when(a.requestedAt, ctx.org.timezone)} ·{" "}
                      <Link href={`/app/${ctx.org.slug}/execucoes/${a.executionId}`} className="text-electric hover:underline">ver execução</Link>
                    </p>
                  </div>
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-ink-muted">Ver exatamente o que será feito</summary>
                  <pre className="mt-1.5 max-h-64 overflow-auto rounded-md bg-bg-alt p-2.5 text-[11px] text-ink-muted">{JSON.stringify(a.payload, null, 2)}</pre>
                </details>
                <ApprovalButtons slug={ctx.org.slug} approvalId={a.id} summary={a.summary} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
