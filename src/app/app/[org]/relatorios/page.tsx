import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FileTextIcon } from "lucide-react";
import { requireOrgPermission } from "@/server/auth/guards";
import { withOrg } from "@/server/db/client";
import { agents, reports } from "@/server/db/schema";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { when } from "@/lib/format";

export const metadata: Metadata = { title: "Relatórios" };

export default async function RelatoriosPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrgPermission(org, "reports.view");
  const rows = await withOrg(ctx.org.id, ctx.user.id, (tx) => tx.select({ id: reports.id, title: reports.title, createdAt: reports.createdAt, agentName: agents.name }).from(reports).leftJoin(agents, eq(agents.id, reports.agentId)).orderBy(desc(reports.createdAt)).limit(200));
  return (
    <>
      <PageHeader eyebrow={ctx.org.name} title="Relatórios" description="Relatórios produzidos pelos agentes. Para indicadores, veja o Painel e o Histórico de atividades." />
      {rows.length === 0 ? <EmptyState icon={FileTextIcon} title="Nenhum relatório ainda" description="Agentes com a ferramenta “Criar relatório” salvam os resultados aqui." /> : (
        <Card><CardContent className="p-0"><ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id}><Link href={`/app/${ctx.org.slug}/relatorios/${r.id}`} className="block px-5 py-3 hover:bg-surface-2/40"><p className="font-medium">{r.title}</p><p className="text-xs text-ink-subtle">{r.agentName ?? "—"} · {when(r.createdAt, ctx.org.timezone)}</p></Link></li>
          ))}
        </ul></CardContent></Card>
      )}
    </>
  );
}
