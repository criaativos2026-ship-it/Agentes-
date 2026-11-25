import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDatabase, ownerSql } from "../helpers/db";
import { closeDb, withPlatform, withOrg } from "@/server/db/client";
import { users, permissions as permissionsTable } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import { createSession, revokeAllUserSessions, revokeSessionByToken, validateSessionToken } from "@/server/auth/session";
import { clearRateLimit, hitRateLimit } from "@/server/auth/rate-limit";
import { ALL_PERMISSIONS } from "@/server/rbac/catalog";
import { addMember, createOrganization, systemRoleId } from "@/server/services/organizations";

let userId: string;

beforeAll(async () => {
  await resetDatabase();
  [{ id: userId }] = await withPlatform(null, async (tx) =>
    tx.insert(users).values({ email: "ana@teste.local", name: "Ana", passwordHash: await hashPassword("senha-forte-123") }).returning({ id: users.id }),
  );
});

afterAll(async () => {
  await closeDb();
});

describe("sessões no banco", () => {
  it("cria e valida a sessão; no banco fica só o hash do token", async () => {
    const { token } = await createSession(userId, { ip: "127.0.0.1", userAgent: "vitest" });
    const s = await validateSessionToken(token);
    expect(s?.user.email).toBe("ana@teste.local");
    const own = ownerSql();
    const rows = await own`select token_hash from sessions where user_id = ${userId}`;
    await own.end();
    expect(rows.every((r) => r.token_hash !== token)).toBe(true);
  });

  it("token inválido ou revogado não autentica", async () => {
    expect(await validateSessionToken("token-qualquer")).toBeNull();
    const { token } = await createSession(userId, {});
    await revokeSessionByToken(token);
    expect(await validateSessionToken(token)).toBeNull();
  });

  it("conta desativada perde acesso imediatamente", async () => {
    const { token } = await createSession(userId, {});
    await withPlatform(null, (tx) => tx.update(users).set({ status: "disabled" }).where(eq(users.id, userId)));
    expect(await validateSessionToken(token)).toBeNull();
    await withPlatform(null, (tx) => tx.update(users).set({ status: "active" }).where(eq(users.id, userId)));
    expect(await validateSessionToken(token)).not.toBeNull();
  });

  it("encerrar todas as sessões mantém apenas a atual", async () => {
    const a = await createSession(userId, {});
    const b = await createSession(userId, {});
    const current = await validateSessionToken(a.token);
    await revokeAllUserSessions(userId, current!.sessionId);
    expect(await validateSessionToken(a.token)).not.toBeNull();
    expect(await validateSessionToken(b.token)).toBeNull();
  });

  it("sessão expirada não autentica", async () => {
    const { token } = await createSession(userId, {});
    const own = ownerSql();
    await own`update sessions set expires_at = now() - interval '1 minute' where user_id = ${userId}`;
    await own.end();
    expect(await validateSessionToken(token)).toBeNull();
  });
});

describe("limite de tentativas (no banco)", () => {
  it("bloqueia após o limite e libera ao limpar", async () => {
    const key = "login:teste@x";
    for (let i = 0; i < 3; i++) expect((await hitRateLimit(key, 3, 900)).allowed).toBe(true);
    expect((await hitRateLimit(key, 3, 900)).allowed).toBe(false);
    await clearRateLimit(key);
    expect((await hitRateLimit(key, 3, 900)).allowed).toBe(true);
  });
});

describe("catálogo de permissões", () => {
  it("o banco tem exatamente as permissões definidas no código", async () => {
    const rows = await withPlatform(null, (tx) => tx.select({ key: permissionsTable.key }).from(permissionsTable));
    expect(rows.map((r) => r.key).sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
});

describe("empresas e membros", () => {
  it("cria empresa com slug único e adiciona membro com papel de sistema", async () => {
    const org1 = await withPlatform(userId, (tx) => createOrganization(tx, userId, { name: "Clínica Bem Estar" }));
    const org2 = await withPlatform(userId, (tx) => createOrganization(tx, userId, { name: "Clínica Bem-Estar" }));
    expect(org1.slug).toBe("clinica-bem-estar");
    expect(org2.slug).toBe("clinica-bem-estar-2");

    const res = await withPlatform(userId, async (tx) =>
      addMember(tx, userId, {
        organizationId: org1.id,
        email: "Joana@Clinica.Local",
        name: "Joana",
        roleId: await systemRoleId(tx, "org_admin"),
        tempPassword: "provisoria-123",
      }),
    );
    expect(res.created).toBe(true);

    // A mesma pessoa pode ser adicionada a outra empresa sem criar nova conta.
    const res2 = await withPlatform(userId, async (tx) =>
      addMember(tx, userId, { organizationId: org2.id, email: "joana@clinica.local", name: "Joana", roleId: await systemRoleId(tx, "org_member") }),
    );
    expect(res2.created).toBe(false);
    expect(res2.userId).toBe(res.userId);

    // Duplicidade na mesma empresa é recusada.
    await expect(
      withPlatform(userId, async (tx) =>
        addMember(tx, userId, { organizationId: org1.id, email: "joana@clinica.local", name: "Joana", roleId: await systemRoleId(tx, "org_member") }),
      ),
    ).rejects.toThrow(/já faz parte/);

    // A auditoria da empresa 1 não aparece para a empresa 2.
    const logs = await withOrg(org2.id, null, (tx) => tx.query.auditLogs.findMany());
    expect(logs.every((l) => l.organizationId === org2.id)).toBe(true);
  });
});
