"use client";

import { useActionState } from "react";
import { changeEmailAction, changePasswordAction, requestDeletionAction, revokeOtherSessionsAction, revokeSessionAction, updateProfileAction } from "@/app/actions/account";
import { Field, FormError, useFormFeedback } from "@/components/form";
import { ConfirmButton } from "@/components/confirm-button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function ProfileForm({ name }: { name: string }) {
  const [state, action] = useActionState(updateProfileAction, undefined);
  const ref = useFormFeedback(state, { reset: false });
  return (
    <form ref={ref} action={action} className="grid gap-3">
      <FormError state={state} />
      <Field label="Nome" htmlFor="p-name"><Input id="p-name" name="name" defaultValue={name} required /></Field>
      <div><SubmitButton variant="outline">Salvar nome</SubmitButton></div>
    </form>
  );
}

export function ChangeEmailForm({ email }: { email: string }) {
  const [state, action] = useActionState(changeEmailAction, undefined);
  const ref = useFormFeedback(state);
  return (
    <form ref={ref} action={action} className="grid gap-3">
      <FormError state={state} />
      <Field label="Novo e-mail" htmlFor="e-email"><Input id="e-email" name="email" type="email" placeholder={email} required /></Field>
      <Field label="Senha atual" htmlFor="e-current"><Input id="e-current" name="current" type="password" autoComplete="current-password" required /></Field>
      <div><SubmitButton variant="outline">Alterar e-mail</SubmitButton></div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, undefined);
  const ref = useFormFeedback(state);
  return (
    <form ref={ref} action={action} className="grid gap-3 md:grid-cols-3">
      <div className="md:col-span-3"><FormError state={state} /></div>
      <Field label="Senha atual" htmlFor="c-current"><Input id="c-current" name="current" type="password" autoComplete="current-password" required /></Field>
      <Field label="Nova senha" htmlFor="c-new" hint="Mínimo de 10 caracteres."><Input id="c-new" name="password" type="password" autoComplete="new-password" required minLength={10} /></Field>
      <Field label="Confirme" htmlFor="c-confirm"><Input id="c-confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
      <div><SubmitButton>Trocar senha</SubmitButton></div>
    </form>
  );
}

export function SessionActions({ sessionId }: { sessionId: string }) {
  return (
    <ConfirmButton variant="destructive" title="Encerrar esta sessão?" description="O dispositivo precisará entrar novamente." confirmLabel="Encerrar" onConfirm={() => revokeSessionAction(sessionId)}>
      Encerrar
    </ConfirmButton>
  );
}

export function RevokeOthers() {
  return (
    <ConfirmButton title="Encerrar todas as outras sessões?" confirmLabel="Encerrar outras" onConfirm={() => revokeOtherSessionsAction()}>
      Encerrar outras
    </ConfirmButton>
  );
}

export function DeletionRequest({ requested }: { requested: boolean }) {
  return requested ? (
    <ConfirmButton title="Cancelar o pedido de exclusão?" confirmLabel="Cancelar pedido" onConfirm={() => requestDeletionAction(true)}>
      Cancelar pedido de exclusão
    </ConfirmButton>
  ) : (
    <ConfirmButton
      variant="destructive"
      size="default"
      title="Pedir a exclusão dos seus dados?"
      description="A equipe da plataforma vai remover seu nome, e-mail e senha. Depois disso você não conseguirá mais entrar. Registros operacionais das empresas continuam, sem identificar você."
      confirmLabel="Pedir exclusão"
      onConfirm={() => requestDeletionAction(false)}
    >
      Pedir exclusão dos meus dados
    </ConfirmButton>
  );
}
