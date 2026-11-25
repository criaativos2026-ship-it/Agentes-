import type { Metadata } from "next";
import { ExternalLinkIcon } from "lucide-react";
import { can, requireOrgPermission } from "@/server/auth/guards";
import { listOrgIntegrations } from "@/server/queries/org";
import { googleOAuthConfigured } from "@/server/integrations/google";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { when } from "@/lib/format";
import { ApiKeyForm, IntegrationButtons } from "./integration-forms";

export const metadata: Metadata = { title: "Integrações" };

export default async function IntegrationsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { org } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgPermission(org, "integrations.view");
  const { items, agentOptions } = await listOrgIntegrations(ctx);
  const manage = can(ctx, "integrations.manage");
  return (
    <>
      <PageHeader eyebrow={ctx.org.name} title="Central de integrações" description="Conexões com serviços externos usados pelos agentes. Credenciais ficam criptografadas e só são usadas pela sua empresa." />
      {sp.ok === "google" && <p className="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">Conta Google conectada.</p>}
      {sp.erro && <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning">{sp.erro.slice(0, 300)}</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        {items.map(({ def, row, usage }) => (
          <Card key={def.key}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {def.name} {row ? <StatusBadge kind="integration" status={row.status} /> : <Badge variant="outline">Não configurada</Badge>}
              </CardTitle>
              <CardDescription>{def.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {row?.lastError && <p className="rounded-md bg-danger/10 px-2.5 py-2 text-xs text-danger">{row.lastError}</p>}
              {row && (
                <p className="text-xs text-ink-subtle">
                  {row.connectedAt ? `Conectada em ${when(row.connectedAt, ctx.org.timezone)}` : "Ainda não conectada"}
                  {row.lastCheckedAt ? ` · último teste ${when(row.lastCheckedAt, ctx.org.timezone)}` : ""}
                  {usage ? ` · ${usage.count} uso(s), último ${when(usage.last, ctx.org.timezone)}` : ""}
                  {row.config.email ? ` · conta ${row.config.email}` : ""}
                </p>
              )}
              <details className="text-xs text-ink-muted">
                <summary className="cursor-pointer hover:text-ink">O que é necessário</summary>
                <ul className="mt-1.5 list-disc space-y-1 pl-5">{def.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
                <a href={def.docsUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-electric hover:underline">Documentação oficial <ExternalLinkIcon className="size-3" /></a>
              </details>
              {manage && def.auth === "oauth_google" && (
                <div className="flex flex-wrap gap-2">
                  {googleOAuthConfigured() ? (
                    <Button asChild variant={row?.status === "connected" ? "outline" : "default"}>
                      <a href={`/api/integrations/google/start?org=${ctx.org.slug}`}>{row?.status === "connected" ? "Reconectar conta Google" : "Conectar conta Google"}</a>
                    </Button>
                  ) : (
                    <p className="text-xs text-warning">Pendente na plataforma: o servidor precisa de GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.</p>
                  )}
                </div>
              )}
              {manage && def.auth !== "oauth_google" && <ApiKeyForm slug={ctx.org.slug} integrationKey={def.key} fields={def.fields} config={row?.config ?? {}} hasSecrets={!!row && row.status !== "disabled"} agentOptions={agentOptions} />}
              {manage && row && row.status !== "disabled" && <IntegrationButtons slug={ctx.org.slug} integrationKey={def.key} name={def.name} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
