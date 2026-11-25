/**
 * Aplica as migrações (tabelas, RLS e catálogos).
 * Usa DATABASE_MIGRATION_URL (papel dono das tabelas), NUNCA a URL da aplicação.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_MIGRATION_URL;
if (!url) throw new Error("DATABASE_MIGRATION_URL não configurada (veja .env.example).");
const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
await client.end();
console.log("Migrações aplicadas.");
