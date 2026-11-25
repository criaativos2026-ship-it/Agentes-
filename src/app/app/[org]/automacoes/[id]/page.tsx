import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { can, requireOrgPermission } from "@/server/auth/guards";
import { withOrg } from "@/server/db/client";
import { agents, workflows } from "@/server/db/schema";
import { lastRuns } from "@/server/workflows/service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { uuidSchema } from "@/lib/validation";
import { when } from "@/lib/format";
import { WorkflowEditor } from "../workflow-editor";
import { RunNow, StatusButtons, WebhookToken } from "./controls";

export const metadata: Metadata = { title: "Automação" };

export default async function AutomacaoPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await requireOrgPermission(org, "workflows.view");
  if (!uuidSchema.safeParse(id).success) notFound();
  const d = await withOrg(ctx.org.id, ctx.user.id, async (tx) => {
    const [w] = await tx.select().from(workflows).where(eq(workflows.id, id));
    if (!w) return null;
    return { w, runs: await lastRuns(tx, id), agentOptions: await tx.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.status, "published")) };
  });
  if (!d) notFound();
  const manage = can(ctx, "workflows.manage");
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return (
    <>
      <PageHeader eyebrow="Automação" title={d.w.name} description={d.w.description ?? undefined} actions={manage && <StatusButtons slug={ctx.org.slug} id={id} status={d.w.status} />} />
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div>{manage ? <WorkflowEditor slug={ctx.org.slug} agents={d.agentOptions} workflow={{ ...d.w, triggerConfig: d.w.triggerConfig as { everyMinutes?: number; input?: string }, definition: d.w.definition as { nodes: never[] } }} /> : <pre className="overflow-auto rounded-lg bg-bg-alt p-3 text-xs">{JSON.stringify(d.w.definition, null, 2)}</pre>}</div>
        <div className="grid content-start gap-4">
          {manage && (
            <Card>
              <CardHeader><CardTitle>Executar agora</CardTitle></CardHeader>
              <CardContent><RunNow slug={ctx.org.slug} id={id} /></CardContent>
            </Card>
          )}
          {manage && d.w.triggerType === "webhook" && (
            <Card>
              <CardHeader><CardTitle>Webhook</CardTitle><CardDescription>POST com cabeçalho Authorization: Bearer &lt;token&gt;</CardDescription></CardHeader>
              <CardContent><code className="block break-all rounded-md bg-bg-alt p-2 text-xs">{appUrl}/api/webhooks/workflows/{id}</code><WebhookToken slug={ctx.org.slug} id={id} hasToken={!!d.w.webhookSecretHash} /></CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Últimas execuções</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {d.runs.length === 0 ? <p className="text-ink-muted">Nenhuma ainda.</p> : d.runs.map((r) => (
                <Link key={r.id} href={r.executionId ? `/app/${ctx.org.slug}/execucoes/${r.executionId}` : "#"} className="flex items-center justify-between gap-2 hover:text-electric">
                  <span className="text-xs">{when(r.createdAt, ctx.org.timezone)} · {String((r.input as { source?: string }).source ?? "")}</span>
                  {["queued", "succeeded", "failed"].includes(r.status) ? <StatusBadge kind="execution" status={r.status} /> : <span className="text-xs">{r.status}</span>}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
