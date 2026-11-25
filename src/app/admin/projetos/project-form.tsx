"use client";

import { useActionState } from "react";
import { saveProjectAction } from "@/app/actions/projects";
import { Field, FormError, useFormFeedback } from "@/components/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

type Project = {
  id: string;
  organizationId: string;
  name: string;
  segment: string | null;
  businessDescription: string | null;
  objectives: string | null;
  needs: string | null;
  processes: { name: string; description: string; automate: boolean }[];
  plannedAgents: string[];
  requiredIntegrations: string[];
  ownerUserId: string | null;
  goLiveDate: string | null;
};

export function ProjectForm({ project, orgs, staff, integrations }: { project?: Project; orgs: { id: string; name: string }[]; staff: { id: string; name: string }[]; integrations: { key: string; name: string }[] }) {
  const [state, action] = useActionState(saveProjectAction, undefined);
  const ref = useFormFeedback(state, { reset: false });
  const processes = project?.processes.map((p) => `${p.automate ? "* " : ""}${p.name}${p.description ? `: ${p.description}` : ""}`).join("\n");
  return (
    <form ref={ref} action={action} className="grid gap-4">
      {project && <input type="hidden" name="id" value={project.id} />}
      <FormError state={state} />
      <Card>
        <CardHeader><CardTitle>Empresa e negócio</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Empresa" htmlFor="pj-org">
            <NativeSelect id="pj-org" name="organizationId" defaultValue={project?.organizationId} disabled={!!project}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </NativeSelect>
          </Field>
          {project && <input type="hidden" name="organizationId" value={project.organizationId} />}
          <Field label="Nome do projeto" htmlFor="pj-name"><Input id="pj-name" name="name" defaultValue={project?.name} required /></Field>
          <Field label="Segmento" htmlFor="pj-seg"><Input id="pj-seg" name="segment" defaultValue={project?.segment ?? ""} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Responsável" htmlFor="pj-owner">
              <NativeSelect id="pj-owner" name="ownerUserId" defaultValue={project?.ownerUserId ?? ""}>
                <option value="">—</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Implantação prevista" htmlFor="pj-date"><Input id="pj-date" name="goLiveDate" type="date" defaultValue={project?.goLiveDate ?? ""} /></Field>
          </div>
          <Field label="Descrição do negócio" htmlFor="pj-desc" className="grid gap-2 sm:col-span-2"><Textarea id="pj-desc" name="businessDescription" defaultValue={project?.businessDescription ?? ""} /></Field>
          <Field label="Objetivos" htmlFor="pj-obj"><Textarea id="pj-obj" name="objectives" defaultValue={project?.objectives ?? ""} /></Field>
          <Field label="Necessidades identificadas" htmlFor="pj-needs"><Textarea id="pj-needs" name="needs" defaultValue={project?.needs ?? ""} /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Automação</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Processos (um por linha)" htmlFor="pj-proc" hint='Formato "Nome: descrição". Comece com "*" os que serão automatizados.'>
            <Textarea id="pj-proc" name="processes" rows={6} defaultValue={processes} className="font-mono text-[13px]" />
          </Field>
          <Field label="Agentes necessários (um por linha)" htmlFor="pj-agents"><Textarea id="pj-agents" name="plannedAgents" rows={6} defaultValue={project?.plannedAgents.join("\n")} /></Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-[13px] font-medium text-ink-muted">Integrações necessárias</legend>
            <div className="flex flex-wrap gap-4">
              {integrations.map((i) => (
                <label key={i.key} className="flex items-center gap-2 text-sm"><Checkbox name="requiredIntegrations[]" value={i.key} defaultChecked={project?.requiredIntegrations.includes(i.key)} /> {i.name}</label>
              ))}
            </div>
          </fieldset>
        </CardContent>
      </Card>
      <div><SubmitButton>{project ? "Salvar levantamento" : "Criar projeto"}</SubmitButton></div>
    </form>
  );
}
