import {
  ActivityIcon,
  BotIcon,
  Building2Icon,
  CreditCardIcon,
  FileTextIcon,
  FolderKanbanIcon,
  GaugeIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  ListChecksIcon,
  type LucideIcon,
  PlugIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
  WorkflowIcon,
  BookOpenIcon,
  BarChart3Icon,
  CheckCircle2Icon,
} from "lucide-react";

/** Ícones referenciados por nome (o menu é montado no servidor). */
export const NAV_ICONS = {
  dashboard: LayoutDashboardIcon,
  orgs: Building2Icon,
  projects: FolderKanbanIcon,
  builder: SparklesIcon,
  agents: BotIcon,
  users: UsersIcon,
  plans: CreditCardIcon,
  usage: GaugeIcon,
  monitor: ActivityIcon,
  integrations: PlugIcon,
  support: LifeBuoyIcon,
  finance: BarChart3Icon,
  logs: ScrollTextIcon,
  settings: SettingsIcon,
  ai: KeyRoundIcon,
  tasks: ListChecksIcon,
  reports: FileTextIcon,
  workflows: WorkflowIcon,
  knowledge: BookOpenIcon,
  security: ShieldCheckIcon,
  approvals: CheckCircle2Icon,
} satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof NAV_ICONS;
export type NavItem = { href: string; label: string; icon: NavIcon; exact?: boolean; badge?: number };
export type NavSection = { title?: string; items: NavItem[] };
