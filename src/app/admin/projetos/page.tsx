import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanbanIcon, PlusIcon } from "lucide-react";
import { requirePlatformUser } from "@/server/auth/guards";
import { listProjects } from "@/server/queries/projects";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { dateBR, when } from "@/lib/format";

export const metadata: Metadata = { title: "Projetos personalizados" };

export default async function ProjetosPage() {
  const user = await requirePlatformUser();
  const rows = await listProjects(user.id);
  return (
    <>
      <PageHeader eyebrow="Clientes" title="Projetos personalizados" description="Soluções sob medida: do levantamento das necessidades à publicação dos agentes no painel do cliente." actions={<Button asChild><Link href="/admin/projetos/novo"><PlusIcon /> Novo projeto</Link></Button>} />
      {rows.length === 0 ? (
        <EmptyState icon={FolderKanbanIcon} title="Nenhum projeto" description="Cadastre o primeiro projeto para uma empresa cliente." />
      ) : (
        <Card>
          <Table>
            <TableHeader><TableRow><TableHead>Projeto</TableHead><TableHead>Empresa</TableHead><TableHead>Status</TableHead><TableHead>Responsável</TableHead><TableHead>Implantação</TableHead><TableHead>Atualizado</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map(({ p, orgName, owner }) => (
                <TableRow key={p.id}>
                  <TableCell><Link href={`/admin/projetos/${p.id}`} className="font-medium hover:text-electric">{p.name}</Link><span className="block text-xs text-ink-subtle">{p.segment}</span></TableCell>
                  <TableCell className="text-ink-muted">{orgName}</TableCell>
                  <TableCell><StatusBadge kind="project" status={p.status} /></TableCell>
                  <TableCell className="text-ink-muted">{owner ?? "—"}</TableCell>
                  <TableCell className="text-ink-muted">{dateBR(p.goLiveDate)}</TableCell>
                  <TableCell className="text-ink-muted">{when(p.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
