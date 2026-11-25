import type { Metadata } from "next";
import { can, requireOrgPermission } from "@/server/auth/guards";
import { getOrgTeam } from "@/server/queries/org";
import { PERMISSIONS } from "@/server/rbac/catalog";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { when } from "@/lib/format";
import { OrgAddMember, OrgMemberActions, RoleEditor, DeleteRole } from "./team-forms";

export const metadata: Metadata = { title: "Equipe e permissões" };

export default async function EquipePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrgPermission(org, "members.view");
  const { members, roles } = await getOrgTeam(ctx);
  const manage = can(ctx, "members.manage");
  const manageRoles = can(ctx, "roles.manage");
  const permissionCatalog = Object.entries(PERMISSIONS).map(([key, v]) => ({ key, ...v }));
  const roleOptions = roles.map((r) => ({ id: r.id, name: r.name }));
  return (
    <>
      <PageHeader eyebrow={ctx.org.name} title="Equipe e permissões" description="Quem acessa a empresa e o que cada papel pode fazer." />
      <Tabs defaultValue="pessoas">
        <TabsList>
          <TabsTrigger value="pessoas">Pessoas ({members.length})</TabsTrigger>
          <TabsTrigger value="papeis">Papéis ({roles.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pessoas" className="grid gap-4">
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-line">
                {members.map((m) => (
                  <li key={m.id} className="flex flex-col gap-3 px-5 py-3.5 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {m.name} {m.userId === ctx.user.id && <Badge variant="electric" className="ml-1">Você</Badge>}
                        {m.status === "disabled" && <Badge variant="danger" className="ml-1">Desativado</Badge>}
                      </p>
                      <p className="truncate text-xs text-ink-subtle">{m.email}{m.jobTitle ? ` · ${m.jobTitle}` : ""} · último acesso: {when(m.lastLoginAt, ctx.org.timezone)}</p>
                    </div>
                    {manage && m.userId !== ctx.user.id ? (
                      <OrgMemberActions slug={ctx.org.slug} member={m} roles={roleOptions} />
                    ) : (
                      <Badge>{m.roleName}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {manage && <OrgAddMember slug={ctx.org.slug} roles={roleOptions} />}
        </TabsContent>
        <TabsContent value="papeis" className="grid gap-4">
          {roles.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {r.name} {r.isSystem && <Badge>Padrão</Badge>}
                </CardTitle>
                <CardDescription>{r.description ?? "Papel personalizado"} · {r.memberCount} pessoa(s)</CardDescription>
                {manageRoles && !r.isSystem && (
                  <div data-slot="card-action" className="flex gap-2">
                    <RoleEditor slug={ctx.org.slug} catalog={permissionCatalog} role={{ id: r.id, name: r.name, description: r.description, permissions: r.permissions }} />
                    <DeleteRole slug={ctx.org.slug} roleId={r.id} name={r.name} />
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {r.permissions.length === 0 ? <span className="text-sm text-ink-subtle">Nenhuma permissão</span> : r.permissions.map((p) => <Badge key={p} variant="outline">{PERMISSIONS[p as keyof typeof PERMISSIONS]?.description ?? p}</Badge>)}
              </CardContent>
            </Card>
          ))}
          {manageRoles && <RoleEditor slug={ctx.org.slug} catalog={permissionCatalog} />}
        </TabsContent>
      </Tabs>
    </>
  );
}
