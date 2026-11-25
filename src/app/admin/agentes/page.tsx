import type { Metadata } from "next";
import Link from "next/link";
import { BotIcon, PlusIcon } from "lucide-react";
import { requirePlatformUser } from "@/server/auth/guards";
import { builderOptions, listAllAgents } from "@/server/queries/agents";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { when } from "@/lib/format";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Construtor de agentes" };

export default async function AgentesPage({ searchParams }: { searchParams: Promise<{ org?: string; status?: string }> }) {
  const user = await requirePlatformUser();
  const sp = await searchParams;
  const orgId = sp.org && uuidSchema.safeParse(sp.org).success ? sp.org : undefined;
  const status = ["draft", "testing", "published", "disabled"].includes(sp.status ?? "") ? sp.status : undefined;
  const [rows, opts] = await Promise.all([listAllAgents(user.id, { orgId, status }), builderOptions(user.id)]);
  return (
    <>
      <PageHeader
        eyebrow="Agentes"
        title="Construtor de agentes"
        description="Crie, configure, teste e publique agentes personalizados para cada empresa."
        actions={<Button asChild><Link href="/admin/agentes/novo"><PlusIcon /> Novo agente</Link></Button>}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <NativeSelect name="org" defaultValue={orgId ?? ""} wrapperClassName="w-60" aria-label="Empresa">
          <option value="">Todas as empresas</option>
          {opts.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={status ?? ""} wrapperClassName="w-48" aria-label="Status">
          <option value="">Todos os status</option>
          <option value="draft">Rascunho</option>
          <option value="testing">Em testes</option>
          <option value="published">Publicado</option>
          <option value="disabled">Desativado</option>
        </NativeSelect>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState icon={BotIcon} title="Nenhum agente encontrado" description="Crie o primeiro agente a partir de um modelo ou do zero." action={<Button asChild><Link href="/admin/agentes/novo">Criar agente</Link></Button>} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agente</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Atualizado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link href={`/admin/agentes/${a.id}`} className="flex items-center gap-2 font-medium hover:text-electric">
                      <span className="grid size-7 place-items-center rounded-md bg-surface-2 text-sm">{a.avatar ?? "🤖"}</span>
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-ink-muted">{a.orgName}</TableCell>
                  <TableCell className="text-ink-muted">{a.category}</TableCell>
                  <TableCell><StatusBadge kind="agent" status={a.status} /></TableCell>
                  <TableCell className="text-ink-muted">{when(a.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
