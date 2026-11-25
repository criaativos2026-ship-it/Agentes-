import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { WorkflowIcon } from "lucide-react";
import { can, requireOrgPermission } from "@/server/auth/guards";
import { withOrg } from "@/server/db/client";
import { agents, workflows } from "@/server/db/schema";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { when } from "@/lib/format";
import { WorkflowEditor } from "./workflow-editor";

export const metadata: Metadata = { title: "Automações" };

const TRIGGER = { manual: "Manual", webhook: "Webhook", schedule: "Agenda", event: "Evento" } as const;
const STATUS = { draft: ["Rascunho", "default"], active: ["Ativa", "success"], paused: ["Pausada", "warning"] } as const;

export default async function AutomacoesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrgPermission(org, "workflows.view");
  const { list, agentOptions } = await withOrg(ctx.org.id, ctx.user.id, async (tx) => ({
    list: await tx.select().from(workflows).orderBy(desc(workflows.updatedAt)),
    agentOptions: await tx.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.status, "published")).orderBy(agents.name),
  }));
  return (
    <>
      <PageHeader eyebrow={ctx.org.name} title="Automações" description="Fluxos que encadeiam agentes, condições e aprovações — disparados manualmente, por webhook ou por agenda." />
      {list.length === 0 ? <EmptyState icon={WorkflowIcon} title="Nenhuma automação" /> : (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {list.map((w) => (
            <Link key={w.id} href={`/app/${ctx.org.slug}/automacoes/${w.id}`}>
              <Card className="transition-colors hover:border-line-strong">
                <CardContent className="grid gap-1">
                  <p className="flex items-center gap-2 font-semibold">{w.name} <Badge variant={STATUS[w.status][1]}>{STATUS[w.status][0]}</Badge> <Badge variant="outline">{TRIGGER[w.triggerType]}</Badge></p>
                  <p className="text-xs text-ink-subtle">{(w.definition as { nodes: unknown[] }).nodes.length} etapas · v{w.version} · {when(w.updatedAt, ctx.org.timezone)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {can(ctx, "workflows.manage") && (
        <Card>
          <CardHeader><CardTitle>Nova automação</CardTitle></CardHeader>
          <CardContent><WorkflowEditor slug={ctx.org.slug} agents={agentOptions} /></CardContent>
        </Card>
      )}
    </>
  );
}
