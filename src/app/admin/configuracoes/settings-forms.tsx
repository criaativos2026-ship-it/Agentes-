"use client";

import { useActionState } from "react";
import { removeProviderKeyAction, saveProviderKeyAction } from "@/app/actions/settings";
import { FormError, useFormFeedback } from "@/components/form";
import { ConfirmButton } from "@/components/confirm-button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function ProviderKeyForm({ provider, needsBaseUrl, defaultModel }: { provider: string; needsBaseUrl: boolean; defaultModel: string }) {
  const [state, action] = useActionState(saveProviderKeyAction, undefined);
  const ref = useFormFeedback(state);
  return (
    <form ref={ref} action={action} className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
      <input type="hidden" name="provider" value={provider} />
      <div className="sm:col-span-3"><FormError state={state} /></div>
      <Input name="apiKey" type="password" autoComplete="off" placeholder="Nova chave de API" aria-label={`Chave ${provider}`} required />
      <Input name="testModel" defaultValue={defaultModel} placeholder="Modelo para teste" aria-label="Modelo para teste" required />
      <SubmitButton variant="outline" pendingText="Testando…">Salvar e testar</SubmitButton>
      {needsBaseUrl && <Input name="baseUrl" placeholder="URL base (https://…/v1)" className="sm:col-span-3" aria-label="URL base" required />}
    </form>
  );
}

export function RemoveKey({ provider }: { provider: string }) {
  return (
    <ConfirmButton variant="destructive" title="Remover esta chave?" description="Agentes que dependem deste provedor (sem chave própria da empresa) deixarão de responder." confirmLabel="Remover" onConfirm={() => removeProviderKeyAction(provider)}>
      Remover
    </ConfirmButton>
  );
}
