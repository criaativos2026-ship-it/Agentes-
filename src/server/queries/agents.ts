import "server-only";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { withOrg, withPlatform } from "@/server/db/client";
import {
  agentAccess,
  agentKnowledgeBases,
  agents,
  agentTemplates,
  agentTools,
  agentVersions,
  conversations,
  knowledgeBases,
  messages,
  organizations,
  roles,
} from "@/server/db/schema";
import { listTools } from "@/server/tools/registry";
import type { ChatMessage } from "@/components/agents/chat-panel";

export async function listAllAgents(userId: string, f: { orgId?: string; status?: string }) {
  return withPlatform(userId, (tx) =>
    tx
      .select({ id: agents.id, name: agents.name, avatar: agents.avatar, category: agents.category, status: agents.status, updatedAt: agents.updatedAt, orgName: organizations.name, orgId: organizations.id, isDemo: organizations.isDemo })
      .from(agents)
      .innerJoin(organizations, eq(organizations.id, agents.organizationId))
      .where(and(f.orgId ? eq(agents.organizationId, f.orgId) : undefined, f.status ? eq(agents.status, f.status as "draft") : undefined))
      .orderBy(desc(agents.updatedAt)),
  );
}

export async function builderOptions(userId: string) {
  return withPlatform(userId, async (tx) => ({
    orgs: await tx.select({ id: organizations.id, name: organizations.name }).from(organizations).orderBy(organizations.name),
    templates: await tx.select().from(agentTemplates).where(eq(agentTemplates.isActive, true)).orderBy(agentTemplates.name),
  }));
}

export function messagesToChat(rows: { id: string; role: string; content: { type: string; text?: string; name?: string; input?: unknown }[]; executionId: string | null }[]): ChatMessage[] {
  return rows
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      text: m.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n"),
      tools: m.content.filter((c) => c.type === "tool_call").map((c) => ({ name: c.name ?? "", status: String((c.input as { status?: string })?.status ?? "") })),
      executionId: m.executionId,
    }));
}

export async function getAgentBuilder(userId: string, agentId: string) {
  const [base] = await withPlatform(userId, (tx) => tx.select({ orgId: agents.organizationId }).from(agents).where(eq(agents.id, agentId)));
  if (!base) return null;
  const orgId = base.orgId;
  return withOrg(orgId, userId, async (tx) => {
    const [agent] = await tx.select().from(agents).where(eq(agents.id, agentId));
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
    const versions = await tx.select().from(agentVersions).where(eq(agentVersions.agentId, agentId)).orderBy(desc(agentVersions.version));
    const draft = versions.find((v) => v.id === agent.draftVersionId) ?? versions[0];
    const tools = draft ? await tx.select().from(agentTools).where(eq(agentTools.agentVersionId, draft.id)) : [];
    const kbLinks = draft ? await tx.select().from(agentKnowledgeBases).where(eq(agentKnowledgeBases.agentVersionId, draft.id)) : [];
    const orgKbs = await tx.select({ id: knowledgeBases.id, name: knowledgeBases.name, description: knowledgeBases.description }).from(knowledgeBases).orderBy(knowledgeBases.name);
    const orgRoles = await tx.select({ id: roles.id, name: roles.name }).from(roles).where(or(isNull(roles.organizationId), eq(roles.organizationId, orgId))).orderBy(roles.name);
    const access = await tx.select().from(agentAccess).where(eq(agentAccess.agentId, agentId));
    const [testConv] = await tx.select().from(conversations).where(and(eq(conversations.agentId, agentId), eq(conversations.isTest, true), eq(conversations.userId, userId))).orderBy(desc(conversations.updatedAt)).limit(1);
    const testMessages = testConv ? await tx.select().from(messages).where(eq(messages.conversationId, testConv.id)).orderBy(asc(messages.createdAt)) : [];
    const catalog = await Promise.all(
      listTools().map(async (t) => {
        const av = await t.availability({ orgId, orgSettings: org.settings, config: {} });
        return { key: t.key, name: t.name, description: t.description, category: t.category, risk: t.risk, integration: t.integration ?? null, defaultApproval: typeof t.requiresApproval === "function" ? "condicional" : t.requiresApproval ? "sim" : "não", available: av.ok, reason: av.ok ? null : av.reason };
      }),
    );
    return { agent, org, versions, draft, tools, kbLinks, orgKbs, orgRoles, access, testConv: testConv ?? null, testMessages: messagesToChat(testMessages), catalog };
  });
}
