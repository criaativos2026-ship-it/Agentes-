import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotIcon, ExternalLinkIcon, UsersIcon } from "lucide-react";
import { isSuperAdmin, requirePlatformUser } from "@/server/auth/guards";
import { getOrganizationDetail } from "@/server/queries/admin";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { uuidSchema } from "@/lib/validation";
import { when } from "@/lib/format";
import { OrgEditForm } from "./org-edit-form";
import { OrgStatusActions } from "./org-status-actions";
import { AddMemberForm, MemberActions } from "./members";

export const metadata: Metadata = { title: "Empresa" };

export default async function EmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformUser();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const d = await getOrganizationDetail(user.id, id);
  if (!d) notFound();
  const { org } = d;
  return (
    <>
      <PageHeader
        eyebrow="Empresa"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {org.name} <StatusBadge kind="org" status={org.status} />
            {org.isDemo && <Badge variant="warning">DEMONSTRAÇÃO</Badge>}
          </span>
        }
        description={org.segment ?? undefined}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/app/${org.slug}`}>
                <ExternalLinkIcon /> Abrir painel do cliente
              </Link>
            </Button>
            {isSuperAdmin(user) && <OrgStatusActions orgId={org.id} status={org.status} />}
          </>
        }
      />
      <Tabs defaultValue="equipe">
        <TabsList>
          <TabsTrigger value="equipe">Equipe ({d.members.length})</TabsTrigger>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="agentes">Agentes ({d.agents.length})</TabsTrigger>
          <TabsTrigger value="atividade">Atividade</TabsTrigger>
        </TabsList>

        <TabsContent value="equipe" className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Pessoas com acesso</CardTitle>
              <CardDescription>Endereço do painel: /app/{org.slug}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {d.members.length === 0 ? (
                <div className="p-5"><EmptyState icon={UsersIcon} title="Ninguém com acesso ainda" description="Adicione o administrador da empresa abaixo." /></div>
              ) : (
                <ul className="divide-y divide-line">
                  {d.members.map((m) => (
                    <li key={m.id} className="flex flex-col gap-3 px-5 py-3.5 md:flex-row md:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">
                          {m.name} {m.status === "disabled" && <Badge variant="danger" className="ml-1">Desativado</Badge>}
                        </p>
                        <p className="truncate text-xs text-ink-subtle">
                          {m.email}
                          {m.jobTitle ? ` · ${m.jobTitle}` : ""} · último acesso: {when(m.lastLoginAt)}
                        </p>
                      </div>
                      <MemberActions orgId={org.id} member={m} roles={d.roleOptions} canResetLink={isSuperAdmin(user)} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <AddMemberForm orgId={org.id} roles={d.roleOptions} />
        </TabsContent>

        <TabsContent value="dados">
          <OrgEditForm org={{ ...org, httpAllowlist: (org.settings.httpAllowlist ?? []).join("\n") }} />
        </TabsContent>

        <TabsContent value="agentes">
          <Card>
            <CardHeader>
              <CardTitle>Agentes da empresa</CardTitle>
              <CardDescription>
                <Link className="text-electric hover:underline" href={`/admin/agentes/novo?org=${org.id}`}>Criar agente para esta empresa</Link>
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {d.agents.length === 0 ? (
                <div className="p-5"><EmptyState icon={BotIcon} title="Nenhum agente" description="Crie agentes no Construtor de agentes." /></div>
              ) : (
                <ul className="divide-y divide-line">
                  {d.agents.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                      <Link href={`/admin/agentes/${a.id}`} className="flex-1 font-medium hover:text-electric">{a.name}</Link>
                      <span className="text-xs text-ink-subtle">{a.category}</span>
                      <StatusBadge kind="agent" status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="atividade">
          <Card>
            <CardContent className="py-2">
              {d.activity.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-muted">Sem atividades registradas.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.activity.map((a) => (
                    <li key={a.id} className="py-2.5">
                      <p className="text-sm">{a.summary}</p>
                      <p className="text-xs text-ink-subtle">{[a.actor, when(a.createdAt, org.timezone)].filter(Boolean).join(" · ")}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
