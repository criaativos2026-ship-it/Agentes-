import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { credentialKind, integrationStatus } from "./enums";
import { organizations, users } from "./identity";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    providerKey: text("provider_key").notNull(),
    name: text("name").notNull(),
    status: integrationStatus("status").notNull().default("pending_credentials"),
    /** Configuração NÃO secreta (ex.: ID do número de telefone do WhatsApp). */
    config: jsonb("config").$type<Record<string, string>>().notNull().default({}),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    connectedAt: ts("connected_at"),
    lastCheckedAt: ts("last_checked_at"),
    lastError: text("last_error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("integrations_org_provider_uq").on(t.organizationId, t.providerKey)],
);

export const integrationCredentials = pgTable("integration_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  integrationId: uuid("integration_id")
    .notNull()
    .unique()
    .references(() => integrations.id, { onDelete: "cascade" }),
  kind: credentialKind("kind").notNull(),
  ciphertext: text("ciphertext").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  expiresAt: ts("expires_at"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const integrationUsage = pgTable(
  "integration_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    status: text("status").notNull(),
    detail: text("detail"),
    executionId: uuid("execution_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("integration_usage_integration_idx").on(t.integrationId, t.createdAt)],
);

/**
 * Chaves de provedores de IA. organization_id null = chave da plataforma (usada por todas as
 * empresas, consumo cobrado no plano); preenchido = a empresa traz a própria chave.
 */
export const aiProviderCredentials = pgTable(
  "ai_provider_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    label: text("label"),
    baseUrl: text("base_url"),
    ciphertext: text("ciphertext").notNull(),
    keyHint: text("key_hint").notNull(),
    status: text("status").notNull().default("unverified"),
    lastCheckedAt: ts("last_checked_at"),
    lastError: text("last_error"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_provider_credentials_uq").on(
      sql`coalesce(${t.organizationId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      t.provider,
    ),
  ],
);

export type Integration = typeof integrations.$inferSelect;
