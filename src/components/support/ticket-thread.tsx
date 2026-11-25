"use client";

import { useActionState } from "react";
import { replyTicketAction } from "@/app/actions/support";
import { FormError, useFormFeedback } from "@/components/form";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Msg = { id: string; body: string; author: string | null; isInternal: boolean; isStaff: boolean; when: string };

export function TicketThread({ ticketId, slug, messages, staffView, status }: { ticketId: string; slug?: string; messages: Msg[]; staffView: boolean; status: string }) {
  const [state, action] = useActionState(replyTicketAction, undefined);
  const ref = useFormFeedback(state);
  return (
    <div className="grid gap-3">
      <ul className="grid gap-2">
        {messages.map((m) => (
          <li key={m.id} className={cn("rounded-lg border p-3 text-sm", m.isInternal ? "border-warning/40 bg-warning/5" : m.isStaff ? "border-electric/30 bg-electric/5" : "border-line bg-bg-alt")}>
            <p className="mb-1 text-xs text-ink-subtle">{m.author ?? "—"}{m.isStaff ? " · Equipe NEXUS" : ""}{m.isInternal ? " · NOTA INTERNA" : ""} · {m.when}</p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ul>
      {status !== "closed" && (
        <form ref={ref} action={action} className="grid gap-2">
          <input type="hidden" name="ticketId" value={ticketId} />
          {slug && <input type="hidden" name="slug" value={slug} />}
          <FormError state={state} />
          <Textarea name="body" rows={3} placeholder="Escreva sua resposta" aria-label="Resposta" required />
          <div className="flex flex-wrap items-center gap-3">
            {staffView && (
              <>
                <label className="flex items-center gap-2 text-xs text-ink-muted"><Checkbox name="internal" /> Nota interna (cliente não vê)</label>
                <NativeSelect name="status" defaultValue="" wrapperClassName="w-52" className="h-9 text-sm" aria-label="Novo status">
                  <option value="">Status automático</option>
                  <option value="in_progress">Em atendimento</option>
                  <option value="waiting_customer">Aguardando cliente</option>
                  <option value="resolved">Resolvido</option>
                  <option value="closed">Fechado</option>
                </NativeSelect>
              </>
            )}
            <SubmitButton size="sm">Enviar</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
