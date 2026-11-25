import Link from "next/link";
import { ActivityIcon, AlertTriangleIcon, BotIcon, Building2Icon, CoinsIcon, CpuIcon, RepeatIcon, ReceiptIcon } from "lucide-react";
import { requirePlatformUser } from "@/server/auth/guards";
import { getAdminDashboard } from "@/server/queries/admin";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExecutionsChart } from "@/components/charts/executions-chart";
import { EmptyState } from "@/components/empty-state";
import { compact, greeting, money, num, usdMicros, when } from "@/lib/format";

export default async function AdminDashboard() {
  const user = await requirePlatformUser();
  const d = await getAdminDashboard(user.id);
  return (
    <>
      <PageHeader eyebrow="Visão geral" title={`${greeting()}, ${user.name.split(" ")[0]}`} description="Indicadores calculados em tempo real a partir do banco de dados." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Empresas cadastradas" value={num(d.orgs.total)} hint={d.orgs.demo ? `${d.orgs.demo} de demonstração` : undefined} icon={Building2Icon} tone="electric" />
        <StatCard label="Empresas ativas" value={num(d.orgs.active)} hint="Ativas ou em avaliação" icon={Building2Icon} tone="success" />
        <StatCard label="Agentes criados" value={num(d.agents.total)} icon={BotIcon} tone="brand" />
        <StatCard label="Agentes em funcionamento" value={num(d.agents.published)} hint="Publicados" icon={BotIcon} tone="success" />
        <StatCard label="Execuções (30 dias)" value={num(d.executions.total)} hint={d.executions.running ? `${d.executions.running} em andamento` : undefined} icon={ActivityIcon} tone="electric" />
        <StatCard label="Execuções com erro (30 dias)" value={num(d.executions.failed)} icon={AlertTriangleIcon} tone={d.executions.failed ? "danger" : "default"} />
        <StatCard label={`Consumo de IA (${d.usage.period})`} value={compact(d.usage.tokens)} hint={`tokens · custo estimado ${usdMicros(d.usage.costMicros)}`} icon={CpuIcon} tone="warning" />
        <StatCard label="Receita recorrente (MRR)" value={money(d.revenue.mrrCents)} hint={`${d.revenue.activeSubscriptions} assinaturas ativas${d.revenue.pastDue ? ` · ${d.revenue.pastDue} inadimplente(s)` : ""}`} icon={RepeatIcon} tone="success" />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Execuções por dia</CardTitle>
            <CardDescription>Últimos 30 dias, todas as empresas (sem execuções de teste)</CardDescription>
          </CardHeader>
          <CardContent>
            {d.daily.length ? <ExecutionsChart data={d.daily} /> : <EmptyState icon={ActivityIcon} title="Nenhuma execução ainda" description="As execuções dos agentes aparecerão aqui." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Atividades recentes</CardTitle>
            <CardDescription>
              <Link href="/admin/auditoria" className="text-electric hover:underline">Ver todas</Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="py-2">
            {d.recent.length === 0 ? (
              <EmptyState icon={ReceiptIcon} title="Sem atividades" />
            ) : (
              <ul className="divide-y divide-line">
                {d.recent.map((r) => (
                  <li key={r.id} className="py-2.5">
                    <p className="text-sm text-ink">{r.summary}</p>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {[r.orgName, r.actor, when(r.createdAt)].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-subtle">
        <CoinsIcon className="size-3.5" /> Custo de IA estimado pelos preços de tabela dos provedores; a fatura oficial é a do provedor.
      </p>
    </>
  );
}
