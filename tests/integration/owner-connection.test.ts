/**
 * Simula a Netlify Database: a aplicação recebe a credencial do DONO do banco.
 * Mesmo assim, cada transação assume "nexus_app" e o RLS continua isolando as empresas.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_ENV } from "../helpers/env";
import { resetDatabase } from "../helpers/db";

process.env.DATABASE_URL = TEST_ENV.DATABASE_MIGRATION_URL; // credencial de dono

let client: typeof import("@/server/db/client");
let schema: typeof import("@/server/db/schema");

beforeAll(async () => {
  await resetDatabase();
  client = await import("@/server/db/client");
  schema = await import("@/server/db/schema");
});
afterAll(async () => {
  await client.closeDb();
  process.env.DATABASE_URL = TEST_ENV.DATABASE_URL;
});

describe("conexão com credencial de dono (Netlify Database)", () => {
  it("assume nexus_app e mantém o isolamento entre empresas", async () => {
    const { withOrg, withPlatform } = client;
    const { organizations, agents } = schema;
    const { sql } = await import("drizzle-orm");
    const [a] = await withPlatform(null, (tx) => tx.insert(organizations).values({ name: "A", slug: "a-owner" }).returning());
    const [b] = await withPlatform(null, (tx) => tx.insert(organizations).values({ name: "B", slug: "b-owner" }).returning());
    await withPlatform(null, (tx) => tx.insert(agents).values([{ organizationId: a.id, name: "Ag A", slug: "ag-a" }, { organizationId: b.id, name: "Ag B", slug: "ag-b" }]));
    const who = await withOrg(a.id, null, (tx) => tx.execute<{ u: string }>(sql`select current_user as u`));
    expect(who[0].u).toBe("nexus_app");
    const seen = await withOrg(a.id, null, (tx) => tx.select({ name: agents.name }).from(agents));
    expect(seen.map((s) => s.name)).toEqual(["Ag A"]);
    await expect(withOrg(a.id, null, (tx) => tx.insert(agents).values({ organizationId: b.id, name: "x", slug: "x" }))).rejects.toThrow();
  });
});
