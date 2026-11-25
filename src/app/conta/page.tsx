import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, DownloadIcon } from "lucide-react";
import { desc, eq, and, isNull, gt } from "drizzle-orm";
import { getSession, isPlatformUser, listUserOrgs, requireUser } from "@/server/auth/guards";
import { withUser } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { Logo } from "@/components/logo";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { when } from "@/lib/format";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { ChangeEmailForm, ChangePasswordForm, DeletionRequest, ProfileForm, SessionActions, RevokeOthers } from "./forms";

export const metadata: Metadata = { title: "Minha conta" };

function describeAgent(ua: string | null) {
  if (!ua) return "Dispositivo desconhecido";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" · ");
}

export default async function ContaPage() {
  const user = await requireUser();
  const s = (await getSession())!;
  const { me, active } = await withUser(user.id, async (tx) => {
    const [me] = await tx.select({ deletionRequestedAt: users.deletionRequestedAt, privacyAcceptedAt: users.privacyAcceptedAt, privacyVersion: users.privacyVersion }).from(users).where(eq(users.id, user.id));
    const active = await tx
      .select({ id: sessions.id, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, ip: sessions.ip, userAgent: sessions.userAgent })
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastSeenAt));
    return { me, active };
  });
  const orgs = await listUserOrgs(user.id);
  const back = isPlatformUser(user) ? "/admin" : orgs.length === 1 ? `/app/${orgs[0].slug}` : "/empresas";
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-8 flex items-center justify-between">
        <Logo />
        <Button asChild variant="ghost" size="sm"><Link href={back}><ArrowLeftIcon /> Voltar</Link></Button>
      </div>
      <PageHeader title="Minha conta" description={user.email} />
      <div className="grid gap-4">
        <Card>
          <CardHeader><CardTitle>Perfil</CardTitle></CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <ProfileForm name={user.name} />
            <ChangeEmailForm email={user.email} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Senha</CardTitle><CardDescription>Ao trocar a senha, as outras sessões são encerradas.</CardDescription></CardHeader>
          <CardContent><ChangePasswordForm /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sessões ativas</CardTitle>
            <CardDescription>Dispositivos conectados à sua conta.</CardDescription>
            {active.length > 1 && <div data-slot="card-action"><RevokeOthers /></div>}
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-line">
              {active.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {describeAgent(a.userAgent)} {a.id === s.sessionId && <Badge variant="success" className="ml-1">Esta sessão</Badge>}
                    </p>
                    <p className="text-xs text-ink-subtle">Início: {when(a.createdAt)} · última atividade: {when(a.lastSeenAt)}{a.ip ? ` · IP ${a.ip}` : ""}</p>
                  </div>
                  {a.id !== s.sessionId && <SessionActions sessionId={a.id} />}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card id="privacidade">
          <CardHeader><CardTitle>Privacidade e seus dados (LGPD)</CardTitle></CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <p className="text-ink-muted">
              Aviso de privacidade aceito em {when(me.privacyAcceptedAt)} (versão {me.privacyVersion ?? "—"}{me.privacyVersion === PRIVACY_VERSION ? ", atual" : ""}).{" "}
              <Link href="/privacidade" className="text-electric hover:underline">Ler o aviso</Link>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><a href="/api/meus-dados" download><DownloadIcon /> Baixar meus dados</a></Button>
              <DeletionRequest requested={!!me.deletionRequestedAt} />
            </div>
            {me.deletionRequestedAt && <p className="text-warning">Pedido de exclusão registrado em {when(me.deletionRequestedAt)}. A equipe da plataforma fará a exclusão.</p>}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
