import type { Metadata } from "next";
import { CreditCardIcon } from "lucide-react";
import { desc, sql } from "drizzle-orm";
import { isSuperAdmin, requirePlatformUser } from "@/server/auth/guards";
import { withPlatform } from "@/server/db/client";
import { plans } from "@/server/db/schema";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { money, num } from "@/lib/format";
import { PlanForm } from "./plan-form";

export const metadata: Metadata = { title: "Planos" };

const TYPE = { monthly: "Mensal", annual: "Anual", custom: "Personalizado", enterprise: "Contrato empresarial" } as const;
const lim = (v: number | null) => (v === null ? "ilimitado" : num(v));

export default async function PlanosPage() {
  const user = await requirePlatformUser();
  const rows = await withPlatform(user.id, (tx) =>
    tx.select({ plan: plans, subs: sql<number>`(select count(*)::int from subscriptions s where s.plan_id = ${plans.id} and s.status <> 'canceled')` }).from(plans).orderBy(desc(plans.isActive), plans.priceCents),
  );
  const canEdit = isSuperAdmin(user);
  return (
    <>
      <PageHeader eyebrow="Comercial" title="Planos" description="Planos e contratos: preço, ciclo, limites de uso e recursos. Os limites são aplicados automaticamente antes de cada execução." />
      {rows.length === 0 ? (
        <EmptyState icon={CreditCardIcon} title="Nenhum plano cadastrado" description="Cadastre os planos que você vai comercializar. Nenhum preço é pré-definido pela plataforma." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ plan: p, subs }) => (
            <Card key={p.id} className={p.isActive ? "" : "opacity-60"}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">{p.name} <Badge>{TYPE[p.type]}</Badge>{!p.isActive && <Badge variant="danger">Inativo</Badge>}{!p.isPublic && <Badge variant="outline">Privado</Badge>}</CardTitle>
                <CardDescription>{p.description ?? p.key}</CardDescription>
                {canEdit && <div data-slot="card-action"><PlanForm plan={{ ...p, validUntil: p.validUntil ?? "" }} /></div>}
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <p className="text-2xl font-semibold tracking-display">{money(p.priceCents, p.currency)}<span className="text-sm font-normal text-ink-muted"> / {p.intervalMonths === 1 ? "mês" : `${p.intervalMonths} meses`}</span></p>
                <ul className="grid gap-1 text-xs text-ink-muted">
                  <li>Agentes publicados: {lim(p.limits.agents)}</li>
                  <li>Usuários: {lim(p.limits.users)}</li>
                  <li>Execuções/mês: {lim(p.limits.executionsPerMonth)}</li>
                  <li>Tokens de IA/mês: {lim(p.limits.tokensPerMonth)}</li>
                  <li>Armazenamento: {p.limits.storageMb === null ? "ilimitado" : `${num(p.limits.storageMb)} MB`}</li>
                  {p.validUntil && <li>Válido até {p.validUntil}</li>}
                </ul>
                {p.features.length > 0 && <ul className="list-disc pl-5 text-xs">{p.features.map((f) => <li key={f}>{f}</li>)}</ul>}
                <p className="text-xs text-ink-subtle">{subs} assinatura(s) vigente(s)</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {canEdit && <div className="mt-6"><PlanForm /></div>}
    </>
  );
}
