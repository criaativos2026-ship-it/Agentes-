"use client";

import { useActionState } from "react";
import { openTicketAction } from "@/app/actions/support";
import { Field, FormError, useFormFeedback } from "@/components/form";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

export function NewTicketForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(openTicketAction, undefined);
  const ref = useFormFeedback(state);
  return (
    <Card>
      <CardContent>
        <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <input type="hidden" name="slug" value={slug} />
          <div className="sm:col-span-2"><FormError state={state} /></div>
          <Field label="Assunto" htmlFor="tk-subject"><Input id="tk-subject" name="subject" required /></Field>
          <Field label="Prioridade" htmlFor="tk-prio">
            <NativeSelect id="tk-prio" name="priority" defaultValue="normal"><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></NativeSelect>
          </Field>
          <Field label="Descreva o que precisa" htmlFor="tk-body" className="grid gap-2 sm:col-span-2"><Textarea id="tk-body" name="body" rows={4} required /></Field>
          <div><SubmitButton>Abrir chamado</SubmitButton></div>
        </form>
      </CardContent>
    </Card>
  );
}
