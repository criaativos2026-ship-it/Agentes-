"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { RocketIcon, ShieldAlertIcon } from "lucide-react";
import {
  deleteTestConversationsAction,
  publishAgentAction,
  publishVersionAction,
  sendTestMessageAction,
  setAgentStatusAction,
  updateAccessAction,
  updateIdentityAction,
  updateIntelligenceAction,
  updateKnowledgeAction,
  updateToolsAction,
} from "@/app/actions/agents";
import { Field, FormError, useFormFeedback } from "@/components/form";
import { ConfirmButton } from "@/components/confirm-button";
import { ChatPanel, type ChatMessage } from "@/components/agents/chat-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { when } from "@/lib/format";

export function PublishBar({ agentId, status, hasPublished, draftIsPublished }: { agentId: string; status: string; hasPublished: boolean; draftIsPublished: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface/60 p-3">
      <ConfirmButton
        variant="default"
        size="default"
        disabled={draftIsPublished && status === "published"}
        title="Publicar o rascunho?"
        description="A versão atual do rascunho fica travada (imutável) e passa a ser usada pelo cliente imediatamente. Edições futuras criam uma nova versão."
        confirmLabel="Publicar"
        onConfirm={() => publishAgentAction(agentId)}
      >
        <RocketIcon /> {draftIsPublished && status === "published" ? "Publicado" : "Publicar rascunho"}
      </ConfirmButton>
      {status !== "testing" && status !== "disabled" && (
        <ConfirmButton title="Marcar como em testes?" description="Indicação interna; a versão publicada continua disponível para o cliente." onConfirm={() => setAgentStatusAction(agentId, "testing")}>
          Marcar em testes
        </ConfirmButton>
      )}
      {status === "disabled" || status === "testing" ? (
        hasPublished && (
          <ConfirmButton title="Reativar o agente?" description="A versão publicada volta a ficar disponível para o cliente." onConfirm={() => setAgentStatusAction(agentId, "published")}>
            Reativar
          </ConfirmButton>
        )
      ) : (
        <ConfirmButton variant="destructive" title="Desativar o agente?" description="O cliente deixa de conseguir usar este agente até você reativá-lo. O histórico é mantido." confirmLabel="Desativar" onConfirm={() => setAgentStatusAction(agentId, "disabled")}>
          Desativar
        </ConfirmButton>
      )}
    </div>
  );
}

export function IdentityForm({ agent, orgName }: { agent: { id: string; name: string; avatar: string | null; category: string; description: string | null; objective: string | null }; orgName: string }) {
  const [state, action] = useActionState(updateIdentityAction, undefined);
  const ref = useFormFeedback(state, { reset: false });
  return (
    <form ref={ref} action={action}>
      <input type="hidden" name="agentId" value={agent.id} />
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><FormError state={state} /></div>
          <Field label="Nome" htmlFor="name"><Input id="name" name="name" defaultValue={agent.name} required /></Field>
          <div className="grid grid-cols-[88px_1fr] gap-3">
            <Field label="Avatar" htmlFor="avatar" hint="Um emoji"><Input id="avatar" name="avatar" defaultValue={agent.avatar ?? ""} maxLength={8} className="text-center text-xl" /></Field>
            <Field label="Categoria" htmlFor="category"><Input id="category" name="category" defaultValue={agent.category} required /></Field>
          </div>
          <Field label="Empresa proprietária" htmlFor="org"><Input id="org" value={orgName} disabled readOnly /></Field>
          <div />
          <Field label="Descrição" htmlFor="description" className="grid gap-2 sm:col-span-2"><Textarea id="description" name="description" defaultValue={agent.description ?? ""} /></Field>
          <Field label="Objetivo principal" htmlFor="objective" className="grid gap-2 sm:col-span-2"><Textarea id="objective" name="objective" defaultValue={agent.objective ?? ""} /></Field>
          <div><SubmitButton>Salvar identidade</SubmitButton></div>
        </CardContent>
      </Card>
    </form>
  );
}

