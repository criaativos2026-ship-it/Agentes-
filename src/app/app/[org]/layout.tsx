import type { Metadata } from "next";
import { count, eq } from "drizzle-orm";
import { can, listUserOrgs, requireOrg } from "@/server/auth/guards";
import { withOrg } from "@/server/db/client";
import { approvals } from "@/server/db/schema";
import { AppShell } from "@/components/shell/app-shell";
import { orgNav } from "./nav";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  return { title: { default: "Painel", template: `%s · ${org} · NEXUS AI` } };
}

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await requireOrg(slug);
  const pending = can(ctx, "approvals.decide")
    ? await withOrg(ctx.org.id, ctx.user.id, async (tx) => Number((await tx.select({ n: count() }).from(approvals).where(eq(approvals.status, "pending")))[0].n))
    : 0;
  const orgs = ctx.viaPlatform ? [] : await listUserOrgs(ctx.user.id);
  const banner =
    ctx.viaPlatform || ctx.org.status === "suspended" || ctx.org.isDemo ? (
      <div className="border-b border-line bg-surface/80 px-4 py-2 text-center text-xs text-ink-muted">
        {ctx.viaPlatform && <span className="text-electric">Você está acessando como equipe da plataforma (suporte). </span>}
        {ctx.org.status === "suspended" && <span className="text-warning">Empresa suspensa: os agentes não executam tarefas. </span>}
        {ctx.org.isDemo && <span className="text-warning">Empresa de DEMONSTRAÇÃO — dados fictícios.</span>}
      </div>
    ) : null;
  return (
    <AppShell
      sections={orgNav(ctx.org.slug, ctx.permissions, { approvals: pending })}
      areaLabel={ctx.org.name}
      homeHref={`/app/${ctx.org.slug}`}
      banner={banner}
      user={{ name: ctx.user.name, email: ctx.user.email, roleLabel: ctx.roleName, isPlatform: ctx.viaPlatform, multiOrg: orgs.length > 1 }}
    >
      {children}
    </AppShell>
  );
}
