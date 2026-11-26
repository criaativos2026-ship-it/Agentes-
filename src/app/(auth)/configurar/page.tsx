import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasAnyUser, setupTokenValid } from "@/server/auth/setup";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Primeiro acesso" };

export default async function ConfigurarPage({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  if (await hasAnyUser()) redirect("/entrar");
  const { codigo } = await searchParams;
  if (!setupTokenValid(codigo)) {
    return (
      <>
        <h1 className="text-xl font-bold tracking-display">Primeiro acesso protegido</h1>
        <p className="mt-2 text-sm text-ink-muted">Esta plataforma ainda não foi configurada. Use o link de primeiro acesso (com o código) enviado ao responsável.</p>
      </>
    );
  }
  return (
    <>
      <p className="mb-1.5 text-[11px] font-semibold tracking-eyebrow text-electric uppercase">Primeiro acesso</p>
      <h1 className="text-xl font-bold tracking-display">Crie a conta do super administrador</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        Esta tela só aparece uma vez. A conta criada terá acesso total à plataforma.
      </p>
      <SetupForm code={codigo ?? ""} />
    </>
  );
}
