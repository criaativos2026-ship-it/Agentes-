import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { can, requireOrgPermission } from "@/server/auth/guards";
import { getAgentChat } from "@/server/queries/org";
import { uuidSchema } from "@/lib/validation";
import { when } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgentChat } from "./agent-chat";

export const metadata: Metadata = { title: "Conversa" };

export default async function AgentChatPage({ params, searchParams }: { params: Promise<{ org: string; agentId: string }>; searchParams: Promise<{ c?: string }> }) {
  const { org, agentId } = await params;
  const { c } = await searchParams;
  const ctx = await requireOrgPermission(org, "agents.use");
  if (!uuidSchema.safeParse(agentId).success) notFound();
  const data = await getAgentChat(ctx, agentId, c && uuidSchema.safeParse(c).success ? c : undefined);
  if (!data) notFound();
  const base = `/app/${ctx.org.slug}/agentes/${agentId}`;
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="order-2 lg:order-1">
        <Button asChild variant="outline" className="mb-3 w-full"><Link href={base}><PlusIcon /> Nova conversa</Link></Button>
        <p className="mb-1.5 px-1 text-xs font-medium text-ink-subtle">Suas conversas</p>
        <ul className="grid gap-1">
          {data.conversations.length === 0 && <li className="px-1 text-xs text-ink-subtle">Nenhuma ainda.</li>}
          {data.conversations.map((cv) => (
            <li key={cv.id}>
              <Link href={`${base}?c=${cv.id}`} className={cn("block rounded-lg px-3 py-2 text-sm hover:bg-surface-2", data.current?.id === cv.id && "bg-surface-2")}>
                <span className="block truncate">{cv.title ?? "Conversa"}</span>
                <span className="block text-[11px] text-ink-subtle">{when(cv.updatedAt, ctx.org.timezone)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <section className="order-1 min-w-0 lg:order-2">
        <div className="mb-3 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-xl">{data.agent.avatar ?? "🤖"}</span>
          <div>
            <h1 className="text-lg font-semibold tracking-display">{data.agent.name}</h1>
            <p className="text-xs text-ink-muted">{data.agent.objective ?? data.agent.description}</p>
          </div>
        </div>
        <AgentChat
          key={data.current?.id ?? "new"}
          slug={ctx.org.slug}
          agentId={agentId}
          agentName={data.agent.name}
          initialMessages={data.messages}
          conversationId={data.current?.id}
          approvalsHref={can(ctx, "approvals.decide") ? `/app/${ctx.org.slug}/aprovacoes` : undefined}
          disabledReason={data.agent.status !== "published" ? "Agente indisponível no momento." : ctx.org.status === "suspended" ? "Empresa suspensa." : undefined}
        />
      </section>
    </div>
  );
}
