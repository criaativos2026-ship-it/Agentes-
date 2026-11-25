import "server-only";
import { and, eq } from "drizzle-orm";
import { withOrg } from "@/server/db/client";
import { integrationCredentials, integrations, integrationUsage } from "@/server/db/schema";
import { decryptSecret, encryptSecret } from "@/server/security/crypto";

const aad = (orgId: string, key: string) => `integration:${orgId}:${key}`;

export type ConnectedIntegration = { id: string; config: Record<string, string>; secrets: Record<string, string> };

/** Integração CONECTADA (testada) da empresa, com segredos descriptografados. Null se não estiver pronta. */
export async function getConnectedIntegration(orgId: string, key: string): Promise<ConnectedIntegration | null> {
  return withOrg(orgId, null, async (tx) => {
    const [row] = await tx
      .select({ id: integrations.id, status: integrations.status, config: integrations.config, ciphertext: integrationCredentials.ciphertext })
      .from(integrations)
      .leftJoin(integrationCredentials, eq(integrationCredentials.integrationId, integrations.id))
      .where(and(eq(integrations.organizationId, orgId), eq(integrations.providerKey, key)))
      .limit(1);
    if (!row || row.status !== "connected") return null;
    const secrets = row.ciphertext ? (JSON.parse(decryptSecret(row.ciphertext, aad(orgId, key))) as Record<string, string>) : {};
    return { id: row.id, config: row.config, secrets };
  });
}

export async function integrationStatus(orgId: string, key: string) {
  const [row] = await withOrg(orgId, null, (tx) =>
    tx.select({ status: integrations.status }).from(integrations).where(and(eq(integrations.organizationId, orgId), eq(integrations.providerKey, key))).limit(1),
  );
  return row?.status ?? null;
}

export function sealSecrets(orgId: string, key: string, secrets: Record<string, string>) {
  return encryptSecret(JSON.stringify(secrets), aad(orgId, key));
}

export function openSecrets(orgId: string, key: string, ciphertext: string) {
  return JSON.parse(decryptSecret(ciphertext, aad(orgId, key))) as Record<string, string>;
}

export async function recordIntegrationUsage(orgId: string, integrationId: string, action: string, status: "ok" | "error", detail?: string, executionId?: string) {
  await withOrg(orgId, null, (tx) =>
    tx.insert(integrationUsage).values({ organizationId: orgId, integrationId, action, status, detail: detail?.slice(0, 500), executionId }),
  );
}
