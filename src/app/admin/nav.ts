import type { NavSection } from "@/components/shell/icons";

/** Menu do super administrador. Só entram itens com tela funcionando. */
export const ADMIN_NAV: NavSection[] = [
  {
    items: [{ href: "/admin", label: "Dashboard", icon: "dashboard", exact: true }],
  },
  {
    title: "Clientes",
    items: [
      { href: "/admin/empresas", label: "Empresas", icon: "orgs" },
      { href: "/admin/projetos", label: "Projetos personalizados", icon: "projects" },
      { href: "/admin/usuarios", label: "Usuários", icon: "users" },
    ],
  },
  {
    title: "Agentes",
    items: [
      { href: "/admin/agentes", label: "Construtor de agentes", icon: "builder" },
      { href: "/admin/execucoes", label: "Monitoramento", icon: "monitor" },
      { href: "/admin/consumo", label: "Consumo de IA", icon: "usage" },
      { href: "/admin/integracoes", label: "Integrações", icon: "integrations" },
    ],
  },
  {
    title: "Comercial",
    items: [
      { href: "/admin/planos", label: "Planos", icon: "plans" },
      { href: "/admin/financeiro", label: "Assinaturas e pagamentos", icon: "finance" },
    ],
  },
  {
    title: "Operação",
    items: [
      { href: "/admin/suporte", label: "Central de suporte", icon: "support" },
      { href: "/admin/auditoria", label: "Logs de atividades", icon: "logs" },
      { href: "/admin/configuracoes", label: "Configurações", icon: "settings" },
    ],
  },
];
