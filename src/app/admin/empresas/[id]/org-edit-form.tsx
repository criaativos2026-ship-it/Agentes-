"use client";

import { useActionState } from "react";
import { updateOrganizationAction } from "@/app/actions/admin-orgs";
import { Field, FormError, useFormFeedback } from "@/components/form";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";

type Org = {
  id: string;
  name: string;
  segment: string | null;
  description: string | null;
  document: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  timezone: string;
  httpAllowlist: string;
};

export function OrgEditForm({ org }: { org: Org }) {
  const [state, action] = useActionState(updateOrganizationAction, undefined);
  const ref = useFormFeedback(state, { reset: false });
  return (
    <form ref={ref} action={action}>
      <input type="hidden" name="id" value={org.id} />
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><FormError state={state} /></div>
          <Field label="Nome" htmlFor="name"><Input id="name" name="name" defaultValue={org.name} required /></Field>
          <Field label="Segmento" htmlFor="segment"><Input id="segment" name="segment" defaultValue={org.segment ?? ""} /></Field>
          <Field label="CNPJ" htmlFor="document"><Input id="document" name="document" defaultValue={org.document ?? ""} /></Field>
          <Field label="Fuso horário" htmlFor="timezone" hint="Usado em relatórios e limites mensais.">
            <Input id="timezone" name="timezone" defaultValue={org.timezone} />
          </Field>
          <Field label="E-mail de contato" htmlFor="contactEmail"><Input id="contactEmail" name="contactEmail" type="email" defaultValue={org.contactEmail ?? ""} /></Field>
          <Field label="Telefone de contato" htmlFor="contactPhone"><Input id="contactPhone" name="contactPhone" defaultValue={org.contactPhone ?? ""} /></Field>
          <Field label="Descrição do negócio" htmlFor="description" className="grid gap-2 sm:col-span-2">
            <Textarea id="description" name="description" defaultValue={org.description ?? ""} />
          </Field>
          <Field
            label="Domínios liberados para a ferramenta de API/HTTP"
            htmlFor="httpAllowlist"
            className="grid gap-2 sm:col-span-2"
            hint="Um por linha (ex.: api.minhaempresa.com.br ou *.minhaempresa.com.br). Sem domínios, os agentes desta empresa não podem chamar APIs externas."
          >
            <Textarea id="httpAllowlist" name="httpAllowlist" defaultValue={org.httpAllowlist} className="font-mono text-sm" />
          </Field>
          <div className="sm:col-span-2"><SubmitButton>Salvar alterações</SubmitButton></div>
        </CardContent>
      </Card>
    </form>
  );
}
