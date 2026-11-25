"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "lucide-react";
import { saveWorkflowAction } from "@/app/actions/workflows";
import { Field, FormError, useFormFeedback } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

type Node = { id: string; type: "agent" | "condition" | "approval" | "end"; label?: string; agentId?: string; prompt?: string; source?: string; operator?: string; value?: string; summary?: string; next?: string; else?: string };
type WF = { id?: string; name: string; description: string | null; triggerType: string; triggerConfig: { everyMinutes?: number; input?: string }; definition: { nodes: Node[] } };

const TYPE_LABEL = { agent: "Acionar agente", condition: "Condição", approval: "Aprovação humana", end: "Fim" } as const;

/**
 * Editor de etapas (lista ordenada com desvios). Gera a mesma definição em grafo que um
 * construtor visual usaria — "próxima" e "se falso" apontam para outras etapas.
 */
export function WorkflowEditor({ slug, workflow, agents }: { slug: string; workflow?: WF; agents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [state, action] = useActionState(saveWorkflowAction, undefined);
  useFormFeedback(state, { reset: false, onSuccess: () => !workflow && state?.id && router.push(`/app/${slug}/automacoes/${state.id}`) });
  const [trigger, setTrigger] = useState(workflow?.triggerType ?? "manual");
  const [nodes, setNodes] = useState<Node[]>(workflow?.definition.nodes ?? [{ id: "etapa1", type: "agent", agentId: agents[0]?.id ?? "", prompt: "{{input}}" }]);
  const update = (i: number, patch: Partial<Node>) => setNodes((ns) => ns.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  const add = (type: Node["type"]) => {
    let n = nodes.length + 1;
    while (nodes.some((x) => x.id === `etapa${n}`)) n++;
    const id = `etapa${n}`;
    setNodes((ns) => [...ns, type === "agent" ? { id, type, agentId: agents[0]?.id ?? "", prompt: "{{last}}" } : type === "condition" ? { id, type, source: "last", operator: "contains", value: "" } : type === "approval" ? { id, type, summary: "Aprovar: {{last}}" } : { id, type }]);
  };
  const move = (i: number, d: -1 | 1) => setNodes((ns) => { const c = [...ns]; const j = i + d; if (j < 0 || j >= c.length) return c; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const clean = nodes.map(({ id, type, label, agentId, prompt, source, operator, value, summary, next, else: els }) => {
    const base = { id, type, ...(label ? { label } : {}) };
    if (type === "agent") return { ...base, agentId, prompt, ...(next ? { next } : {}) };
    if (type === "condition") return { ...base, source, operator, value: value ?? "", ...(next ? { next } : {}), ...(els ? { else: els } : {}) };
    if (type === "approval") return { ...base, summary, ...(next ? { next } : {}) };
    return base;
  });
  const targets = (self: string) => nodes.filter((n) => n.id !== self);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="slug" value={slug} />
      {workflow?.id && <input type="hidden" name="id" value={workflow.id} />}
      <input type="hidden" name="definition" value={JSON.stringify({ nodes: clean })} />
      <FormError state={state} />
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" htmlFor="wf-name"><Input id="wf-name" name="name" defaultValue={workflow?.name} required /></Field>
          <Field label="Gatilho" htmlFor="wf-trigger">
            <NativeSelect id="wf-trigger" name="triggerType" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
              <option value="manual">Manual (botão)</option>
              <option value="webhook">Webhook (sistema externo, ex.: novo lead)</option>
              <option value="schedule">Agenda (a cada N minutos)</option>
            </NativeSelect>
          </Field>
          {trigger === "schedule" && (
            <>
              <Field label="Intervalo (minutos)" htmlFor="wf-every"><Input id="wf-every" name="everyMinutes" type="number" min={5} defaultValue={workflow?.triggerConfig.everyMinutes ?? 1440} /></Field>
              <Field label="Entrada fixa ({{input}})" htmlFor="wf-sin"><Input id="wf-sin" name="scheduleInput" defaultValue={workflow?.triggerConfig.input ?? ""} /></Field>
            </>
          )}
          <Field label="Descrição" htmlFor="wf-desc" className="grid gap-2 sm:col-span-2"><Input id="wf-desc" name="description" defaultValue={workflow?.description ?? ""} /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Etapas</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-ink-muted">Variáveis: <code>{"{{input}}"}</code> (entrada do gatilho), <code>{"{{last}}"}</code> (último resultado), <code>{"{{node.ID}}"}</code> (resultado de uma etapa). Sem &quot;próxima&quot;, segue a ordem da lista.</p>
          {nodes.map((n, i) => (
            <div key={n.id} className="grid gap-3 rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs">{i + 1}. {n.id}</span>
                <span className="text-sm font-medium">{TYPE_LABEL[n.type]}</span>
                <span className="ml-auto flex gap-1">
                  <Button type="button" size="icon" variant="ghost" aria-label="Subir" onClick={() => move(i, -1)}><ArrowUpIcon /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Descer" onClick={() => move(i, 1)}><ArrowDownIcon /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Remover etapa" disabled={nodes.length === 1} onClick={() => setNodes((ns) => ns.filter((_, j) => j !== i))}><TrashIcon /></Button>
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input value={n.label ?? ""} onChange={(e) => update(i, { label: e.target.value })} placeholder="Nome da etapa (opcional)" aria-label="Nome da etapa" />
                {n.type === "agent" && (
                  <NativeSelect value={n.agentId} onChange={(e) => update(i, { agentId: e.target.value })} aria-label="Agente">
                    {agents.length === 0 && <option value="">Nenhum agente publicado</option>}
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </NativeSelect>
                )}
                {n.type === "condition" && (
                  <div className="grid grid-cols-[1fr_1fr] gap-2">
                    <Input value={n.source ?? "last"} onChange={(e) => update(i, { source: e.target.value })} aria-label="Origem" placeholder="last, input ou node.ID" />
                    <NativeSelect value={n.operator} onChange={(e) => update(i, { operator: e.target.value })} aria-label="Operador">
                      <option value="contains">contém</option><option value="not_contains">não contém</option><option value="equals">é igual a</option><option value="not_empty">não está vazio</option>
                    </NativeSelect>
                  </div>
                )}
              </div>
              {n.type === "agent" && <Textarea value={n.prompt ?? ""} onChange={(e) => update(i, { prompt: e.target.value })} rows={2} aria-label="Instrução para o agente" placeholder="O que o agente deve fazer" />}
              {n.type === "condition" && <Input value={n.value ?? ""} onChange={(e) => update(i, { value: e.target.value })} aria-label="Valor da condição" placeholder="Valor (ex.: QUENTE)" />}
              {n.type === "approval" && <Input value={n.summary ?? ""} onChange={(e) => update(i, { summary: e.target.value })} aria-label="Resumo para o aprovador" />}
              {n.type !== "end" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <NativeSelect value={n.next ?? ""} onChange={(e) => update(i, { next: e.target.value || undefined })} aria-label={n.type === "condition" ? "Se verdadeiro, ir para" : "Próxima etapa"}>
                    <option value="">{n.type === "condition" ? "Se verdadeiro: seguir a lista" : "Próxima: seguir a lista"}</option>
                    {targets(n.id).map((t) => <option key={t.id} value={t.id}>→ {t.label || t.id}</option>)}
                  </NativeSelect>
                  {n.type === "condition" && (
                    <NativeSelect value={n.else ?? ""} onChange={(e) => update(i, { else: e.target.value || undefined })} aria-label="Se falso, ir para">
                      <option value="">Se falso: encerrar</option>
                      {targets(n.id).map((t) => <option key={t.id} value={t.id}>→ {t.label || t.id}</option>)}
                    </NativeSelect>
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {(["agent", "condition", "approval", "end"] as const).map((t) => (
              <Button key={t} type="button" variant="outline" size="sm" onClick={() => add(t)}><PlusIcon /> {TYPE_LABEL[t]}</Button>
            ))}
          </div>
        </CardContent>
      </Card>
      <div><SubmitButton>Salvar automação</SubmitButton></div>
    </form>
  );
}
