import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import { requirePlatformUser } from "@/server/auth/guards";
import { getProject } from "@/server/queries/projects";
import { INTEGRATIONS } from "@/server/integrations/catalog";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uuidSchema } from "@/lib/validation";
import { when } from "@/lib/format";
import { t } from "@/i18n";
import { ProjectForm } from "../project-form";
import { StatusForm } from "./status-form";

export const metadata: Metadata = { title: "Projeto" };

export default async function ProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformUser();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const d = await getProject(user.id, id);
  if (!d) notFound();
  const done = d.checklist.filter((c) => c.done).length;
  return (
    <>
      <PageHeader
        eyebrow={`Projeto · ${d.org.name}`}
        title={<span className="flex flex-wrap items-center gap-3">{d.p.name} <StatusBadge kind="project" status={d.p.status} /></span>}
        description={`${done}/${d.checklist.length} etapas do fluxo concluídas`}
        actions={
          <>
            <Button asChild variant="outline"><Link href={`/admin/agentes/novo?org=${d.org.id}`}>Criar agente</Link></Button>
            <Button asChild variant="outline"><Link href={`/app/${d.org.slug}`}>Painel do cliente</Link></Button>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Tabs defaultValue="levantamento">
          <TabsList>
            <TabsTrigger value="levantamento">Levantamento</TabsTrigger>
            <TabsTrigger value="historico">Histórico ({d.events.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="levantamento">
            <ProjectForm project={{ ...d.p, goLiveDate: d.p.goLiveDate }} orgs={[{ id: d.org.id, name: d.org.name }]} staff={d.staff} integrations={INTEGRATIONS.map((i) => ({ key: i.key, name: i.name }))} />
          </TabsContent>
          <TabsContent value="historico">
            <Card>
              <CardContent className="py-2">
                <ul className="divide-y divide-line">
                  {d.events.map(({ e, user: u }) => (
                    <li key={e.id} className="py-2.5 text-sm">
                      <p>{e.fromStatus && e.toStatus ? `${t(`project.status.${e.fromStatus}`)} → ${t(`project.status.${e.toStatus}`)}` : e.message}{e.fromStatus && e.message !== "Status alterado" ? ` — ${e.message}` : ""}</p>
                      <p className="text-xs text-ink-subtle">{[u, when(e.createdAt)].filter(Boolean).join(" · ")}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader><CardTitle>Fluxo de implantação</CardTitle><CardDescription>Calculado com os dados reais da empresa</CardDescription></CardHeader>
            <CardContent>
              <ol className="grid gap-2">
                {d.checklist.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    {c.done ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleIcon className="mt-0.5 size-4 shrink-0 text-ink-subtle" />}
                    <span className={c.done ? "" : "text-ink-muted"}>{i + 1}. {c.label}{"optional" in c && c.optional ? " (opcional)" : ""}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Mudar status / anotar</CardTitle></CardHeader>
            <CardContent><StatusForm id={d.p.id} status={d.p.status} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Agentes da empresa</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {d.orgAgents.length === 0 ? <p className="text-ink-muted">Nenhum ainda.</p> : d.orgAgents.map((a) => (
                <Link key={a.id} href={`/admin/agentes/${a.id}`} className="flex items-center justify-between hover:text-electric">{a.name} <StatusBadge kind="agent" status={a.status} /></Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
