"use client";

import { useActionState } from "react";
import { connectIntegrationAction, disconnectIntegrationAction, retestIntegrationAction } from "@/app/actions/integrations";
import { Field, FormError, useFormFeedback } from "@/components/form";
import { ConfirmButton } from "@/components/confirm-button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";

type FieldDef = { key: string; label: string; secret: boolean; required: boolean; placeholder?: string; hint?: string };

export function ApiKeyForm({ slug, integrationKey, fields, config, hasSecrets, agentOptions }: { slug: string; integrationKey: string; fields: FieldDef[]; config: Record<string, string>; hasSecrets: boolean; agentOptions: { id: string; name: string }[] }) {
  const [state, action] = useActionState(connectIntegrationAction, undefined);
  const ref = useFormFeedback(state, { reset: false });
  return (
    <form ref={ref} action={action} className="grid gap-3 rounded-lg border border-line p-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="key" value={integrationKey} />
      <FormError state={state} />
      {fields.map((f) => {
        const id = `${integrationKey}-${f.key}`;
        if (f.key === "inbound_agent_id") {
          return (
            <Field key={f.key} label={f.label} htmlFor={id} hint={f.hint}>
              <NativeSelect id={id} name={f.key} defaultValue={config[f.key] ?? ""}>
                <option value="">Nenhum (só registrar)</option>
                {agentOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </NativeSelect>
            </Field>
          );
        }
        return (
          <Field key={f.key} label={`${f.label}${f.required ? "" : " (opcional)"}`} htmlFor={id} hint={f.secret && hasSecrets ? "Deixe em branco para manter o valor já salvo." : f.hint}>
            <Input id={id} name={f.key} type={f.secret ? "password" : "text"} autoComplete="off" defaultValue={f.secret ? "" : (config[f.key] ?? "")} placeholder={f.secret && hasSecrets ? "••••••••" : f.placeholder} />
          </Field>
        );
      })}
      <div><SubmitButton pendingText="Testando conexão…">{hasSecrets ? "Atualizar e testar" : "Conectar e testar"}</SubmitButton></div>
    </form>
  );
}

export function IntegrationButtons({ slug, integrationKey, name }: { slug: string; integrationKey: string; name: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmButton title={`Testar a conexão com ${name}?`} description="Faz uma chamada real ao serviço." confirmLabel="Testar agora" onConfirm={() => retestIntegrationAction(slug, integrationKey)}>
        Testar conexão
      </ConfirmButton>
      <ConfirmButton variant="destructive" title={`Desconectar ${name}?`} description="As credenciais são apagadas. As ferramentas dos agentes que dependem desta integração ficam pendentes." confirmLabel="Desconectar" onConfirm={() => disconnectIntegrationAction(slug, integrationKey)}>
        Desconectar
      </ConfirmButton>
    </div>
  );
}
