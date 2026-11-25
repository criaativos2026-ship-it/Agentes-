import type { NavSection } from "@/components/shell/icons";
import type { Permission } from "@/server/rbac/catalog";

type Item = NavSection["items"][number] & { perm?: Permission };

/** Menu da empresa: cada item só aparece para quem tem a permissão (e só entram telas prontas). */
export function orgNav(slug: string, perms: ReadonlySet<Permission>, badges: { approvals?: number } = {}): NavSection[] {
  const base = `/app/${slug}`;
  const sections: { title?: string; items: Item[] }[] = [
    { items: [{ href: base, label: "Painel", icon: "dashboard", exact: true, perm: "dashboard.view" }] },
    {
      title: "Agentes",
      items: [
        { href: `${base}/agentes`, label: "Meus agentes", icon: "agents", perm: "agents.use" },
        { href: `${base}/execucoes`, label: "Histórico de atividades", icon: "monitor", perm: "executions.view" },
        { href: `${base}/aprovacoes`, label: "Aprovações", icon: "approvals", perm: "approvals.decide", badge: badges.approvals },
        { href: `${base}/tarefas`, label: "Tarefas", icon: "tasks", perm: "tasks.view" },
        { href: `${base}/relatorios`, label: "Relatórios", icon: "reports", perm: "reports.view" },
        { href: `${base}/automacoes`, label: "Automações", icon: "workflows", perm: "workflows.view" },
      ],
    },
    {
      title: "Empresa",
      items: [
        { href: `${base}/conhecimento`, label: "Base de conhecimento", icon: "knowledge", perm: "knowledge.view" },
        { href: `${base}/integracoes`, label: "Integrações", icon: "integrations", perm: "integrations.view" },
        { href: `${base}/equipe`, label: "Equipe e permissões", icon: "users", perm: "members.view" },
        { href: `${base}/assinatura`, label: "Plano e consumo", icon: "plans", perm: "billing.view" },
        { href: `${base}/suporte`, label: "Suporte", icon: "support", perm: "support.use" },
        { href: `${base}/auditoria`, label: "Registro de atividades", icon: "security", perm: "audit.view" },
      ],
    },
  ];
  return sections
    .map((s) => ({ title: s.title, items: s.items.filter((i) => !i.perm || perms.has(i.perm)).map((i) => ({ href: i.href, label: i.label, icon: i.icon, exact: i.exact, badge: i.badge })) }))
    .filter((s) => s.items.length > 0);
}
