import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { withPlatform } from "@/server/db/client";
import { agentAccess, agents, agentTools, customProjects, executions, integrations, organizations, projectEvents, users } from "@/server/db/schema";

export async function listProjects(userId: string) {
  return withPlatform(userId, (tx) =>
    tx
      .select({ p: customProjects, orgName: organizations.name, owner: users.name })
      .from(customProjects)
      .innerJoin(organizations, eq(organizations.id, customProjects.organizationId))
      .leftJoin(users, eq(users.id, customProjects.ownerUserId))
      .orderBy(desc(customProjects.updatedAt)),
  );
}

/** Projeto + checklist do fluxo de implantação calculado com dados reais da empresa. */
export async function getProject(userId: string, id: string) {
  return withPlatform(userId, async (tx) => {
    const [row] = await tx.select({ p: customProjects, org: organizations }).from(customProjects).innerJoin(organizations, eq(organizations.id, customProjects.organizationId)).where(eq(customProjects.id, id));
    if (!row) return null;
    const { p, org } = row;
    const events = await tx.select({ e: projectEvents, user: users.name }).from(projectEvents).leftJoin(users, eq(users.id, projectEvents.userId)).where(eq(projectEvents.projectId, id)).orderBy(desc(projectEvents.createdAt));
    const orgAgents = await tx.select({ id: agents.id, name: agents.name, status: agents.status, draft: agents.draftVersionId }).from(agents).where(eq(agents.organizationId, org.id)).orderBy(asc(agents.name));
    const versionIds = orgAgents.map((a) => a.draft).filter(Boolean) as string[];
    const [withTools] = versionIds.length ? await tx.select({ n: sql<number>`count(distinct ${agentTools.agentVersionId})::int` }).from(agentTools).where(inArray(agentTools.agentVersionId, versionIds)) : [{ n: 0 }];
    const [access] = await tx.select({ n: count() }).from(agentAccess).where(eq(agentAccess.organizationId, org.id));
    const [tests] = await tx.select({ n: count() }).from(executions).where(and(eq(executions.organizationId, org.id), eq(executions.isTest, true), eq(executions.status, "succeeded")));
    const integ = await tx.select({ key: integrations.providerKey, status: integrations.status }).from(integrations).where(eq(integrations.organizationId, org.id));
    const staff = await tx.select({ id: users.id, name: users.name }).from(users).where(isNotNull(users.platformRole)).orderBy(users.name);
    const published = orgAgents.filter((a) => a.status === "published").length;
    const missingInteg = p.requiredIntegrations.filter((k) => !integ.some((i) => i.key === k && i.status === "connected"));
    const checklist = [
      { label: "Empresa cadastrada", done: true },
      { label: "Segmento registrado", done: Boolean(p.segment ?? org.segment) },
      { label: "Necessidades identificadas", done: Boolean(p.needs) },
      { label: "Processos a automatizar", done: p.processes.some((x) => x.automate) },
      { label: `Agentes definidos (${orgAgents.length}/${p.plannedAgents.length || "?"})`, done: orgAgents.length > 0 && orgAgents.length >= p.plannedAgents.length },
      { label: "Ferramentas configuradas", done: Number(withTools.n) > 0 },
      { label: missingInteg.length ? `Integrações pendentes: ${missingInteg.join(", ")}` : "Integrações conectadas", done: missingInteg.length === 0 },
      { label: "Permissões definidas", done: Number(access.n) > 0, optional: true },
      { label: `Agentes testados (${tests.n} teste(s) bem-sucedido(s))`, done: Number(tests.n) > 0 },
      { label: "Projeto aprovado", done: ["active", "maintenance"].includes(p.status) },
      { label: `Publicado no painel do cliente (${published} agente(s))`, done: published > 0 },
    ];
    return { p, org, events, orgAgents, integ, staff, checklist };
  });
}
