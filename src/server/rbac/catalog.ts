/**
 * Catálogo de permissões das empresas (fonte única).
 * A migração 0002 grava estas chaves no banco; um teste garante que continuam iguais.
 */
export const PERMISSIONS = {
  "dashboard.view": { group: "Painel", description: "Ver o painel da empresa" },
  "agents.use": { group: "Agentes", description: "Conversar e executar tarefas com os agentes liberados" },
  "agents.view_all": { group: "Agentes", description: "Ver e usar todos os agentes contratados pela empresa" },
  "agents.access.manage": { group: "Agentes", description: "Definir quem pode usar cada agente" },
  "executions.view": { group: "Execuções", description: "Ver o histórico das próprias execuções" },
  "executions.view_all": { group: "Execuções", description: "Ver o histórico de execuções de toda a empresa" },
  "executions.cancel": { group: "Execuções", description: "Cancelar execuções em andamento" },
  "approvals.decide": { group: "Execuções", description: "Aprovar ou recusar ações sensíveis dos agentes" },
  "members.view": { group: "Equipe", description: "Ver a equipe da empresa" },
  "members.manage": { group: "Equipe", description: "Adicionar, desativar e alterar papéis de usuários" },
  "roles.manage": { group: "Equipe", description: "Criar e editar papéis e permissões" },
  "integrations.view": { group: "Integrações", description: "Ver integrações da empresa" },
  "integrations.manage": { group: "Integrações", description: "Conectar e desconectar integrações permitidas" },
  "knowledge.view": { group: "Conhecimento", description: "Ver bases de conhecimento" },
  "knowledge.manage": { group: "Conhecimento", description: "Enviar e remover documentos" },
  "tasks.view": { group: "Tarefas", description: "Ver tarefas" },
  "tasks.manage": { group: "Tarefas", description: "Criar e atualizar tarefas" },
  "reports.view": { group: "Relatórios", description: "Ver relatórios e indicadores" },
  "workflows.view": { group: "Automações", description: "Ver automações" },
  "workflows.manage": { group: "Automações", description: "Criar, ativar e executar automações" },
  "billing.view": { group: "Assinatura", description: "Ver plano, consumo e pagamentos" },
  "support.use": { group: "Suporte", description: "Abrir e acompanhar chamados" },
  "audit.view": { group: "Segurança", description: "Ver o registro de atividades (auditoria)" },
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** Papéis de sistema (disponíveis para todas as empresas). */
export const SYSTEM_ROLES = {
  org_admin: {
    name: "Administrador",
    description: "Gerencia a empresa: equipe, permissões, integrações e relatórios",
    permissions: ALL_PERMISSIONS,
  },
  org_member: {
    name: "Usuário",
    description: "Usa os agentes liberados e acompanha as próprias execuções",
    permissions: ["dashboard.view", "agents.use", "executions.view", "tasks.view", "tasks.manage", "knowledge.view", "support.use"],
  },
} as const satisfies Record<string, { name: string; description: string; permissions: readonly Permission[] }>;

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;
