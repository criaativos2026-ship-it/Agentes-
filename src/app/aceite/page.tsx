import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/guards";
import { hasAcceptedPrivacy } from "@/lib/privacy";
import { Logo } from "@/components/logo";
import { PrivacyNotice } from "@/components/privacy-notice";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Aviso de privacidade" };

export default async function AceitePage() {
  const s = await getSession();
  if (!s) redirect("/entrar");
  if (hasAcceptedPrivacy(s.user)) redirect("/");
  const isUpdate = Boolean(s.user.privacyAcceptedAt);
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-8">
      <Logo />
      <h1 className="mt-8 text-2xl font-bold tracking-display">{isUpdate ? "O aviso de privacidade foi atualizado" : "Antes de continuar"}</h1>
      <p className="mt-2 mb-4 text-sm text-ink-muted">Leia como tratamos seus dados. Para usar a plataforma é preciso concordar.</p>
      <div className="max-h-[50dvh] overflow-y-auto rounded-xl border border-line bg-surface p-5">
        <PrivacyNotice />
      </div>
      <AcceptForm />
    </main>
  );
}
