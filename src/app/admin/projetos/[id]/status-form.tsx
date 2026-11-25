"use client";

import { useActionState } from "react";
import { changeProjectStatusAction } from "@/app/actions/projects";
import { FormError, useFormFeedback } from "@/components/form";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n";

const STATUSES = ["new", "discovery", "development", "configuration", "testing", "awaiting_approval", "active", "maintenance", "suspended"];

export function StatusForm({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState(changeProjectStatusAction, undefined);
  const ref = useFormFeedback(state);
  return (
    <form ref={ref} action={action} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <FormError state={state} />
      <NativeSelect name="status" defaultValue={status} aria-label="Status do projeto">
        {STATUSES.map((s) => <option key={s} value={s}>{t(`project.status.${s}`)}</option>)}
      </NativeSelect>
      <Textarea name="note" placeholder="Anotação (opcional)" rows={3} aria-label="Anotação" />
      <div><SubmitButton>Registrar</SubmitButton></div>
    </form>
  );
}
