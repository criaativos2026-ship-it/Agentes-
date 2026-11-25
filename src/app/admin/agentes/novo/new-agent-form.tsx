"use client";

import { useActionState, useState } from "react";
import { createAgentAction } from "@/app/actions/agents";
import { Field, FormError } from "@/components/form";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

type Template = { key: string; name: string; description: string; category: string };

export function NewAgentForm({ orgs, templates, defaultOrg }: { orgs: { id: string; name: string }[]; templates: Template[]; defaultOrg?: string }) {
  const [state, action] = useActionState(createAgentAction, undefined);
  const [tpl, setTpl] = useState("");
  if (orgs.length === 0) return <p className="text-sm text-ink-muted">Cadastre uma empresa antes de criar agentes.</p>;
  return (
    <form action={action} className="grid max-w-4xl gap-5">
      <FormError state={state} />
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Empresa proprietária" htmlFor="organizationId">
            <NativeSelect id="organizationId" name="organizationId" defaultValue={defaultOrg ?? orgs[0].id} required>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Nome do agente" htmlFor="name">
            <Input id="name" name="name" required placeholder="Ex.: Agente de Prospecção Imobiliária" />
          </Field>
        </CardContent>
      </Card>
      <input type="hidden" name="templateKey" value={tpl} />
      <div>
        <p className="mb-2 text-sm font-medium text-ink-muted">Ponto de partida</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <button type="button" onClick={() => setTpl("")} className={cn("rounded-xl border p-4 text-left transition-colors", tpl === "" ? "border-brand bg-brand/5" : "border-line hover:border-line-strong")}>
            <p className="font-medium">Do zero</p>
            <p className="mt-1 text-xs text-ink-muted">Agente totalmente personalizado.</p>
          </button>
          {templates.map((t) => (
            <button key={t.key} type="button" onClick={() => setTpl(t.key)} className={cn("rounded-xl border p-4 text-left transition-colors", tpl === t.key ? "border-brand bg-brand/5" : "border-line hover:border-line-strong")}>
              <p className="font-medium">{t.name}</p>
              <p className="mt-1 text-xs text-ink-muted">{t.description}</p>
            </button>
          ))}
        </div>
      </div>
      <div><SubmitButton size="lg" pendingText="Criando…">Criar e abrir o construtor</SubmitButton></div>
    </form>
  );
}
