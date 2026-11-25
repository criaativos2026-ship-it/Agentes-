import type { Metadata } from "next";
import Link from "next/link";
import { Building2Icon, PlusIcon, SearchIcon } from "lucide-react";
import { requirePlatformUser } from "@/server/auth/guards";
import { listOrganizations } from "@/server/queries/admin";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { dateBR } from "@/lib/format";

export const metadata: Metadata = { title: "Empresas" };

export default async function EmpresasPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePlatformUser();
  const { q } = await searchParams;
  const orgs = await listOrganizations(user.id, q?.slice(0, 80));
  return (
    <>
      <PageHeader
        eyebrow="Clientes"
        title="Empresas"
        description="Empresas clientes da plataforma. Cada uma tem um ambiente privado e isolado."
        actions={
          <Button asChild>
            <Link href="/admin/empresas/nova">
              <PlusIcon /> Nova empresa
            </Link>
          </Button>
        }
      />
      <form className="mb-4 flex max-w-md gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Buscar por nome ou segmento" aria-label="Buscar empresas" />
        <Button type="submit" variant="outline" aria-label="Buscar">
          <SearchIcon />
        </Button>
      </form>
      {orgs.length === 0 ? (
        <EmptyState
          icon={Building2Icon}
          title={q ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada"}
          description={q ? "Tente outro termo." : "Cadastre a primeira empresa cliente para começar."}
          action={!q && <Button asChild><Link href="/admin/empresas/nova">Cadastrar empresa</Link></Button>}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Segmento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assinatura</TableHead>
                <TableHead className="text-right">Usuários</TableHead>
                <TableHead className="text-right">Agentes</TableHead>
                <TableHead>Cadastro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/admin/empresas/${o.id}`} className="font-medium text-ink hover:text-electric">
                      {o.name}
                    </Link>
                    {o.isDemo && <Badge variant="warning" className="ml-2">DEMONSTRAÇÃO</Badge>}
                  </TableCell>
                  <TableCell className="text-ink-muted">{o.segment ?? "—"}</TableCell>
                  <TableCell><StatusBadge kind="org" status={o.status} /></TableCell>
                  <TableCell>{o.subscription ? <StatusBadge kind="subscription" status={o.subscription} /> : <span className="text-ink-subtle">Sem plano</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{o.members}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {o.published}/{o.agents}
                  </TableCell>
                  <TableCell className="text-ink-muted">{dateBR(o.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
