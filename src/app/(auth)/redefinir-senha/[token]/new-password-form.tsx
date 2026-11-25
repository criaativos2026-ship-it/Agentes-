"use client";

import { useActionState } from "react";
import { resetPassword } from "@/app/actions/auth";
import { Field, FormError } from "@/components/form";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function NewPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <FormError state={state} />
      <Field label="Nova senha" htmlFor="password" hint="Mínimo de 10 caracteres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirme a nova senha" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="w-full" size="lg">Salvar nova senha</SubmitButton>
    </form>
  );
}
