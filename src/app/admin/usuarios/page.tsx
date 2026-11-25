import type { Metadata } from "next";
import { SearchIcon } from "lucide-react";
import { isSuperAdmin, requirePlatformUser } from "@/server/auth/guards";
import { listUsers } from "@/server/queries/admin";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { when } from "@/lib/format";
import { UserRowActions, NewStaffForm } from "./user-actions";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requirePlatformUser();
  const { q } = await searchParams;
  const rows = await listUsers(me.id, q?.slice(0, 80));
  const superAdmin = isSuperAdmin(me);
  return (
    <>
      <PageHeader eyebrow="Clientes" title="Usuários" description="Todas as contas da plataforma: equipe interna e pessoas das empresas clientes." />
      <form className="mb-4 flex max-w-md gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Buscar por nome ou e-mail" aria-label="Buscar usuários" />
        <Button type="submit" variant="outline" aria-label="Buscar"><SearchIcon /></Button>
      </form>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pessoa</TableHead>
              <TableHead>Acesso</TableHead>
              <TableHead>Empresas</TableHead>
              <TableHead>Último acesso</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-ink-subtle">{u.email}</p>
                </TableCell>
                <TableCell className="space-x-1">
                  {u.platformRole === "super_admin" && <Badge variant="brand">Super admin</Badge>}
                  {u.platformRole === "platform_staff" && <Badge variant="electric">Equipe NEXUS</Badge>}
                  {u.status === "disabled" && <Badge variant="danger">Desativada</Badge>}
                  {u.deletionRequestedAt && !u.anonymizedAt && <Badge variant="warning">Pediu exclusão</Badge>}
                  {u.anonymizedAt && <Badge variant="outline">Anonimizada</Badge>}
                  {!u.platformRole && u.status === "active" && !u.anonymizedAt && <Badge>Cliente</Badge>}
                </TableCell>
                <TableCell className="max-w-64 truncate text-ink-muted">{u.orgs || "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-ink-muted">{when(u.lastLoginAt)}</TableCell>
                <TableCell className="text-right">
                  {superAdmin && !u.anonymizedAt && u.id !== me.id && <UserRowActions userId={u.id} name={u.name} status={u.status} deletionRequested={!!u.deletionRequestedAt} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {superAdmin && <NewStaffForm />}
    </>
  );
}
