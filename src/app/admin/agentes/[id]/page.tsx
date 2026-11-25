import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLinkIcon } from "lucide-react";
import { requirePlatformUser } from "@/server/auth/guards";
import { getAgentBuilder } from "@/server/queries/agents";
import { MODELS, PROVIDERS } from "@/server/ai/models";
import { resolveProvider } from "@/server/ai/credentials";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uuidSchema } from "@/lib/validation";
import type { ProviderId } from "@/server/ai/types";
import { AccessForm, IdentityForm, IntelligenceForm, KnowledgeForm, PublishBar, TestArea, ToolsForm, VersionsList } from "./builder-forms";

export const metadata: Metadata = { title: "Construtor" };

export default async function AgentBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformUser();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const d = await getAgentBuilder(user.id, id);
  if (!d) notFound();
  const { agent, draft, org } = d;
  const providerReady = draft ? Boolean(await resolveProvider(org.id, draft.provider as ProviderId)) : false;
  const published = d.versions.find((v) => v.id === agent.publishedVersionId);
  const draftIsPublished = draft?.id === agent.publishedVersionId;
  return (
    <>
      <PageHeader
        eyebrow={`Construtor · ${org.name}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-xl">{agent.avatar ?? "🤖"}</span>
            {agent.name} <StatusBadge kind="agent" status={agent.status} />
          </span>
        }
        description={
          <>
            Rascunho: v{draft?.version}
            {draftIsPublished ? " (igual à publicada)" : ""} · Publicada: {published ? `v${published.version}` : "nenhuma"}
          </>
        }
        actions={
          <Button asChild variant="outline">
            <Link href={`/admin/empresas/${org.id}`}><ExternalLinkIcon /> Empresa</Link>
          </Button>
        }
      />
      {!providerReady && (
        <p className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Provedor de IA <strong>{draft?.provider}</strong> pendente: cadastre a chave em <Link className="underline" href="/admin/configuracoes">Configurações → Provedores de IA</Link>. Sem isso, o agente não responde (nenhuma resposta é simulada).
        </p>
      )}
      <PublishBar agentId={agent.id} status={agent.status} hasPublished={!!published} draftIsPublished={draftIsPublished} />
      <Tabs defaultValue="identidade" className="mt-4">
        <TabsList>
          <TabsTrigger value="identidade">Identidade</TabsTrigger>
          <TabsTrigger value="inteligencia">Inteligência</TabsTrigger>
          <TabsTrigger value="ferramentas">Ferramentas ({d.tools.length})</TabsTrigger>
          <TabsTrigger value="conhecimento">Conhecimento ({d.kbLinks.length})</TabsTrigger>
          <TabsTrigger value="acesso">Acesso</TabsTrigger>
          <TabsTrigger value="testar">Testar</TabsTrigger>
          <TabsTrigger value="versoes">Versões ({d.versions.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="identidade">
          <IdentityForm agent={{ id: agent.id, name: agent.name, avatar: agent.avatar, category: agent.category, description: agent.description, objective: agent.objective }} orgName={org.name} />
        </TabsContent>
        <TabsContent value="inteligencia">
          {draft && (
            <IntelligenceForm
              agentId={agent.id}
              version={{ provider: draft.provider, model: draft.model, systemPrompt: draft.systemPrompt, instructions: draft.instructions, personality: draft.personality, language: draft.language, boundaries: draft.boundaries, params: draft.params, limits: draft.limits }}
              providers={PROVIDERS.map((p) => ({ id: p.id, label: p.label }))}
              models={MODELS.map((m) => ({ id: m.id, label: m.label, provider: m.provider }))}
              locked={!!draft.lockedAt}
            />
          )}
        </TabsContent>
        <TabsContent value="ferramentas">
          <ToolsForm agentId={agent.id} catalog={d.catalog} selected={d.tools.map((t) => ({ key: t.toolKey, requiresApproval: t.requiresApproval }))} />
        </TabsContent>
        <TabsContent value="conhecimento">
          <KnowledgeForm agentId={agent.id} orgSlug={org.slug} kbs={d.orgKbs} selected={d.kbLinks.map((k) => k.knowledgeBaseId)} />
        </TabsContent>
        <TabsContent value="acesso">
          <AccessForm agentId={agent.id} roles={d.orgRoles} selected={d.access.filter((a) => a.roleId).map((a) => a.roleId!)} />
        </TabsContent>
        <TabsContent value="testar">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <Badge variant="electric">TESTE</Badge> As conversas aqui usam o RASCUNHO (v{draft?.version}), não aparecem para o cliente e não consomem a cota do plano. Ações externas continuam exigindo aprovação.
          </div>
          <TestArea agentId={agent.id} agentName={agent.name} initialMessages={d.testMessages} conversationId={d.testConv?.id} disabledReason={providerReady ? undefined : "Configure a chave do provedor de IA para testar."} />
        </TabsContent>
        <TabsContent value="versoes">
          <VersionsList agentId={agent.id} versions={d.versions.map((v) => ({ id: v.id, version: v.version, model: v.model, locked: !!v.lockedAt, notes: v.notes, createdAt: v.createdAt.toISOString() }))} publishedId={agent.publishedVersionId} draftId={agent.draftVersionId} />
        </TabsContent>
      </Tabs>
    </>
  );
}
