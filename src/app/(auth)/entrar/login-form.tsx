"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import { Field, FormError } from "@/components/form";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function LoginForm() {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormError state={state} />
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required defaultValue={state?.fields?.email} key={state?.fields?.email} />
      </Field>
      <Field label="Senha" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="mt-1 w-full" size="lg" pendingText="Entrando…">
        Entrar
      </SubmitButton>
      <Link href="/recuperar-senha" className="text-center text-sm text-electric hover:underline">
        Esqueci minha senha
      </Link>
    </form>
  );
}
