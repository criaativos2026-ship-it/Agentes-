import type { Metadata } from "next";
import Link from "next/link";
import { ResetRequestForm } from "./reset-request-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecuperarSenhaPage() {
  return (
    <>
      <h1 className="text-xl font-bold tracking-display">Recuperar senha</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">Informe seu e-mail para receber um link de redefinição.</p>
      <ResetRequestForm />
      <Link href="/entrar" className="mt-4 block text-center text-sm text-electric hover:underline">
        Voltar para o login
      </Link>
    </>
  );
}
