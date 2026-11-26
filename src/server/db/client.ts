import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const g = globalThis as unknown as { __nexusPg?: ReturnType<typeof postgres>; __nexusDb?: Db };

/** Conexão preguiçosa: o build não depende do banco. Compatível com pooler (prepare: false). */
function getDb(): Db {
  if (g.__nexusDb) return g.__nexusDb;
  // DATABASE_URL (Supabase/PostgreSQL próprio) ou NETLIFY_DB_URL (Netlify Database, preenchida automaticamente).
  const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    prepare: false,
    idle_timeout: 20,
    onnotice: () => {},
  });
  g.__nexusPg = client;
  g.__nexusDb = drizzle(client, { schema });
  return g.__nexusDb;
}

export type Scope =
  | { scope: "org"; orgId: string; userId: string | null }
  | { scope: "platform"; userId: string | null }
  | { scope: "user"; userId: string }
  | { scope: "auth"; userId?: string | null };

/**
 * Executa `fn` numa transação com o contexto de segurança definido para o RLS.
 * Este é o ÚNICO caminho de acesso ao banco para código da aplicação.
 */
export async function runScoped<T>(ctx: Scope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const orgId = ctx.scope === "org" ? ctx.orgId : "";
    const userId = ctx.userId ?? "";
    // Sempre como "nexus_app" (sem BYPASSRLS e sem ser dono das tabelas): o RLS vale mesmo quando a
    // conexão é a do dono do banco (caso do Netlify Database, que fornece uma única credencial).
    await tx.execute(sql`set local role nexus_app`);
    await tx.execute(
      sql`select set_config('app.scope', ${ctx.scope}, true), set_config('app.org_id', ${orgId}, true), set_config('app.user_id', ${userId}, true)`,
    );
    return fn(tx);
  });
}

/** Dados de UMA empresa (painel do cliente, worker executando tarefa da empresa). */
export const withOrg = <T>(orgId: string, userId: string | null, fn: (tx: Tx) => Promise<T>) =>
  runScoped({ scope: "org", orgId, userId }, fn);

/** Visão global. Só chamar DEPOIS de conferir platform_role no servidor, ou em rotinas do sistema. */
export const withPlatform = <T>(userId: string | null, fn: (tx: Tx) => Promise<T>) =>
  runScoped({ scope: "platform", userId }, fn);

/** Dados do próprio usuário, sem empresa selecionada (ex.: listar as empresas dele). */
export const withUser = <T>(userId: string, fn: (tx: Tx) => Promise<T>) => runScoped({ scope: "user", userId }, fn);

/** Fluxos de autenticação (login, sessão, recuperação de senha). */
export const withAuth = <T>(fn: (tx: Tx) => Promise<T>, userId?: string | null) =>
  runScoped({ scope: "auth", userId }, fn);

/** Encerra o pool (scripts e testes). */
export async function closeDb() {
  await g.__nexusPg?.end({ timeout: 5 });
  g.__nexusPg = undefined;
  g.__nexusDb = undefined;
}
