"use client";

import { useActionState } from "react";
import { createOrganizationAction } from "@/app/actions/admin-orgs";
import { Field, FormError } from "@/components/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/ui/submit-button";

export function NewOrgForm() {
  const [state, action] = useActionState(createOrganizationAction, undefined);
  return (
    <form action={action} className="grid max-w-3xl gap-5">
      <FormError state={state} />
      <Card>
        <CardHeader>
          <CardTitle>Dados da empresa</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome da empresa" htmlFor="name" className="grid gap-2 sm:col-span-2">
            <Input id="name" name="name" required defaultValue={state?.fields?.name} />
          </Field>
          <Field label="Segmento de atuação" htmlFor="segment" hint="Ex.: imobiliária, clínica, indústria.">
            <Input id="segment" name="segment" />
          </Field>
          <Field label="CNPJ (opcional)" htmlFor="document">
            <Input id="document" name="document" inputMode="numeric" />
          </Field>
          <Field label="E-mail de contato" htmlFor="contactEmail">
            <Input id="contactEmail" name="contactEmail" type="email" />
          </Field>
          <Field label="Telefone de contato" htmlFor="contactPhone">
            <Input id="contactPhone" name="contactPhone" type="tel" />
          </Field>
          <Field label="Descrição do negócio" htmlFor="description" className="grid gap-2 sm:col-span-2">
            <Textarea id="description" name="description" rows={3} />
          </Field>
          <Field label="Status inicial" htmlFor="status">
            <NativeSelect id="status" name="status" defaultValue="trial">
              <option value="trial">Em avaliação</option>
              <option value="active">Ativa</option>
            </NativeSelect>
          </Field>
          <label className="flex items-center gap-3 self-end pb-3 text-sm">
            <Checkbox name="isDemo" /> Empresa de demonstração (dados fictícios)
          </label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Primeiro administrador (opcional)</CardTitle>
          <CardDescription>Quem vai gerenciar a empresa. A pessoa troca a senha provisória no primeiro acesso.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Nome" htmlFor="adminName">
            <Input id="adminName" name="adminName" autoComplete="off" />
          </Field>
          <Field label="E-mail" htmlFor="adminEmail">
            <Input id="adminEmail" name="adminEmail" type="email" autoComplete="off" />
          </Field>
          <Field label="Senha provisória" htmlFor="adminPassword" hint="Mínimo de 10 caracteres.">
            <Input id="adminPassword" name="adminPassword" type="text" autoComplete="off" minLength={10} />
          </Field>
        </CardContent>
      </Card>
      <div>
        <SubmitButton size="lg" pendingText="Cadastrando…">Cadastrar empresa</SubmitButton>
      </div>
    </form>
  );
}