type Version = {
  provider: string;
  model: string;
  systemPrompt: string;
  instructions: string;
  personality: string;
  language: string;
  boundaries: string;
  params: { maxTokens?: number; effort?: string; temperature?: number };
  limits: { maxSteps: number; timeoutSeconds: number; maxTokensPerRun: number };
};

export function IntelligenceForm({ agentId, version, providers, models, locked }: { agentId: string; version: Version; providers: { id: string; label: string }[]; models: { id: string; label: string; provider: string }[]; locked: boolean }) {
  const [state, action] = useActionState(updateIntelligenceAction, undefined);
  const ref = useFormFeedback(state, { reset: false });
  const [provider, setProvider] = useState(version.provider);
  const suggestions = models.filter((m) => m.provider === provider);
  return (
    <form ref={ref} action={action} className="grid gap-4">
      <input type="hidden" name="agentId" value={agentId} />
      <FormError state={state} />
      {locked && <p className="text-xs text-ink-muted">O rascunho atual já foi publicado: ao salvar, uma nova versão de rascunho será criada automaticamente.</p>}
      <Card>
        <CardHeader><CardTitle>Modelo</CardTitle><CardDescription>Arquitetura independente de fornecedor: escolha o provedor e o modelo.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Provedor" htmlFor="provider">
            <NativeSelect id="provider" name="provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Modelo (ID)" htmlFor="model" hint={suggestions.length ? "Sugestões na lista; você pode digitar outro ID." : "Digite o ID exato do modelo no provedor."}>
            <Input id="model" name="model" defaultValue={version.model} list="model-suggestions" required />
            <datalist id="model-suggestions">{suggestions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</datalist>
          </Field>
          <Field label="Idioma" htmlFor="language"><Input id="language" name="language" defaultValue={version.language} /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Comportamento</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Prompt de sistema" htmlFor="systemPrompt" hint="Quem o agente é, o que faz e como deve agir. As regras de segurança da plataforma são adicionadas automaticamente.">
            <Textarea id="systemPrompt" name="systemPrompt" defaultValue={version.systemPrompt} rows={8} className="font-mono text-[13px]" />
          </Field>
          <Field label="Instruções complementares" htmlFor="instructions" hint="Procedimentos, passo a passo, formatos de resposta, exemplos.">
            <Textarea id="instructions" name="instructions" defaultValue={version.instructions} rows={6} className="font-mono text-[13px]" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Personalidade e tom" htmlFor="personality"><Textarea id="personality" name="personality" defaultValue={version.personality} rows={3} /></Field>
            <Field label="Limites de atuação" htmlFor="boundaries" hint="O que o agente NUNCA deve fazer."><Textarea id="boundaries" name="boundaries" defaultValue={version.boundaries} rows={3} /></Field>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Parâmetros de geração e limites de execução</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Máx. tokens por resposta" htmlFor="maxTokens"><Input id="maxTokens" name="maxTokens" type="number" defaultValue={version.params.maxTokens ?? 16000} min={256} max={128000} /></Field>
          <Field label="Esforço de raciocínio" htmlFor="effort" hint="Modelos Claude atuais: controla a profundidade do raciocínio.">
            <NativeSelect id="effort" name="effort" defaultValue={version.params.effort ?? "medium"}>
              <option value="low">Baixo (rápido e econômico)</option>
              <option value="medium">Médio</option>
              <option value="high">Alto</option>
              <option value="xhigh">Muito alto</option>
              <option value="max">Máximo</option>
            </NativeSelect>
          </Field>
          <Field label="Temperatura (opcional)" htmlFor="temperature" hint="Ignorada nos modelos que não aceitam (ex.: Claude atuais).">
            <Input id="temperature" name="temperature" type="number" step="0.1" min={0} max={2} defaultValue={version.params.temperature ?? ""} />
          </Field>
          <Field label="Máx. passos por execução" htmlFor="maxSteps"><Input id="maxSteps" name="maxSteps" type="number" defaultValue={version.limits.maxSteps} min={1} max={50} /></Field>
          <Field label="Tempo limite (segundos)" htmlFor="timeoutSeconds"><Input id="timeoutSeconds" name="timeoutSeconds" type="number" defaultValue={version.limits.timeoutSeconds} min={10} max={3600} /></Field>
          <Field label="Máx. tokens por execução" htmlFor="maxTokensPerRun"><Input id="maxTokensPerRun" name="maxTokensPerRun" type="number" defaultValue={version.limits.maxTokensPerRun} min={1000} /></Field>
        </CardContent>
      </Card>
      <div><SubmitButton>Salvar no rascunho</SubmitButton></div>
    </form>
  );
}

type CatalogItem = { key: string; name: string; description: string; category: string; risk: string; integration: string | null; defaultApproval: string; available: boolean; reason: string | null };

export function ToolsForm({ agentId, catalog, selected }: { agentId: string; catalog: CatalogItem[]; selected: { key: string; requiresApproval: boolean | null }[] }) {
  const [state, action] = useActionState(updateToolsAction, undefined);
  const ref = useFormFeedback(state, { reset: false });
  const categories = [...new Set(catalog.map((c) => c.category))];
  const sel = new Map(selected.map((s) => [s.key, s.requiresApproval]));
  return (
    <form ref={ref} action={action} className="grid gap-4">
      <input type="hidden" name="agentId" value={agentId} />
      <FormError state={state} />
      <p className="text-sm text-ink-muted">
        Cada ferramenta tem validação de parâmetros, controle de permissão e registro em log. Ferramentas de <strong>risco alto</strong> sempre pedem aprovação humana. Ferramentas pendentes ficam visíveis, mas o agente recebe a mensagem de pendência ao tentar usá-las.
      </p>
      {categories.map((cat) => (
        <Card key={cat}>
          <CardHeader><CardTitle className="capitalize">{cat}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 p-0">
            <ul className="divide-y divide-line">
              {catalog.filter((c) => c.category === cat).map((t) => (
                <li key={t.key} className="flex flex-col gap-3 px-5 py-3 md:flex-row md:items-center">
                  <label className="flex flex-1 items-start gap-3">
                    <Checkbox name="tools" value={t.key} defaultChecked={sel.has(t.key)} className="mt-0.5" />
                    <span>
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {t.name}
                        <code className="text-[11px] text-ink-subtle">{t.key}</code>
                        <Badge variant={t.risk === "high" ? "danger" : t.risk === "medium" ? "warning" : "default"}>Risco {t.risk === "high" ? "alto" : t.risk === "medium" ? "médio" : "baixo"}</Badge>
                        {!t.available && <Badge variant="warning">Pendente</Badge>}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-muted">{t.description}</span>
                      {!t.available && t.reason && <span className="mt-0.5 block text-xs text-warning">{t.reason}</span>}
                    </span>
                  </label>
                  <NativeSelect name={`approval:${t.key}`} defaultValue={sel.get(t.key) === true ? "always" : sel.get(t.key) === false ? "never" : "default"} wrapperClassName="md:w-56" className="h-9 text-sm" aria-label={`Aprovação para ${t.name}`} disabled={t.risk === "high"}>
                    <option value="default">Aprovação: padrão ({t.defaultApproval})</option>
                    <option value="always">Sempre pedir aprovação</option>
                    <option value="never">Nunca pedir aprovação</option>
                  </NativeSelect>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
      <div><SubmitButton>Salvar ferramentas</SubmitButton></div>
    </form>
  );
}

export function KnowledgeForm({ agentId, orgSlug, kbs, selected }: { agentId: string; orgSlug: string; kbs: { id: string; name: string; description: string | null }[]; selected: string[] }) {
  const [state, action] = useActionState(updateKnowledgeAction, undefined);
  const ref = useFormFeedback(state, { reset: false });
  return (
    <form ref={ref} action={action}>
      <input type="hidden" name="agentId" value={agentId} />
      <Card>
        <CardHeader>
          <CardTitle>Bases de conhecimento autorizadas</CardTitle>
          <CardDescription>
            O agente só consulta as bases marcadas, sempre da mesma empresa. Para usar, mantenha a ferramenta &quot;Consultar base de conhecimento&quot; ativa.{" "}
            <Link href={`/app/${orgSlug}/conhecimento`} className="text-electric hover:underline">Gerenciar documentos</Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <FormError state={state} />
          {kbs.length === 0 ? (
            <p className="text-sm text-ink-muted">A empresa ainda não tem bases de conhecimento.</p>
          ) : (
            kbs.map((k) => (
              <label key={k.id} className="flex items-start gap-3">
                <Checkbox name="kb" value={k.id} defaultChecked={selected.includes(k.id)} className="mt-0.5" />
                <span>
                  <span className="font-medium">{k.name}</span>
                  {k.description && <span className="block text-xs text-ink-muted">{k.description}</span>}
                </span>
              </label>
            ))
          )}
          <div><SubmitButton>Salvar</SubmitButton></div>
        </CardContent>
      </Card>
    </form>
  );
}

export function AccessForm({ agentId, roles, selected }: { agentId: string; roles: { id: string; name: string }[]; selected: string[] }) {
  const [state, action] = useActionState(updateAccessAction, undefined);
  const ref = useFormFeedback(state, { reset: false });
  return (
    <form ref={ref} action={action}>
      <input type="hidden" name="agentId" value={agentId} />
      <Card>
        <CardHeader>
          <CardTitle>Permissões de acesso</CardTitle>
          <CardDescription>Sem nenhum papel marcado, todos os usuários com permissão de usar agentes têm acesso. Marcando papéis, só eles (e quem pode ver todos os agentes) terão acesso.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <FormError state={state} />
          {roles.map((r) => (
            <label key={r.id} className="flex items-center gap-3">
              <Checkbox name="role" value={r.id} defaultChecked={selected.includes(r.id)} /> {r.name}
            </label>
          ))}
          <div><SubmitButton>Salvar acesso</SubmitButton></div>
        </CardContent>
      </Card>
    </form>
  );
}

export function TestArea({ agentId, agentName, initialMessages, conversationId, disabledReason }: { agentId: string; agentName: string; initialMessages: ChatMessage[]; conversationId?: string; disabledReason?: string }) {
  const [key, setKey] = useState(0);
  return (
    <div className="grid gap-3">
      <ChatPanel
        key={key}
        agentName={agentName}
        initialMessages={key === 0 ? initialMessages : []}
        initialConversationId={key === 0 ? conversationId : undefined}
        send={(i) => sendTestMessageAction({ agentId, ...i })}
        disabledReason={disabledReason}
        approvalsHref="/admin/execucoes?status=waiting_approval"
      />
      <div className="flex gap-2">
        <ConfirmButton
          title="Começar nova conversa de teste?"
          description="As conversas de teste deste agente serão apagadas."
          onConfirm={async () => {
            const r = await deleteTestConversationsAction(agentId);
            setKey((k) => k + 1);
            return r;
          }}
        >
          Nova conversa de teste
        </ConfirmButton>
        <Link href={`/admin/execucoes?agent=${agentId}&tests=1`} className="inline-flex items-center gap-1.5 text-sm text-electric hover:underline">
          <ShieldAlertIcon className="size-4" /> Ver execuções e erros
        </Link>
      </div>
    </div>
  );
}

export function VersionsList({ agentId, versions, publishedId, draftId }: { agentId: string; versions: { id: string; version: number; model: string; locked: boolean; notes: string | null; createdAt: string }[]; publishedId: string | null; draftId: string | null }) {
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y divide-line">
          {versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="font-mono font-semibold">v{v.version}</span>
              {v.id === publishedId && <Badge variant="success">Publicada</Badge>}
              {v.id === draftId && <Badge variant="electric">Rascunho</Badge>}
              {v.locked && v.id !== publishedId && <Badge>Travada</Badge>}
              <span className="text-xs text-ink-muted">{v.model} · {when(v.createdAt)}</span>
              <span className="flex-1 truncate text-xs text-ink-subtle">{v.notes}</span>
              {v.locked && v.id !== publishedId && (
                <ConfirmButton title={`Publicar novamente a versão ${v.version}?`} description="Ela volta a ser a versão usada pelo cliente (o rascunho não muda)." confirmLabel="Publicar esta versão" onConfirm={() => publishVersionAction(agentId, v.id)}>
                  Restaurar
                </ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
