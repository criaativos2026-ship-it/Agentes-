import { date, index, integer, jsonb, pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import {
  projectStatus,
  taskStatus,
  ticketPriority,
  ticketStatus,
  workflowStatus,
  workflowTrigger,
} from "./enums";
import { organizations, users } from "./identity";
import { agents } from "./agents";

const ts = (name: string) => timestamp(name, { withTimezone: true });

// ---------- Projetos personalizados ----------

export type ProjectProcess = { name: string; description: string; automate: boolean };

export const customProjects = pgTable(
  "custom_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    segment: text("segment"),
    businessDescription: text("business_description"),
    objectives: text("objectives"),
    needs: text("needs"),
    processes: jsonb("processes").$type<ProjectProcess[]>().notNull().default([]),
    plannedAgents: jsonb("planned_agents").$type<string[]>().notNull().default([]),
    requiredIntegrations: jsonb("required_integrations").$type<string[]>().notNull().default([]),
    status: projectStatus("status").notNull().default("new"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    goLiveDate: date("go_live_date"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("custom_projects_org_idx").on(t.organizationId), index("custom_projects_status_idx").on(t.status)],
);

export const projectEvents = pgTable(
  "project_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => customProjects.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    message: text("message").notNull(),
    fromStatus: projectStatus("from_status"),
    toStatus: projectStatus("to_status"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("project_events_project_idx").on(t.projectId, t.createdAt)],
);

// ---------- Workflows ----------

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    triggerType: workflowTrigger("trigger_type").notNull().default("manual"),
    triggerConfig: jsonb("trigger_config").$type<Record<string, unknown>>().notNull().default({}),
    definition: jsonb("definition").$type<unknown>().notNull(),
    status: workflowStatus("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    /** Segredo para o gatilho via webhook (hash). */
    webhookSecretHash: text("webhook_secret_hash"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("workflows_org_idx").on(t.organizationId)],
);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id"),
    status: text("status").notNull().default("queued"),
    input: jsonb("input").notNull().default({}),
    output: jsonb("output"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("workflow_runs_wf_idx").on(t.workflowId, t.createdAt)],
);

// ---------- Dados operacionais gerados pelos agentes ----------

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatus("status").notNull().default("open"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    executionId: uuid("execution_id"),
    dueAt: ts("due_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("tasks_org_status_idx").on(t.organizationId, t.status)],
);

export const crmOpportunities = pgTable(
  "crm_opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    company: text("company"),
    contact: text("contact"),
    source: text("source"),
    stage: text("stage").notNull().default("novo"),
    score: integer("score"),
    notes: text("notes"),
    executionId: uuid("execution_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("crm_opportunities_org_idx").on(t.organizationId, t.createdAt)],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    executionId: uuid("execution_id"),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("reports_org_idx").on(t.organizationId, t.createdAt)],
);

// ---------- Operação ----------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null = ação no nível da plataforma. */
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_org_created_idx").on(t.organizationId, t.createdAt),
    index("audit_logs_created_idx").on(t.createdAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    openedBy: uuid("opened_by").references(() => users.id, { onDelete: "set null" }),
    subject: text("subject").notNull(),
    status: ticketStatus("status").notNull().default("open"),
    priority: ticketPriority("priority").notNull().default("normal"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("support_tickets_org_idx").on(t.organizationId, t.status)],
);

export const supportTicketMessages = pgTable(
  "support_ticket_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    /** Nota interna da equipe NEXUS — o cliente não vê. */
    isInternal: boolean("is_internal").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("support_ticket_messages_ticket_idx").on(t.ticketId, t.createdAt)],
);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export type CustomProject = typeof customProjects.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
