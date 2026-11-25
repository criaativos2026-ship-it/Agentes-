"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/actions/auth";
import { Field, FormError } from "@/components/form";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function ResetRequestForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  if (state?.ok) {
    return (
      <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-3 text-sm text-success">
        {state.ok}
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-4">
      <FormError state={state} />
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Enviando…">
        Enviar link
      </SubmitButton>
    </form>
  );
}
