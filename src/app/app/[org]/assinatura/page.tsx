import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { requireOrgPermission } from "@/server/auth/guards";
import { withOrg, withPlatform } from "@/server/db/client";
import { payments } from "@/server/db/schema";
import { effectiveLimits, monthUsage } from "@/server/billing/limits";
import { billingSettings } from "@/server/billing/service";
import { gatewayConfigured } from "@/server/billing/gateways";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { compact, dateBR, money, num, periodOf } from "@/lib/format";
import { PayButtons } from "./pay-buttons";

export const metadata: Metadata = { title: "Plano e consumo" };

function Meter({ label, used, limit, fmt = num }: { label: string; used: number; limit: number | null; fmt?: (n: number) => string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><span className="text-ink-muted">{label}</span><span className="tabular-nums">{fmt(used)} / {limit === null ? "ilimitado" : fmt(limit)}</span></div>
      {limit !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={pct >= 90 ? "h-full bg-danger" : pct >= 70 ? "h-full bg-warning" : "h-full bg-electric"} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default async function AssinaturaPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ pagamento?: string }> }) {
  const { org } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgPermission(org, "billing.view");
  const period = periodOf(new Date(), ctx.org.timezone);
  const d = await withOrg(ctx.org.id, ctx.user.id, async (tx) => ({
    limits: await effectiveLimits(tx, ctx.org.id),
    usage: await monthUsage(tx, ctx.org.id, period),
    pays: await tx.select().from(payments).orderBy(desc(payments.dueDate)).limit(50),
  }));
  const settings = await withPlatform(null, (tx) => billingSettings(tx));
  const gateways = settings.liveGateways ? (["stripe", "mercadopago"] as const).filter((g) => gatewayConfigured(g)) : [];
  return (
    <>
      <PageHeader eyebrow={ctx.org.name} title="Plano e consumo" description={`Consumo do mês ${period}, contado a partir dos registros de uso.`} />
      {sp.pagamento === "processando" && <p className="mb-4 rounded-lg border border-electric/30 bg-electric/10 px-3 py-2.5 text-sm text-electric">Pagamento em processamento. A confirmação chega automaticamente pelo gateway.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">{d.limits.planName ?? "Sem plano na plataforma"} {d.limits.subscriptionStatus && <StatusBadge kind="subscription" status={d.limits.subscriptionStatus} />}</CardTitle>
            <CardDescription>{d.limits.planName ? "Limites do contrato vigente." : "Contrato gerenciado diretamente com a equipe NEXUS."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Meter label="Execuções no mês" used={d.usage.executions} limit={d.limits.executionsPerMonth} />
            <Meter label="Tokens de IA no mês" used={d.usage.tokens} limit={d.limits.tokensPerMonth} fmt={compact} />
            <p className="text-xs text-ink-subtle">Agentes publicados permitidos: {d.limits.agents ?? "ilimitado"} · usuários: {d.limits.users ?? "ilimitado"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pagamentos</CardTitle><CardDescription>{gateways.length ? "Pague online pelos botões abaixo." : "Pagamento online ainda não habilitado — siga a orientação da equipe NEXUS (PIX/boleto)."}</CardDescription></CardHeader>
          <CardContent className="p-0">
            {d.pays.length === 0 ? (
              <p className="p-5 text-sm text-ink-muted">Nenhuma cobrança.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Vencimento</TableHead><TableHead>Descrição</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.pays.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{dateBR(p.dueDate)}</TableCell>
                      <TableCell className="text-ink-muted">{p.description}{["pending", "overdue"].includes(p.status) && gateways.length > 0 && <PayButtons slug={ctx.org.slug} paymentId={p.id} gateways={[...gateways]} />}</TableCell>
                      <TableCell><StatusBadge kind="payment" status={p.status} /></TableCell>
                      <TableCell className="text-right tabular-nums">{money(p.amountCents, p.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
