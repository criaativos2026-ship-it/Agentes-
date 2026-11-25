import type { Metadata } from "next";
import { ActivityIcon } from "lucide-react";
import { requirePlatformUser } from "@/server/auth/guards";
import { listExecutions } from "@/server/queries/executions";
import { builderOptions } from "@/server/queries/agents";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { ExecutionTable } from "@/components/executions/execution-table";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/empty-state";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Monitoramento" };

const STATUS = [["", "Todos"], ["active", "Em andamento"], ["waiting_approval", "Aguardando aprovação"], ["succeeded", "Concluídas"], ["error", "Com erro"], ["canceled", "Canceladas"]] as const;

export default async function MonitoramentoPage({ searchParams }: { searchParams: Promise<{ org?: string; status?: string; agent?: string; tests?: string; page?: string }> }) {
  const user = await requirePlatformUser();
  const sp = await searchParams;
  const orgId = sp.org && uuidSchema.safeParse(sp.org).success ? sp.org : undefined;
  const agentId = sp.agent && uuidSchema.safeParse(sp.agent).success ? sp.agent : undefined;
  const status = STATUS.some(([k]) => k === sp.status) ? sp.status : undefined;
  const includeTests = sp.tests === "1";
  const [data, opts] = await Promise.all([
    listExecutions({ platformUserId: user.id }, { orgId, status, agentId, includeTests }, Math.max(1, Number(sp.page) || 1)),
    builderOptions(user.id),
  ]);
  return (
    <>
      <PageHeader eyebrow="Agentes" title="Monitoramento de execuções" description="Todas as execuções dos agentes, com etapas, ferramentas, erros e consumo." />
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <NativeSelect name="org" defaultValue={orgId ?? ""} wrapperClassName="w-56" aria-label="Empresa">
          <option value="">Todas as empresas</option>
          {opts.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={status ?? ""} wrapperClassName="w-52" aria-label="Status">
          {STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
        {agentId && <input type="hidden" name="agent" value={agentId} />}
        <label className="flex items-center gap-2 text-sm text-ink-muted"><Checkbox name="tests" value="1" defaultChecked={includeTests} /> Incluir testes</label>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      {data.rows.length === 0 ? <EmptyState icon={ActivityIcon} title="Nenhuma execução encontrada" /> : <Card><ExecutionTable rows={data.rows} showOrg hrefFor={(id) => `/admin/execucoes/${id}`} /></Card>}
      <Pagination page={data.page} hasMore={data.hasMore} params={{ org: orgId, status, agent: agentId, tests: includeTests ? "1" : undefined }} />
    </>
  );
}
