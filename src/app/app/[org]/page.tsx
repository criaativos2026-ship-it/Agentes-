import Link from "next/link";
import { ActivityIcon, BotIcon, CheckCircle2Icon, CpuIcon, PercentIcon } from "lucide-react";
import { can, requireOrgPermission } from "@/server/auth/guards";
import { getOrgDashboard } from "@/server/queries/org";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExecutionsChart } from "@/components/charts/executions-chart";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { compact, greeting, num, percent, when } from "@/lib/format";

function taskLabel(input: Record<string, unknown>) {
  const text = typeof input.message === "string" ? input.message : typeof input.task === "string" ? input.task : "";
  return text.length > 90 ? `${text.slice(0, 90)}…` : text || "Execução";
}

export default async function OrgDashboard({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrgPermission(org, "dashboard.view");
  const d = await getOrgDashboard(ctx);
  const base = `/app/${ctx.org.slug}`;
  const scopeHint = can(ctx, "executions.view_all") ? "da empresa" : "suas";
  return (
    <>
      <PageHeader
        eyebrow={ctx.org.name}
        title={`${greeting(new Date(), ctx.org.timezone)}, ${ctx.user.name.split(" ")[0]}`}
        description="Resumo dos últimos 30 dias, calculado a partir das execuções registradas."
        actions={can(ctx, "agents.use") && <Button asChild><Link href={`${base}/agentes`}><BotIcon /> Usar um agente</Link></Button>}
      />
      {d.pendingApprovals > 0 && can(ctx, "approvals.decide") && (
        <Link href={`${base}/aprovacoes`} className="mb-4 flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning hover:bg-warning/15">
          <CheckCircle2Icon className="size-5" /> {d.pendingApprovals} ação(ões) dos agentes aguardando sua aprovação.
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Agentes contratados" value={num(d.agents.contracted)} icon={BotIcon} tone="electric" />
        <StatCard label="Agentes ativos" value={num(d.agents.active)} icon={BotIcon} tone="success" />
        <StatCard label={`Tarefas executadas (${scopeHint})`} value={num(d.executions.succeeded)} hint={`${num(d.executions.total)} execuções no total`} icon={ActivityIcon} tone="brand" />
        <StatCard label="Taxa de sucesso" value={percent(d.executions.succeeded, d.executions.finished)} hint={d.executions.failed ? `${d.executions.failed} com erro` : "Execuções finalizadas"} icon={PercentIcon} tone={d.executions.failed ? "warning" : "success"} />
        <StatCard label={`Consumo de IA (${d.usage.period})`} value={compact(d.usage.tokens)} hint="tokens processados" icon={CpuIcon} tone="warning" />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Execuções por dia</CardTitle>
            <CardDescription>Últimos 30 dias ({scopeHint})</CardDescription>
          </CardHeader>
          <CardContent>
            {d.daily.length ? <ExecutionsChart data={d.daily} /> : <EmptyState icon={ActivityIcon} title="Nenhuma execução ainda" description="Quando os agentes trabalharem, o histórico aparece aqui." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Atividades recentes</CardTitle>
            {can(ctx, "executions.view") && <CardDescription><Link href={`${base}/execucoes`} className="text-electric hover:underline">Ver histórico completo</Link></CardDescription>}
          </CardHeader>
          <CardContent className="py-2">
            {d.recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">Nenhuma atividade ainda.</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.recent.map((r) => (
                  <li key={r.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`${base}/execucoes/${r.id}`} className="truncate text-sm font-medium hover:text-electric">{r.agentName ?? "Agente"}</Link>
                      <StatusBadge kind="execution" status={r.status} />
                    </div>
                    <p className="truncate text-xs text-ink-subtle">{taskLabel(r.input)} · {[r.by, when(r.createdAt, ctx.org.timezone)].filter(Boolean).join(" · ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
