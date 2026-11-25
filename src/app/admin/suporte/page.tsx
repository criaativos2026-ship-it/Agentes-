import type { Metadata } from "next";
import { LifeBuoyIcon } from "lucide-react";
import { requirePlatformUser } from "@/server/auth/guards";
import { withPlatform } from "@/server/db/client";
import { loadTickets } from "@/server/queries/support";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { TicketThread } from "@/components/support/ticket-thread";
import { t as tr } from "@/i18n";

export const metadata: Metadata = { title: "Central de suporte" };

export default async function AdminSuportePage() {
  const user = await requirePlatformUser();
  const tickets = await withPlatform(user.id, (tx) => loadTickets(tx, { staffView: true }));
  const open = tickets.filter((x) => !["resolved", "closed"].includes(x.status));
  return (
    <>
      <PageHeader eyebrow="Operação" title="Central de suporte" description={`${open.length} chamado(s) em aberto.`} />
      {tickets.length === 0 ? <EmptyState icon={LifeBuoyIcon} title="Nenhum chamado" /> : (
        <div className="grid gap-3">
          {tickets.map((x) => (
            <Card key={x.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">{x.subject} <StatusBadge kind="ticket" status={x.status} /> <Badge variant={x.priority === "urgent" ? "danger" : x.priority === "high" ? "warning" : "default"}>{tr(`ticket.priority.${x.priority}`)}</Badge></CardTitle>
                <CardDescription>{x.orgName} · aberto por {x.opener ?? "—"}</CardDescription>
              </CardHeader>
              <CardContent><TicketThread ticketId={x.id} messages={x.messages} staffView status={x.status} /></CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
