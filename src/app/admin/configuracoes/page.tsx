import type { Metadata } from "next";
import { CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { isSuperAdmin, requirePlatformUser } from "@/server/auth/guards";
import { listPlatformProviderStatus } from "@/server/ai/credentials";
import { isEncryptionConfigured } from "@/server/security/crypto";
import { isEmailConfigured } from "@/server/email";
import { googleOAuthConfigured } from "@/server/integrations/google";
import { MODELS } from "@/server/ai/models";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { when } from "@/lib/format";
import { ProviderKeyForm, RemoveKey } from "./settings-forms";

export const metadata: Metadata = { title: "Configurações" };

function Row({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      {ok ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />}
      <div>
        <p className="text-sm font-medium">{label} {ok ? <Badge variant="success" className="ml-1">Configurado</Badge> : <Badge variant="warning" className="ml-1">Pendente</Badge>}</p>
        <p className="text-xs text-ink-muted">{detail}</p>
      </div>
    </li>
  );
}

export default async function ConfiguracoesPage() {
  const user = await requirePlatformUser();
  const providers = await listPlatformProviderStatus(user.id);
  const superAdmin = isSuperAdmin(user);
  const env = (k: string) => Boolean(process.env[k]);
  return (
    <>
      <PageHeader eyebrow="Operação" title="Configurações da plataforma" description="Provedores de IA e situação de cada serviço externo. Nada é marcado como pronto sem configuração real." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Provedores de IA</CardTitle>
            <CardDescription>Chaves da plataforma (usadas por todas as empresas). Ficam criptografadas; o valor nunca é exibido nem enviado ao navegador.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {providers.map((p) => (
              <div key={p.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{p.label}</p>
                  {p.db ? (
                    <Badge variant={p.db.status === "verified" ? "success" : "danger"}>{p.db.status === "verified" ? "Verificada" : "Com erro"} · {p.db.keyHint}</Badge>
                  ) : p.env ? (
                    <Badge variant="electric">Variável de ambiente · {p.env}</Badge>
                  ) : (
                    <Badge variant="warning">Pendente</Badge>
                  )}
                  {p.db && superAdmin && <RemoveKey provider={p.id} />}
                </div>
                {p.db?.lastError && <p className="mt-1 text-xs text-danger">{p.db.lastError}</p>}
                {p.db?.lastCheckedAt && <p className="mt-1 text-xs text-ink-subtle">Último teste: {when(p.db.lastCheckedAt)}</p>}
                {superAdmin && <ProviderKeyForm provider={p.id} needsBaseUrl={!!p.needsBaseUrl} defaultModel={p.id === "anthropic" ? MODELS[0].id : ""} />}
              </div>
            ))}
            <p className="text-xs text-ink-subtle">Busca vetorial (embeddings) usa a chave OpenAI. Sem ela, a base de conhecimento funciona com busca textual em português.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Serviços do servidor</CardTitle>
            <CardDescription>Variáveis de ambiente (veja .env.example e docs/INTEGRACOES.md).</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              <Row ok={isEncryptionConfigured()} label="Criptografia de credenciais" detail="ENCRYPTION_KEY (32 bytes base64). Obrigatória para salvar chaves e integrações." />
              <Row ok={env("CRON_SECRET")} label="Processamento agendado (cron)" detail="CRON_SECRET para a rota /api/cron/worker (hospedagem serverless) — ou rode npm run worker." />
              <Row ok={isEmailConfigured()} label="E-mail transacional (Resend)" detail="RESEND_API_KEY e EMAIL_FROM: recuperação de senha e ferramenta send_email." />
              <Row ok={env("TAVILY_API_KEY")} label="Pesquisa na internet (Tavily)" detail="TAVILY_API_KEY: ferramenta web_search." />
              <Row ok={googleOAuthConfigured()} label="Google OAuth" detail="GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET: Gmail, Agenda, Planilhas e Drive por empresa." />
              <Row ok={env("WHATSAPP_VERIFY_TOKEN") && env("WHATSAPP_APP_SECRET")} label="Webhook do WhatsApp" detail="WHATSAPP_VERIFY_TOKEN e WHATSAPP_APP_SECRET: receber mensagens (o envio usa as credenciais de cada empresa)." />
              <Row ok={env("STRIPE_SECRET_KEY") && env("STRIPE_WEBHOOK_SECRET")} label="Stripe" detail="Cobranças ficam DESATIVADAS até configurar e testar." />
              <Row ok={env("MERCADOPAGO_ACCESS_TOKEN") && env("MERCADOPAGO_WEBHOOK_SECRET")} label="Mercado Pago" detail="Cobranças ficam DESATIVADAS até configurar e testar." />
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
