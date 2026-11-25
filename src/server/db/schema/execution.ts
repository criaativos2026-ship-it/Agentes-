import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  approvalStatus,
  conversationChannel,
  executionKind,
  executionStatus,
  messageRole,
  stepStatus,
  stepType,
} from "./enums";
import { organizations, users } from "./identity";
import { agents, agentVersions } from "./agents";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    agentVersionId: uuid("agent_version_id").references(() => agentVersions.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    channel: conversationChannel("channel").notNull().default("app"),
    title: text("title"),
    isTest: boolean("is_test").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("conversations_org_agent_idx").on(t.organizationId, t.agentId, t.updatedAt)],
);

export type MessageContent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; output: unknown; isError?: boolean };

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    content: jsonb("content").$type<MessageContent[]>().notNull(),
    executionId: uuid("execution_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const executions = pgTable(
  "executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    agentVersionId: uuid("agent_version_id").references(() => agentVersions.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    workflowRunId: uuid("workflow_run_id"),
    triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
    kind: executionKind("kind").notNull(),
    status: executionStatus("status").notNull().default("queued"),
    isTest: boolean("is_test").notNull().default(false),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, unknown>>(),
    /** Estado interno do loop para retomar após aprovação. */
    state: jsonb("state").$type<Record<string, unknown>>(),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: ts("run_after").notNull().defaultNow(),
    lockedAt: ts("locked_at"),
    lockedBy: text("locked_by"),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    timeoutAt: ts("timeout_at"),
    cancelRequestedAt: ts("cancel_requested_at"),
    idempotencyKey: text("idempotency_key"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("executions_queue_idx").on(t.status, t.runAfter),
    index("executions_org_created_idx").on(t.organizationId, t.createdAt),
    index("executions_agent_idx").on(t.agentId),
    uniqueIndex("executions_idempotency_uq")
      .on(t.organizationId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
  ],
);

export const executionSteps = pgTable(
  "execution_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    type: stepType("type").notNull(),
    name: text("name").notNull(),
    status: stepStatus("status").notNull().default("running"),
    input: jsonb("input"),
    output: jsonb("output"),
    error: text("error"),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    durationMs: integer("duration_ms"),
  },
  (t) => [index("execution_steps_exec_idx").on(t.executionId, t.ordinal)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    stepId: uuid("step_id"),
    toolKey: text("tool_key").notNull(),
    toolCallId: text("tool_call_id"),
    payload: jsonb("payload").notNull(),
    summary: text("summary").notNull(),
    status: approvalStatus("status").notNull().default("pending"),
    requestedAt: ts("requested_at").notNull().defaultNow(),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    reason: text("reason"),
  },
  (t) => [index("approvals_org_status_idx").on(t.organizationId, t.status)],
);

export type Execution = typeof executions.$inferSelect;
export type ExecutionStep = typeof executionSteps.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
