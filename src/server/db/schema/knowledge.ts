import { customType, index, integer, pgTable, text, timestamp, uuid, vector, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { documentSource, documentStatus } from "./enums";
import { organizations, users } from "./identity";
import { agentVersions } from "./agents";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const EMBEDDING_DIMENSIONS = 1536;

export const knowledgeBases = pgTable(
  "knowledge_bases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("knowledge_bases_org_idx").on(t.organizationId)],
);

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sourceType: documentSource("source_type").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    sha256: text("sha256"),
    status: documentStatus("status").notNull().default("pending"),
    error: text("error"),
    chunkCount: integer("chunk_count").notNull().default(0),
    embedded: integer("embedded").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("knowledge_documents_kb_idx").on(t.knowledgeBaseId),
    uniqueIndex("knowledge_documents_kb_sha_uq").on(t.knowledgeBaseId, t.sha256),
  ],
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(sql`to_tsvector('portuguese', content)`),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    tokenEstimate: integer("token_estimate").notNull().default(0),
  },
  (t) => [
    index("knowledge_chunks_kb_idx").on(t.knowledgeBaseId),
    index("knowledge_chunks_tsv_idx").using("gin", t.tsv),
    index("knowledge_chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const agentKnowledgeBases = pgTable(
  "agent_knowledge_bases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentVersionId: uuid("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("agent_kb_uq").on(t.agentVersionId, t.knowledgeBaseId)],
);

export type KnowledgeBase = typeof knowledgeBases.$inferSelect;
export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
