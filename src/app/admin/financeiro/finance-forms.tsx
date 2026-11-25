"use client";

import { useActionState } from "react";
import { cancelPaymentAction, cancelSubscriptionAction, createPaymentAction, createSubscriptionAction, markPaidAction, saveBillingSettingsAction } from "@/app/actions/billing";
import { Field, FormError, useFormFeedback } from "@/components/form";
import { ConfirmButton } from "@/components/confirm-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";

const today = () => new Date().toISOString().slice(0, 10);

export function NewSubscriptionForm({ orgs, plans }: { orgs: { id: string; name: string }[]; plans: { id: string; name: string; priceCents: number }[] }) {
  const [state, action] = useActionState(createSubscriptionAction, undefined);
  const ref = useFormFeedback(state);
  if (!plans.length) return <p className="text-sm text-ink-muted">Cadastre um plano ativo para criar assinaturas.</p>;
  return (
    <Card>
      <CardHeader><CardTitle>Nova assinatura</CardTitle></CardHeader>
      <CardContent>
        <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3"><FormError state={state} /></div>
          <Field label="Empresa" htmlFor="s-org"><NativeSelect id="s-org" name="organizationId">{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect></Field>
          <Field label="Plano" htmlFor="s-plan"><NativeSelect id="s-plan" name="planId">{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></Field>
          <Field label="Situação" htmlFor="s-status"><NativeSelect id="s-status" name="status" defaultValue="active"><option value="active">Ativa (gera a 1ª cobrança)</option><option value="trialing">Em avaliação</option></NativeSelect></Field>
          <Field label="Início" htmlFor="s-start"><Input id="s-start" name="startDate" type="date" defaultValue={today()} required /></Field>
          <Field label="Preço personalizado (R$, opcional)" htmlFor="s-price"><Input id="s-price" name="customPrice" inputMode="decimal" /></Field>
          <Field label="Observações" htmlFor="s-notes"><Input id="s-notes" name="notes" /></Field>
          <div><SubmitButton>Criar assinatura</SubmitButton></div>
        </form>
      </CardContent>
    </Card>
  );
}

export function NewPaymentForm({ orgs }: { orgs: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createPaymentAction, undefined);
  const ref = useFormFeedback(state);
  return (
    <Card>
      <CardHeader><CardTitle>Registrar cobrança avulsa</CardTitle></CardHeader>
      <CardContent>
        <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-4"><FormError state={state} /></div>
          <Field label="Empresa" htmlFor="pay-org"><NativeSelect id="pay-org" name="organizationId">{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect></Field>
          <Field label="Valor (R$)" htmlFor="pay-amount"><Input id="pay-amount" name="amount" inputMode="decimal" required /></Field>
          <Field label="Vencimento" htmlFor="pay-due"><Input id="pay-due" name="dueDate" type="date" defaultValue={today()} required /></Field>
          <Field label="Descrição" htmlFor="pay-desc"><Input id="pay-desc" name="description" required placeholder="Ex.: Implantação" /></Field>
          <div><SubmitButton>Registrar</SubmitButton></div>
        </form>
      </CardContent>
    </Card>
  );
}

export function PaymentActions({ id }: { id: string }) {
  return (
    <div className="flex justify-end gap-2">
      <ConfirmButton title="Confirmar recebimento via PIX?" description="Use só depois de conferir o valor na conta. A assinatura é reativada se estava inadimplente." confirmLabel="Confirmar pagamento" onConfirm={() => markPaidAction(id, "manual_pix")}>Baixar (PIX)</ConfirmButton>
      <ConfirmButton title="Confirmar recebimento via boleto?" confirmLabel="Confirmar pagamento" onConfirm={() => markPaidAction(id, "manual_boleto")}>Boleto</ConfirmButton>
      <ConfirmButton variant="destructive" title="Cancelar esta cobrança?" confirmLabel="Cancelar cobrança" onConfirm={() => cancelPaymentAction(id)}>Cancelar</ConfirmButton>
    </div>
  );
}

export function CancelSubscription({ id }: { id: string }) {
  return (
    <ConfirmButton variant="destructive" title="Cancelar a assinatura?" description="Cobranças pendentes são canceladas. Os limites do plano deixam de valer." confirmLabel="Cancelar assinatura" onConfirm={() => cancelSubscriptionAction(id)}>
      Cancelar
    </ConfirmButton>
  );
}

export function BillingSettingsForm({ settings }: { settings: { graceDays: number; suspendAfterDays: number; invoiceDaysBefore: number; liveGateways: boolean } }) {
  const [state, action] = useActionState(saveBillingSettingsAction, undefined);
  const ref = useFormFeedback(state, { reset: false });
  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-3">
      <div className="sm:col-span-3"><FormError state={state} /></div>
      <Field label="Carência até inadimplência (dias)" htmlFor="b-grace"><Input id="b-grace" name="graceDays" type="number" defaultValue={settings.graceDays} /></Field>
      <Field label="Suspender após (dias de atraso)" htmlFor="b-susp"><Input id="b-susp" name="suspendAfterDays" type="number" defaultValue={settings.suspendAfterDays} /></Field>
      <Field label="Gerar fatura (dias antes)" htmlFor="b-inv"><Input id="b-inv" name="invoiceDaysBefore" type="number" defaultValue={settings.invoiceDaysBefore} /></Field>
      <label className="flex items-start gap-2 text-sm sm:col-span-3">
        <Checkbox name="liveGateways" defaultChecked={settings.liveGateways} className="mt-0.5" />
        <span>Ligar cobrança online (Stripe/Mercado Pago). Ligue somente depois de testar os pagamentos e webhooks em ambiente de teste do gateway.</span>
      </label>
      <div><SubmitButton>Salvar regras</SubmitButton></div>
    </form>
  );
}
