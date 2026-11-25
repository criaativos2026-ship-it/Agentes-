import type { Metadata } from "next";
import Link from "next/link";
import { BotIcon, MessageSquareIcon } from "lucide-react";
import { requireOrgPermission } from "@/server/auth/guards";
import { listOrgAgents } from "@/server/queries/org";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Meus agentes" };

export default async function OrgAgentsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrgPermission(org, "agents.use");
  const list = await listOrgAgents(ctx);
  return (
    <>
      <PageHeader eyebrow={ctx.org.name} title="Meus agentes" description="Agentes de IA contratados e liberados para você." />
      {list.length === 0 ? (
        <EmptyState icon={BotIcon} title="Nenhum agente disponível" description="Quando a equipe NEXUS publicar agentes para a sua empresa (e você tiver acesso), eles aparecem aqui." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((a) => (
            <Card key={a.id} className="transition-colors hover:border-line-strong">
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-2xl">{a.avatar ?? "🤖"}</span>
                  <div className="min-w-0">
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-xs text-ink-subtle capitalize">{a.category}</p>
                  </div>
                  {a.status === "disabled" && <Badge variant="danger" className="ml-auto">Indisponível</Badge>}
                </div>
                <p className="line-clamp-3 flex-1 text-sm text-ink-muted">{a.description ?? a.objective ?? ""}</p>
                {a.status === "published" ? (
                  <Button asChild><Link href={`/app/${ctx.org.slug}/agentes/${a.id}`}><MessageSquareIcon /> Conversar</Link></Button>
                ) : (
                  <Button disabled variant="outline">Indisponível no momento</Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
