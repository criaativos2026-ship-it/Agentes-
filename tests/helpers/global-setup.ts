import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { TEST_ENV } from "./env";

/** Aplica migrações no banco de teste e limpa os dados. */
export default async function setup() {
  Object.assign(process.env, TEST_ENV);
  const sql = postgres(TEST_ENV.DATABASE_MIGRATION_URL, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  await resetData(sql);
  await sql.end();
}

/** Apaga tudo e reaplica os catálogos (a migração de catálogo é idempotente). */
export async function resetData(sql: postgres.Sql) {
  const tables = await sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public'`;
  await sql.unsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  const seed = readFileSync("drizzle/0002_catalogo_inicial.sql", "utf8");
  for (const stmt of seed.split("--> statement-breakpoint")) if (stmt.trim()) await sql.unsafe(stmt);
}
