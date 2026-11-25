import type { Metadata } from "next";
import { ScrollTextIcon } from "lucide-react";
import { requireOrgPermission } from "@/server/auth/guards";
import { listOrgAudit } from "@/server/queries/org";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { AuditTable } from "@/components/audit/audit-table";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Registro de atividades" };

export default async function OrgAuditPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ page?: string }> }) {
  const { org } = await params;
  const ctx = await requireOrgPermission(org, "audit.view");
  const data = await listOrgAudit(ctx, Math.max(1, Number((await searchParams).page) || 1));
  return (
    <>
      <PageHeader eyebrow={ctx.org.name} title="Registro de atividades" description="Auditoria da empresa: ações da equipe, dos agentes e da plataforma." />
      {data.rows.length === 0 ? <EmptyState icon={ScrollTextIcon} title="Nenhum registro ainda" /> : <Card><AuditTable rows={data.rows} tz={ctx.org.timezone} /></Card>}
      <Pagination page={data.page} hasMore={data.hasMore} params={{}} />
    </>
  );
}
