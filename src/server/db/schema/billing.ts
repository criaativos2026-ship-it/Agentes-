import { bigint, boolean, check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { paymentMethod, paymentStatus, planType, subscriptionStatus, usageKind } from "./enums";
import { organizations, users } from "./identity";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export type PlanLimits = {
  agents: number | null;
  users: number | null;
  executionsPerMonth: number | null;
  tokensPerMonth: number | null;
  storageMb: number | null;
};

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    type: planType("type").notNull(),
    priceCents: integer("price_cents").notNull().default(0),
    currency: text("currency").notNull().default("BRL"),
    intervalMonths: integer("interval_months").notNull().default(1),
    limits: jsonb("limits").$type<PlanLimits>().notNull(),
    features: jsonb("features").$type<string[]>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    isPublic: boolean("is_public").notNull().default(true),
    validUntil: date("valid_until"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [check("plans_price_ck", sql`${t.priceCents} >= 0`), check("plans_interval_ck", sql`${t.intervalMonths} > 0`)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    status: subscriptionStatus("status").notNull().default("trialing"),
    currentPeriodStart: date("current_period_start").notNull(),
    currentPeriodEnd: date("current_period_end").notNull(),
    customLimits: jsonb("custom_limits").$type<Partial<PlanLimits>>(),
    customPriceCents: integer("custom_price_cents"),
    gateway: text("gateway"),
    gatewayRef: text("gateway_ref"),
    canceledAt: ts("canceled_at"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("subscriptions_org_idx").on(t.organizationId),
    // No máximo uma assinatura vigente por empresa.
    uniqueIndex("subscriptions_one_current_uq")
      .on(t.organizationId)
      .where(sql`${t.status} in ('trialing','active','past_due','suspended')`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("BRL"),
    status: paymentStatus("status").notNull().default("pending"),
    method: paymentMethod("method").notNull(),
    description: text("description"),
    dueDate: date("due_date").notNull(),
    paidAt: ts("paid_at"),
    gatewayRef: text("gateway_ref"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("payments_org_due_idx").on(t.organizationId, t.dueDate),
    check("payments_amount_ck", sql`${t.amountCents} >= 0`),
  ],
);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id"),
    executionId: uuid("execution_id"),
    kind: usageKind("kind").notNull(),
    provider: text("provider"),
    model: text("model"),
    quantity: integer("quantity").notNull().default(1),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    /** AAAA-MM no fuso da empresa — base dos limites mensais. */
    period: text("period").notNull(),
    isTest: boolean("is_test").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("usage_records_org_period_idx").on(t.organizationId, t.period, t.kind)],
);

/** Idempotência de webhooks de gateways de pagamento. */
export const gatewayEvents = pgTable(
  "gateway_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gateway: text("gateway").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: ts("processed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("gateway_events_uq").on(t.gateway, t.eventId)],
);

export type Plan = typeof plans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
