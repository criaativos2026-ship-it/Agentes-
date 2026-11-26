"use client";

import { useActionState } from "react";
import { setupFirstAdmin } from "@/app/actions/auth";
import { Field, FormError } from "@/components/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/ui/submit-button";

export function SetupForm({ code }: { code: string }) {
  const [state, action] = useActionState(setupFirstAdmin, undefined);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="code" value={code} />
      <FormError state={state} />
      <Field label="Seu nome" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required defaultValue={state?.fields?.name} key={`n${state?.fields?.name}`} />
      </Field>
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required defaultValue={state?.fields?.email} key={`e${state?.fields?.email}`} />
      </Field>
      <Field label="Senha" htmlFor="password" hint="Mínimo de 10 caracteres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirme a senha" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <label className="flex items-start gap-3 text-sm text-ink-muted">
        <Checkbox name="privacy" className="mt-0.5" />
        <span>
          Li e concordo com o{" "}
          <a href="/privacidade" target="_blank" className="text-electric hover:underline">
            aviso de privacidade
          </a>
          .
        </span>
      </label>
      <SubmitButton className="mt-1 w-full" size="lg" pendingText="Criando…">
        Criar conta e entrar
      </SubmitButton>
    </form>
  );
}
