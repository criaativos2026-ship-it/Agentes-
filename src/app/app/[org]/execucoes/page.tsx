import type { Metadata } from "next";
import { ActivityIcon } from "lucide-react";
import { can, requireOrgPermission } from "@/server/auth/guards";
import { listExecutions } from "@/server/queries/executions";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { ExecutionTable } from "@/components/executions/execution-table";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Histórico de atividades" };

export default async function OrgExecutionsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ status?: string; page?: string }> }) {
  const { org } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgPermission(org, "executions.view");
  const all = can(ctx, "executions.view_all");
  const status = ["active", "waiting_approval", "succeeded", "error", "canceled"].includes(sp.status ?? "") ? sp.status : undefined;
  const data = await listExecutions({ orgId: ctx.org.id, userId: ctx.user.id }, { status, onlyUserId: all ? undefined : ctx.user.id }, Math.max(1, Number(sp.page) || 1));
  return (
    <>
      <PageHeader eyebrow={ctx.org.name} title="Histórico de atividades" description={all ? "Todas as execuções dos agentes da empresa." : "Suas execuções com os agentes."} />
      <form className="mb-4 flex gap-2">
        <NativeSelect name="status" defaultValue={status ?? ""} wrapperClassName="w-56" aria-label="Status">
          <option value="">Todos os status</option>
          <option value="active">Em andamento</option>
          <option value="waiting_approval">Aguardando aprovação</option>
          <option value="succeeded">Concluídas</option>
          <option value="error">Com erro</option>
          <option value="canceled">Canceladas</option>
        </NativeSelect>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      {data.rows.length === 0 ? <EmptyState icon={ActivityIcon} title="Nenhuma execução" /> : <Card><ExecutionTable rows={data.rows} tz={ctx.org.timezone} hrefFor={(id) => `/app/${ctx.org.slug}/execucoes/${id}`} /></Card>}
      <Pagination page={data.page} hasMore={data.hasMore} params={{ status }} />
    </>
  );
}
