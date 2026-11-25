"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { createTaskAction, setTaskStatusAction } from "@/app/actions/support";
import { Field, FormError, useFormFeedback } from "@/components/form";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";

export function NewTaskForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(createTaskAction, undefined);
  const ref = useFormFeedback(state);
  return (
    <Card>
      <CardContent>
        <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_170px_auto] sm:items-end">
          <input type="hidden" name="slug" value={slug} />
          <div className="sm:col-span-4"><FormError state={state} /></div>
          <Field label="Nova tarefa" htmlFor="tsk-title"><Input id="tsk-title" name="title" required /></Field>
          <Field label="Detalhes" htmlFor="tsk-desc"><Input id="tsk-desc" name="description" /></Field>
          <Field label="Prazo" htmlFor="tsk-due"><Input id="tsk-due" name="dueDate" type="date" /></Field>
          <SubmitButton>Criar</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function TaskStatusSelect({ slug, id, status }: { slug: string; id: string; status: string }) {
  const [pending, start] = useTransition();
  return (
    <NativeSelect
      aria-label="Status da tarefa"
      defaultValue={status}
      disabled={pending}
      wrapperClassName="w-40"
      className="h-9 text-sm"
      onChange={(e) => {
        const v = e.target.value as "open" | "in_progress" | "done" | "canceled";
        start(async () => {
          const r = await setTaskStatusAction(slug, id, v);
          if (r?.error) toast.error(r.error);
        });
      }}
    >
      <option value="open">Aberta</option><option value="in_progress">Em andamento</option><option value="done">Concluída</option><option value="canceled">Cancelada</option>
    </NativeSelect>
  );
}
