import type { Metadata } from "next";
import { ScrollTextIcon } from "lucide-react";
import { requirePlatformUser } from "@/server/auth/guards";
import { listAuditLogs } from "@/server/queries/admin";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { AuditTable } from "@/components/audit/audit-table";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/empty-state";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Logs de atividades" };

const ACTIONS = [
  ["", "Todas as ações"],
  ["auth.", "Autenticação"],
  ["organization.", "Empresas"],
  ["member.", "Equipe"],
  ["user.", "Usuários"],
  ["agent.", "Agentes"],
  ["execution.", "Execuções"],
  ["approval.", "Aprovações"],
  ["integration.", "Integrações"],
  ["billing.", "Cobrança"],
  ["privacy.", "Privacidade"],
] as const;

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ org?: string; action?: string; page?: string }> }) {
  const user = await requirePlatformUser();
  const sp = await searchParams;
  const orgId = sp.org && uuidSchema.safeParse(sp.org).success ? sp.org : undefined;
  const action = ACTIONS.some(([k]) => k === sp.action) ? sp.action : undefined;
  const data = await listAuditLogs(user.id, { orgId, action, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader eyebrow="Operação" title="Logs de atividades" description="Registro de auditoria de toda a plataforma: quem fez o quê, quando e de onde." />
      <form className="mb-4 flex flex-wrap gap-2">
        <NativeSelect name="org" defaultValue={orgId ?? ""} wrapperClassName="w-60" aria-label="Empresa">
          <option value="">Todas as empresas</option>
          {data.orgOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </NativeSelect>
        <NativeSelect name="action" defaultValue={action ?? ""} wrapperClassName="w-52" aria-label="Tipo de ação">
          {ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      {data.rows.length === 0 ? (
        <EmptyState icon={ScrollTextIcon} title="Nenhum registro encontrado" />
      ) : (
        <Card><AuditTable rows={data.rows} showOrg /></Card>
      )}
      <Pagination page={data.page} hasMore={data.hasMore} params={{ org: orgId, action }} />
    </>
  );
}
