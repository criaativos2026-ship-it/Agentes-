import type { Metadata } from "next";
import { LifeBuoyIcon } from "lucide-react";
import { requireOrgPermission } from "@/server/auth/guards";
import { withOrg } from "@/server/db/client";
import { loadTickets } from "@/server/queries/support";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { TicketThread } from "@/components/support/ticket-thread";
import { NewTicketForm } from "./new-ticket";

export const metadata: Metadata = { title: "Suporte" };

export default async function SuportePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrgPermission(org, "support.use");
  const tickets = await withOrg(ctx.org.id, ctx.user.id, (tx) => loadTickets(tx, { staffView: false, tz: ctx.org.timezone }));
  return (
    <>
      <PageHeader eyebrow={ctx.org.name} title="Central de suporte" description="Fale com a equipe NEXUS sobre agentes, integrações ou sua assinatura." />
      <NewTicketForm slug={ctx.org.slug} />
      <div className="mt-4 grid gap-3">
        {tickets.length === 0 ? <EmptyState icon={LifeBuoyIcon} title="Nenhum chamado" /> : tickets.map((t) => (
          <Card key={t.id}>
            <CardHeader><CardTitle className="flex flex-wrap items-center gap-2">{t.subject} <StatusBadge kind="ticket" status={t.status} /></CardTitle><CardDescription>Aberto por {t.opener ?? "—"}</CardDescription></CardHeader>
            <CardContent><TicketThread ticketId={t.id} slug={ctx.org.slug} messages={t.messages} staffView={false} status={t.status} /></CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
