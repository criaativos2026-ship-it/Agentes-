import type { Metadata } from "next";
import { CpuIcon } from "lucide-react";
import { requirePlatformUser } from "@/server/auth/guards";
import { usageReport } from "@/server/queries/admin";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { num, periodOf, usdMicros } from "@/lib/format";

export const metadata: Metadata = { title: "Consumo de IA" };

export default async function ConsumoPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const user = await requirePlatformUser();
  const { p } = await searchParams;
  const period = p && /^\d{4}-\d{2}$/.test(p) ? p : periodOf();
  const r = await usageReport(user.id, period);
  const periods = r.periods.includes(period) ? r.periods : [period, ...r.periods];
  return (
    <>
      <PageHeader eyebrow="Agentes" title="Consumo de inteligência artificial" description="Tokens, execuções e custo estimado (preços de tabela) por empresa e por modelo." />
      <form className="mb-4 flex gap-2">
        <NativeSelect name="p" defaultValue={period} wrapperClassName="w-40" aria-label="Período">{periods.map((x) => <option key={x} value={x}>{x}</option>)}</NativeSelect>
        <Button type="submit" variant="outline">Ver</Button>
      </form>
      {r.byOrg.length === 0 && r.byModel.length === 0 ? (
        <EmptyState icon={CpuIcon} title="Sem consumo neste período" />
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardHeader><CardTitle>Por empresa</CardTitle><CardDescription>Sem execuções de teste</CardDescription></CardHeader>
            <Table>
              <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead className="text-right">Execuções</TableHead><TableHead className="text-right">Ferramentas</TableHead><TableHead className="text-right">Tokens entrada</TableHead><TableHead className="text-right">Tokens saída</TableHead><TableHead className="text-right">Custo estimado</TableHead></TableRow></TableHeader>
              <TableBody>
                {r.byOrg.map((o) => (
                  <TableRow key={o.orgId}>
                    <TableCell className="font-medium">{o.orgName}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(o.executions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(o.toolCalls)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(o.tokensIn)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(o.tokensOut)}</TableCell>
                    <TableCell className="text-right tabular-nums">{usdMicros(o.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Card>
            <CardHeader><CardTitle>Por modelo</CardTitle><CardDescription>Inclui testes do construtor: {num(r.tests.tokens)} tokens · {usdMicros(r.tests.cost)}</CardDescription></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Modelo</TableHead><TableHead>Provedor</TableHead><TableHead className="text-right">Tokens</TableHead><TableHead className="text-right">Custo estimado</TableHead></TableRow></TableHeader>
                <TableBody>
                  {r.byModel.map((m) => (
                    <TableRow key={`${m.provider}:${m.model}`}><TableCell className="font-mono text-xs">{m.model}</TableCell><TableCell className="text-ink-muted">{m.provider}</TableCell><TableCell className="text-right tabular-nums">{num(m.tokens)}</TableCell><TableCell className="text-right tabular-nums">{m.cost ? usdMicros(m.cost) : "sem tabela"}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
