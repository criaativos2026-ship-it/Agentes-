/**
 * Isolamento entre empresas no BANCO (Row Level Security), usando a mesma conexão da aplicação
 * (papel nexus_app, sem BYPASSRLS). Cobre o requisito "nunca permitir que um cliente visualize
 * informações de outra empresa" mesmo que o código esqueça um filtro.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appSql, ownerSql, resetDatabase } from "../helpers/db";

type Sql = ReturnType<typeof appSql>;
let app: Sql;
let orgA: string, orgB: string, userA: string, userB: string, agentA: string, agentB: string;

/** Executa como a aplicação, com o contexto de escopo definido na transação. */
async function scoped<T>(scope: string, orgId: string | null, userId: string | null, fn: (sql: postgres.TransactionSql) => Promise<T>) {
  return app.begin(async (tx) => {
    await tx`select set_config('app.scope', ${scope}, true), set_config('app.org_id', ${orgId ?? ""}, true), set_config('app.user_id', ${userId ?? ""}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
import type postgres from "postgres";

beforeAll(async () => {
  await resetDatabase();
  const own = ownerSql();
  [{ id: orgA }] = await own`insert into organizations (name, slug) values ('Empresa A', 'empresa-a') returning id`;
  [{ id: orgB }] = await own`insert into organizations (name, slug) values ('Empresa B', 'empresa-b') returning id`;
  [{ id: userA }] = await own`insert into users (email, name, password_hash) values ('a@teste.local', 'Ana', 'x') returning id`;
  [{ id: userB }] = await own`insert into users (email, name, password_hash) values ('b@teste.local', 'Bruno', 'x') returning id`;
  const [{ id: roleId }] = await own`select id from roles where organization_id is null and key = 'org_member'`;
  await own`insert into organization_members (organization_id, user_id, role_id) values (${orgA}, ${userA}, ${roleId}), (${orgB}, ${userB}, ${roleId})`;
  [{ id: agentA }] = await own`insert into agents (organization_id, name, slug) values (${orgA}, 'Agente A', 'agente-a') returning id`;
  [{ id: agentB }] = await own`insert into agents (organization_id, name, slug) values (${orgB}, 'Agente B', 'agente-b') returning id`;
  await own.end();
  app = appSql();
});

afterAll(async () => {
  await app.end();
});

describe("RLS — isolamento multiempresa", () => {
  it("todas as tabelas do schema public têm RLS, exceto rate_limit_buckets", async () => {
    const own = ownerSql();
    const rows = await own<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`;
    await own.end();
    expect(rows.map((r) => r.tablename)).toEqual(["rate_limit_buckets"]);
  });

  it("o papel da aplicação não ignora RLS e não é dono das tabelas", async () => {
    const [r] = await app`select rolbypassrls, rolsuper from pg_roles where rolname = current_user`;
    expect(r.rolbypassrls).toBe(false);
    expect(r.rolsuper).toBe(false);
    const owned = await app`select count(*)::int as n from pg_tables where schemaname = 'public' and tableowner = current_user`;
    expect(owned[0].n).toBe(0);
  });

  it("sem contexto definido, nenhuma linha empresarial é visível", async () => {
    const agents = await app`select id from agents`;
    expect(agents).toHaveLength(0);
    const orgs = await app`select id from organizations`;
    expect(orgs).toHaveLength(0);
    const users = await app`select id from users`;
    expect(users).toHaveLength(0);
  });

  it("empresa A só enxerga os próprios agentes — mesmo consultando sem filtro", async () => {
    const rows = await scoped("org", orgA, userA, (tx) => tx`select id from agents`);
    expect(rows.map((r) => r.id)).toEqual([agentA]);
    const byId = await scoped("org", orgA, userA, (tx) => tx`select id from agents where id = ${agentB}`);
    expect(byId).toHaveLength(0);
  });

  it("empresa A não consegue inserir dados em nome da empresa B", async () => {
    await expect(
      scoped("org", orgA, userA, (tx) => tx`insert into agents (organization_id, name, slug) values (${orgB}, 'Intruso', 'intruso')`),
    ).rejects.toThrow(/row-level security/);
  });

  it("empresa A não consegue alterar nem apagar dados da empresa B", async () => {
    const upd = await scoped("org", orgA, userA, (tx) => tx`update agents set name = 'Hackeado' where id = ${agentB} returning id`);
    expect(upd).toHaveLength(0);
    const del = await scoped("org", orgA, userA, (tx) => tx`delete from agents where id = ${agentB} returning id`);
    expect(del).toHaveLength(0);
    const own = ownerSql();
    const [b] = await own`select name from agents where id = ${agentB}`;
    await own.end();
    expect(b.name).toBe("Agente B");
  });

  it("empresa A não consegue mover um registro próprio para a empresa B", async () => {
    await expect(
      scoped("org", orgA, userA, (tx) => tx`update agents set organization_id = ${orgB} where id = ${agentA}`),
    ).rejects.toThrow(/row-level security/);
  });

  it("empresa vê apenas a si mesma e apenas os próprios membros/usuários", async () => {
    const orgs = await scoped("org", orgA, userA, (tx) => tx`select id from organizations`);
    expect(orgs.map((o) => o.id)).toEqual([orgA]);
    const users = await scoped("org", orgA, userA, (tx) => tx`select email from users order by email`);
    expect(users.map((u) => u.email)).toEqual(["a@teste.local"]);
    const members = await scoped("org", orgA, userA, (tx) => tx`select organization_id from organization_members`);
    expect(new Set(members.map((m) => m.organization_id))).toEqual(new Set([orgA]));
  });

  it("escopo de usuário enxerga só as empresas das quais a pessoa é membro", async () => {
    const orgs = await scoped("user", null, userB, (tx) => tx`select slug from organizations`);
    expect(orgs.map((o) => o.slug)).toEqual(["empresa-b"]);
  });

  it("papéis de sistema são legíveis, mas não editáveis por uma empresa", async () => {
    const roles = await scoped("org", orgA, userA, (tx) => tx`select key from roles where organization_id is null order by key`);
    expect(roles.map((r) => r.key)).toEqual(["org_admin", "org_member"]);
    const upd = await scoped("org", orgA, userA, (tx) => tx`update roles set name = 'X' where organization_id is null returning id`);
    expect(upd).toHaveLength(0);
    await expect(
      scoped("org", orgA, userA, (tx) => tx`insert into role_permissions (role_id, permission_key) select id, 'audit.view' from roles where key = 'org_member' and organization_id is null`),
    ).rejects.toThrow(/row-level security/);
  });

  it("catálogo da plataforma (planos) é somente leitura para empresas", async () => {
    await expect(
      scoped("org", orgA, userA, (tx) => tx`insert into plans (key, name, type, limits) values ('hack', 'Hack', 'monthly', '{}'::jsonb)`),
    ).rejects.toThrow(/row-level security/);
  });

  it("escopo plataforma enxerga todas as empresas", async () => {
    const rows = await scoped("platform", null, null, (tx) => tx`select id from agents order by name`);
    expect(rows.map((r) => r.id)).toEqual([agentA, agentB]);
  });

  it("credenciais de integração de outra empresa são invisíveis", async () => {
    const own = ownerSql();
    const [{ id: integ }] = await own`insert into integrations (organization_id, provider_key, name) values (${orgB}, 'gmail', 'Gmail') returning id`;
    await own`insert into integration_credentials (organization_id, integration_id, kind, ciphertext) values (${orgB}, ${integ}, 'oauth', 'v1.x.y.z')`;
    await own.end();
    const creds = await scoped("org", orgA, userA, (tx) => tx`select id from integration_credentials`);
    expect(creds).toHaveLength(0);
  });

  it("sessões de outros usuários são invisíveis fora do escopo de autenticação", async () => {
    const own = ownerSql();
    await own`insert into sessions (user_id, token_hash, expires_at) values (${userB}, 'hash-b', now() + interval '1 day')`;
    await own.end();
    const rows = await scoped("org", orgA, userA, (tx) => tx`select id from sessions`);
    expect(rows).toHaveLength(0);
  });

  it("versão de agente publicada (travada) não pode ser alterada", async () => {
    const own = ownerSql();
    const [{ id: v }] = await own`insert into agent_versions (organization_id, agent_id, version, provider, model, locked_at)
      values (${orgA}, ${agentA}, 1, 'anthropic', 'claude-opus-5-5', now()) returning id`;
    await own.end();
    await expect(
      scoped("org", orgA, userA, (tx) => tx`update agent_versions set system_prompt = 'mudou' where id = ${v}`),
    ).rejects.toThrow(/locked/);
    await expect(
      scoped("org", orgA, userA, (tx) => tx`insert into agent_tools (organization_id, agent_version_id, tool_key) values (${orgA}, ${v}, 'web_search')`),
    ).rejects.toThrow(/locked/);
  });
});
