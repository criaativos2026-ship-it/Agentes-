import { CheckCircle2Icon, ClockIcon, CircleDashedIcon, CpuIcon, WrenchIcon, XCircleIcon, ShieldCheckIcon, ScrollTextIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { duration, num, usdMicros, when } from "@/lib/format";
import type { getExecutionDetail } from "@/server/queries/executions";

type Detail = NonNullable<Awaited<ReturnType<typeof getExecutionDetail>>>;

const TYPE_ICON = { llm: CpuIcon, tool: WrenchIcon, approval: ShieldCheckIcon, log: ScrollTextIcon, retrieval: ScrollTextIcon, workflow_node: ScrollTextIcon } as const;

function statusIcon(s: string) {
  if (s === "succeeded") return <CheckCircle2Icon className="size-4 text-success" />;
  if (s === "failed") return <XCircleIcon className="size-4 text-danger" />;
  if (s === "waiting") return <ClockIcon className="size-4 text-warning" />;
  return <CircleDashedIcon className="size-4 text-ink-subtle" />;
}

/** Linha do tempo da execução: cada passo com entrada, saída, erro e duração (somente leitura). */
export function ExecutionDetail({ d, tz, showCost }: { d: Detail; tz?: string; showCost?: boolean }) {
  const e = d.exec;
  const total = e.startedAt && e.finishedAt ? e.finishedAt.getTime() - e.startedAt.getTime() : null;
  const request = String(e.input.message ?? e.input.task ?? "");
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-4">
        <Card>
          <CardHeader><CardTitle>Solicitação</CardTitle><CardDescription>{d.by ? `Por ${d.by}` : "Disparo automático"} · {when(e.createdAt, tz)}</CardDescription></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{request || "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Etapas ({d.steps.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {d.steps.length === 0 ? (
              <p className="p-5 text-sm text-ink-muted">Nenhuma etapa registrada ainda.</p>
            ) : (
              <ol className="divide-y divide-line">
                {d.steps.map((s) => {
                  const Icon = TYPE_ICON[s.type as keyof typeof TYPE_ICON] ?? ScrollTextIcon;
                  return (
                    <li key={s.id} className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        {statusIcon(s.status)}
                        <Icon className="size-4 text-ink-subtle" />
                        <span className="flex-1 text-sm font-medium">{s.ordinal}. {s.name}</span>
                        <span className="text-xs text-ink-subtle tabular-nums">{duration(s.durationMs)}</span>
                      </div>
                      {s.error && <p className="mt-1.5 rounded-md bg-danger/10 px-2 py-1.5 text-xs text-danger">{s.error}</p>}
                      {(s.input != null || s.output != null) && (
                        <details className="mt-1.5 text-xs">
                          <summary className="cursor-pointer text-ink-subtle hover:text-ink-muted">Detalhes técnicos</summary>
                          <pre className="mt-1.5 max-h-72 overflow-auto rounded-md bg-bg-alt p-2.5 text-[11px] leading-relaxed text-ink-muted">{JSON.stringify({ entrada: s.input, saída: s.output }, null, 2)}</pre>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
        {(e.output as { text?: string } | null)?.text && (
          <Card>
            <CardHeader><CardTitle>Resultado</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{(e.output as { text: string }).text}</p></CardContent>
          </Card>
        )}
      </div>
      <div className="grid content-start gap-4">
        <Card>
          <CardContent className="grid gap-3 text-sm">
            <div className="flex items-center justify-between"><span className="text-ink-muted">Status</span><StatusBadge kind="execution" status={e.status} /></div>
            {e.isTest && <div className="flex items-center justify-between"><span className="text-ink-muted">Tipo</span><Badge variant="electric">Teste do construtor</Badge></div>}
            <div className="flex items-center justify-between"><span className="text-ink-muted">Agente</span><span>{d.agentName ?? "—"}</span></div>
            <div className="flex items-center justify-between"><span className="text-ink-muted">Início</span><span>{when(e.startedAt, tz)}</span></div>
            <div className="flex items-center justify-between"><span className="text-ink-muted">Término</span><span>{when(e.finishedAt, tz)}</span></div>
            <div className="flex items-center justify-between"><span className="text-ink-muted">Duração</span><span>{duration(total)}</span></div>
            <div className="flex items-center justify-between"><span className="text-ink-muted">Tentativas</span><span>{e.attempts}/{e.maxAttempts}</span></div>
            <div className="flex items-center justify-between"><span className="text-ink-muted">Tokens</span><span className="tabular-nums">{num(e.tokensIn + e.tokensOut)}</span></div>
            {showCost && <div className="flex items-center justify-between"><span className="text-ink-muted">Custo estimado</span><span>{usdMicros(e.costMicros)}</span></div>}
            <div className="flex items-center justify-between"><span className="text-ink-muted">ID</span><code className="text-[11px] text-ink-subtle">{e.id.slice(0, 8)}</code></div>
            {e.error && <p className="rounded-md bg-danger/10 px-2.5 py-2 text-xs text-danger">{e.error}</p>}
          </CardContent>
        </Card>
        {d.approvals.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Aprovações</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {d.approvals.map((a) => (
                <div key={a.id} className="rounded-lg border border-line p-2.5">
                  <p>{a.summary}</p>
                  <p className="mt-1 text-xs text-ink-subtle">
                    {a.status === "pending" ? "Aguardando decisão" : a.status === "approved" ? "Aprovada" : a.status === "rejected" ? `Recusada${a.reason ? `: ${a.reason}` : ""}` : "Expirada"}
                    {a.decidedAt ? ` · ${when(a.decidedAt, tz)}` : ""}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
