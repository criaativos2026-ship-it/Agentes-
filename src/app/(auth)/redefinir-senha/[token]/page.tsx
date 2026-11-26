import type { Metadata } from "next";
import Link from "next/link";
import { isResetTokenValid } from "@/server/auth/password-reset";
import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "Nova senha" };

export default async function RedefinirSenhaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await isResetTokenValid(token);
  return (
    <>
      <h1 className="text-xl font-semibold tracking-display">Criar nova senha</h1>
      {valid ? (
        <>
          <p className="mt-1 mb-6 text-sm text-ink-muted">Ao salvar, todas as sessões abertas serão encerradas.</p>
          <NewPasswordForm token={token} />
        </>
      ) : (
        <>
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">Este link é inválido ou expirou.</p>
          <Link href="/recuperar-senha" className="mt-4 block text-center text-sm text-electric hover:underline">
            Pedir um novo link
          </Link>
        </>
      )}
    </>
  );
}
