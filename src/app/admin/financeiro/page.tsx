import type { Metadata } from "next";
import { desc, eq, inArray, ne, sql } from "drizzle-orm";
import { AlertTriangleIcon, BanknoteIcon, RepeatIcon, WalletIcon } from "lucide-react";
import { isSuperAdmin, requirePlatformUser } from "@/server/auth/guards";
import { withPlatform } from "@/server/db/client";
import { organizations, payments, plans, subscriptions } from "@/server/db/schema";
import { billingSettings } from "@/server/billing/service";
import { gatewayConfigured } from "@/server/billing/gateways";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { dateBR, money } from "@/lib/format";
import { BillingSettingsForm, NewPaymentForm, NewSubscriptionForm, PaymentActions, CancelSubscription } from "./finance-forms";

export const metadata: Metadata = { title: "Assinaturas e pagamentos" };

const METHOD: Record<string, string> = { manual_pix: "PIX", manual_boleto: "Boleto", manual_transfer: "Transferência", stripe: "Stripe", mercadopago: "Mercado Pago" };

export default async function FinanceiroPage() {
  const user = await requirePlatformUser();
  const superAdmin = isSuperAdmin(user);
  const d = await withPlatform(user.id, async (tx) => {
    const subs = await tx
      .select({ s: subscriptions, planName: plans.name, planPrice: plans.priceCents, interval: plans.intervalMonths, orgName: organizations.name })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .innerJoin(organizations, eq(organizations.id, subscriptions.organizationId))
      .where(ne(subscriptions.status, "canceled"))
      .orderBy(organizations.name);
    const pays = await tx.select({ p: payments, orgName: organizations.name }).from(payments).innerJoin(organizations, eq(organizations.id, payments.organizationId)).orderBy(desc(payments.dueDate)).limit(200);
    const [totals] = await tx
      .select({
        received: sql<number>`coalesce(sum(${payments.amountCents}) filter (where ${payments.status} = 'paid' and date_trunc('month', ${payments.paidAt}) = date_trunc('month', now())), 0)::bigint`,
        open: sql<number>`coalesce(sum(${payments.amountCents}) filter (where ${payments.status} = 'pending'), 0)::bigint`,
        overdue: sql<number>`coalesce(sum(${payments.amountCents}) filter (where ${payments.status} = 'overdue'), 0)::bigint`,
      })
      .from(payments);
    const orgs = await tx.select({ id: organizations.id, name: organizations.name }).from(organizations).where(inArray(organizations.status, ["trial", "active", "suspended"])).orderBy(organizations.name);
    const planOptions = await tx.select({ id: plans.id, name: plans.name, priceCents: plans.priceCents }).from(plans).where(eq(plans.isActive, true)).orderBy(plans.name);
    return { subs, pays, totals, orgs, planOptions, settings: await billingSettings(tx) };
  });
  const mrr = d.subs.filter((x) => ["active", "past_due"].includes(x.s.status)).reduce((a, x) => a + (x.s.customPriceCents ?? x.planPrice) / x.interval, 0);
  return (
    <>
      <PageHeader eyebrow="Comercial" title="Assinaturas e pagamentos" description="Contratos, cobranças, vencimentos e inadimplência. Cobrança online só funciona depois de configurada e liberada." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Receita recorrente (MRR)" value={money(Math.round(mrr))} icon={RepeatIcon} tone="success" />
        <StatCard label="Recebido no mês" value={money(Number(d.totals.received))} icon={WalletIcon} tone="electric" />
        <StatCard label="A receber" value={money(Number(d.totals.open))} icon={BanknoteIcon} tone="warning" />
        <StatCard label="Vencido (inadimplência)" value={money(Number(d.totals.overdue))} icon={AlertTriangleIcon} tone={Number(d.totals.overdue) ? "danger" : "default"} />
      </div>
      <Tabs defaultValue="assinaturas">
        <TabsList>
          <TabsTrigger value="assinaturas">Assinaturas ({d.subs.length})</TabsTrigger>
          <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
          <TabsTrigger value="regras">Regras e gateways</TabsTrigger>
        </TabsList>
        <TabsContent value="assinaturas" className="grid gap-4">
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Plano</TableHead><TableHead>Status</TableHead><TableHead>Período atual</TableHead><TableHead className="text-right">Valor</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {d.subs.map(({ s, planName, planPrice, orgName }) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{orgName}</TableCell>
                    <TableCell>{planName}{s.customPriceCents !== null && <span className="block text-xs text-ink-subtle">preço personalizado</span>}</TableCell>
                    <TableCell><StatusBadge kind="subscription" status={s.status} /></TableCell>
                    <TableCell className="text-ink-muted">{dateBR(s.currentPeriodStart)} a {dateBR(s.currentPeriodEnd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(s.customPriceCents ?? planPrice)}</TableCell>
                    <TableCell className="text-right">{superAdmin && <CancelSubscription id={s.id} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          {superAdmin && <NewSubscriptionForm orgs={d.orgs} plans={d.planOptions} />}
        </TabsContent>
        <TabsContent value="pagamentos" className="grid gap-4">
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Vencimento</TableHead><TableHead>Empresa</TableHead><TableHead>Descrição</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {d.pays.map(({ p, orgName }) => (
                  <TableRow key={p.id}>
                    <TableCell>{dateBR(p.dueDate)}</TableCell>
                    <TableCell className="font-medium">{orgName}</TableCell>
                    <TableCell className="text-ink-muted">{p.description}{p.paidAt && <span className="block text-xs">Pago em {dateBR(p.paidAt)} · {METHOD[p.method]}</span>}</TableCell>
                    <TableCell><StatusBadge kind="payment" status={p.status} /></TableCell>
                    <TableCell className="text-right tabular-nums">{money(p.amountCents, p.currency)}</TableCell>
                    <TableCell className="text-right">{superAdmin && ["pending", "overdue"].includes(p.status) && <PaymentActions id={p.id} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          {superAdmin && <NewPaymentForm orgs={d.orgs} />}
        </TabsContent>
        <TabsContent value="regras">
          <Card>
            <CardHeader>
              <CardTitle>Regras de cobrança</CardTitle>
              <CardDescription>
                Gateways no servidor: Stripe {gatewayConfigured("stripe") ? "configurado" : "PENDENTE"} · Mercado Pago {gatewayConfigured("mercadopago") ? "configurado" : "PENDENTE"}. O ciclo de cobrança roda automaticamente pelo worker/cron.
              </CardDescription>
            </CardHeader>
            <CardContent>{superAdmin ? <BillingSettingsForm settings={d.settings} /> : <p className="text-sm text-ink-muted">Somente o super administrador altera estas regras.</p>}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
