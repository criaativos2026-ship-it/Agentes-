import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { ListChecksIcon } from "lucide-react";
import { can, requireOrgPermission } from "@/server/auth/guards";
import { withOrg } from "@/server/db/client";
import { agents, tasks, users } from "@/server/db/schema";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { dateBR, when } from "@/lib/format";
import { NewTaskForm, TaskStatusSelect } from "./task-forms";

export const metadata: Metadata = { title: "Tarefas" };

export default async function TarefasPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrgPermission(org, "tasks.view");
  const rows = await withOrg(ctx.org.id, ctx.user.id, (tx) =>
    tx.select({ t: tasks, agentName: agents.name, by: users.name }).from(tasks).leftJoin(agents, eq(agents.id, tasks.agentId)).leftJoin(users, eq(users.id, tasks.createdBy)).orderBy(desc(tasks.createdAt)).limit(200),
  );
  const manage = can(ctx, "tasks.manage");
  return (
    <>
      <PageHeader eyebrow={ctx.org.name} title="Tarefas" description="Pendências criadas pela equipe e pelos agentes." />
      {manage && <NewTaskForm slug={ctx.org.slug} />}
      {rows.length === 0 ? <EmptyState icon={ListChecksIcon} title="Nenhuma tarefa" /> : (
        <Card className="mt-4">
          <Table>
            <TableHeader><TableRow><TableHead>Tarefa</TableHead><TableHead>Origem</TableHead><TableHead>Prazo</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map(({ t, agentName, by }) => (
                <TableRow key={t.id}>
                  <TableCell><p className="font-medium">{t.title}</p>{t.description && <p className="max-w-lg truncate text-xs text-ink-subtle">{t.description}</p>}</TableCell>
                  <TableCell className="text-ink-muted">{agentName ? `Agente ${agentName}` : by ?? "—"}<span className="block text-xs">{when(t.createdAt, ctx.org.timezone)}</span></TableCell>
                  <TableCell className="text-ink-muted">{dateBR(t.dueAt)}</TableCell>
                  <TableCell>{manage ? <TaskStatusSelect slug={ctx.org.slug} id={t.id} status={t.status} /> : <StatusBadge kind="task" status={t.status} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
