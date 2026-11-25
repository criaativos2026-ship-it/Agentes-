import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { agentStatus } from "./enums";
import { organizations, roles, users } from "./identity";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export type AgentParams = {
  maxTokens?: number;
  /** Profundidade de raciocínio (provedores que suportam, ex.: Claude). */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Só para provedores/modelos que ainda aceitam. */
  temperature?: number;
};

export type AgentLimits = {
  maxSteps: number;
  timeoutSeconds: number;
  maxTokensPerRun: number;
};

export const DEFAULT_LIMITS: AgentLimits = { maxSteps: 12, timeoutSeconds: 300, maxTokensPerRun: 200_000 };

/** Catálogo da plataforma: modelos para criar agentes sem começar do zero. */
export const agentTemplates = pgTable("agent_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  objective: text("objective").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  personality: text("personality"),
  suggestedTools: jsonb("suggested_tools").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    avatar: text("avatar"),
    description: text("description"),
    category: text("category").notNull().default("personalizado"),
    objective: text("objective"),
    status: agentStatus("status").notNull().default("draft"),
    templateKey: text("template_key"),
    draftVersionId: uuid("draft_version_id"),
    publishedVersionId: uuid("published_version_id"),
    publishedAt: ts("published_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agents_org_slug_uq").on(t.organizationId, t.slug),
    index("agents_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const agentVersions = pgTable(
  "agent_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    systemPrompt: text("system_prompt").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    personality: text("personality").notNull().default(""),
    language: text("language").notNull().default("pt-BR"),
    boundaries: text("boundaries").notNull().default(""),
    params: jsonb("params").$type<AgentParams>().notNull().default({}),
    limits: jsonb("limits").$type<AgentLimits>().notNull().default(DEFAULT_LIMITS),
    notes: text("notes"),
    /** Versões publicadas (ou que já foram) ficam congeladas. */
    lockedAt: ts("locked_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_versions_agent_version_uq").on(t.agentId, t.version)],
);

export const agentTools = pgTable(
  "agent_tools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentVersionId: uuid("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: "cascade" }),
    toolKey: text("tool_key").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    /** null = usa o padrão da ferramenta. */
    requiresApproval: boolean("requires_approval"),
  },
  (t) => [uniqueIndex("agent_tools_version_tool_uq").on(t.agentVersionId, t.toolKey)],
);

export const agentAccess = pgTable(
  "agent_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("agent_access_agent_idx").on(t.agentId),
    check("agent_access_target_ck", sql`(${t.roleId} is not null) <> (${t.userId} is not null)`),
  ],
);

export type Agent = typeof agents.$inferSelect;
export type AgentVersion = typeof agentVersions.$inferSelect;
export type AgentTemplate = typeof agentTemplates.$inferSelect;
