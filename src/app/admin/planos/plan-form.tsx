"use client";

import { useActionState, useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { savePlanAction } from "@/app/actions/billing";
import { Field, FormError, useFormFeedback } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

type Plan = { id: string; key: string; name: string; description: string | null; type: string; priceCents: number; intervalMonths: number; limits: Record<string, number | null>; features: string[]; isActive: boolean; isPublic: boolean; validUntil: string };

export function PlanForm({ plan }: { plan?: Plan }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(savePlanAction, undefined);
  useFormFeedback(state, { onSuccess: () => setOpen(false) });
  const l = (k: string) => (plan?.limits[k] ?? "") as string | number;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {plan ? <Button variant="outline" size="sm"><PencilIcon /> Editar</Button> : <Button><PlusIcon /> Novo plano</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogTitle>{plan ? `Editar "${plan.name}"` : "Novo plano"}</DialogTitle>
        <DialogDescription>Limites em branco = ilimitado.</DialogDescription>
        <form action={action} className="grid gap-3 sm:grid-cols-2">
          {plan && <input type="hidden" name="id" value={plan.id} />}
          <div className="sm:col-span-2"><FormError state={state} /></div>
          <Field label="Nome" htmlFor="p-name"><Input id="p-name" name="name" defaultValue={plan?.name} required /></Field>
          <Field label="Código" htmlFor="p-key"><Input id="p-key" name="key" defaultValue={plan?.key} required /></Field>
          <Field label="Tipo" htmlFor="p-type">
            <NativeSelect id="p-type" name="type" defaultValue={plan?.type ?? "monthly"}>
              <option value="monthly">Mensal</option><option value="annual">Anual</option><option value="custom">Personalizado</option><option value="enterprise">Contrato empresarial</option>
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preço (R$)" htmlFor="p-price"><Input id="p-price" name="price" inputMode="decimal" defaultValue={plan ? (plan.priceCents / 100).toFixed(2).replace(".", ",") : ""} required /></Field>
            <Field label="Ciclo (meses)" htmlFor="p-int"><Input id="p-int" name="intervalMonths" type="number" min={1} defaultValue={plan?.intervalMonths ?? 1} /></Field>
          </div>
          <Field label="Agentes publicados" htmlFor="p-agents"><Input id="p-agents" name="agents" type="number" min={0} defaultValue={l("agents")} /></Field>
          <Field label="Usuários" htmlFor="p-users"><Input id="p-users" name="users" type="number" min={0} defaultValue={l("users")} /></Field>
          <Field label="Execuções por mês" htmlFor="p-exec"><Input id="p-exec" name="executionsPerMonth" type="number" min={0} defaultValue={l("executionsPerMonth")} /></Field>
          <Field label="Tokens de IA por mês" htmlFor="p-tok"><Input id="p-tok" name="tokensPerMonth" type="number" min={0} defaultValue={l("tokensPerMonth")} /></Field>
          <Field label="Armazenamento (MB)" htmlFor="p-st"><Input id="p-st" name="storageMb" type="number" min={0} defaultValue={l("storageMb")} /></Field>
          <Field label="Válido até (opcional)" htmlFor="p-valid"><Input id="p-valid" name="validUntil" type="date" defaultValue={plan?.validUntil} /></Field>
          <Field label="Descrição" htmlFor="p-desc" className="grid gap-2 sm:col-span-2"><Input id="p-desc" name="description" defaultValue={plan?.description ?? ""} /></Field>
          <Field label="Recursos (um por linha)" htmlFor="p-feat" className="grid gap-2 sm:col-span-2"><Textarea id="p-feat" name="features" defaultValue={plan?.features.join("\n")} /></Field>
          <label className="flex items-center gap-2 text-sm"><Checkbox name="isActive" defaultChecked={plan?.isActive ?? true} /> Ativo</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox name="isPublic" defaultChecked={plan?.isPublic ?? true} /> Público (catálogo)</label>
          <div className="sm:col-span-2"><SubmitButton>Salvar plano</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
