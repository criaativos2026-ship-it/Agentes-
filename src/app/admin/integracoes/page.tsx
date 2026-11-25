import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { requirePlatformUser } from "@/server/auth/guards";
import { withPlatform } from "@/server/db/client";
import { integrations, organizations } from "@/server/db/schema";
import { INTEGRATIONS } from "@/server/integrations/catalog";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { PlugIcon } from "lucide-react";
import { when } from "@/lib/format";

export const metadata: Metadata = { title: "Integrações" };

export default async function AdminIntegrationsPage() {
  const user = await requirePlatformUser();
  const rows = await withPlatform(user.id, (tx) =>
    tx
      .select({ id: integrations.id, key: integrations.providerKey, name: integrations.name, status: integrations.status, lastError: integrations.lastError, lastCheckedAt: integrations.lastCheckedAt, orgName: organizations.name, orgSlug: organizations.slug, uses: sql<number>`(select count(*)::int from integration_usage u where u.integration_id = ${integrations.id})` })
      .from(integrations)
      .innerJoin(organizations, eq(organizations.id, integrations.organizationId))
      .orderBy(desc(integrations.createdAt)),
  );
  return (
    <>
      <PageHeader eyebrow="Agentes" title="Controle de integrações" description="Integrações de todas as empresas. As credenciais são gerenciadas por cada empresa na própria Central de integrações (ou por você, acessando o painel do cliente)." />
      <Card className="mb-4">
        <CardHeader><CardTitle>Catálogo disponível</CardTitle><CardDescription>{INTEGRATIONS.length} integrações com teste real de comunicação.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">{INTEGRATIONS.map((i) => <span key={i.key} className="rounded-md border border-line px-2 py-1">{i.name}</span>)}</CardContent>
      </Card>
      {rows.length === 0 ? (
        <EmptyState icon={PlugIcon} title="Nenhuma integração configurada ainda" />
      ) : (
        <Card>
          <Table>
            <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Integração</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Usos</TableHead><TableHead>Último teste</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Link href={`/app/${r.orgSlug}/integracoes`} className="hover:text-electric">{r.orgName}</Link></TableCell>
                  <TableCell>{r.name}{r.lastError && <span className="block text-xs text-danger">{r.lastError}</span>}</TableCell>
                  <TableCell><StatusBadge kind="integration" status={r.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{r.uses}</TableCell>
                  <TableCell className="text-ink-muted">{when(r.lastCheckedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
