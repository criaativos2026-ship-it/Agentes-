import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasAnyUser } from "@/server/auth/setup";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Primeiro acesso" };

export default async function ConfigurarPage() {
  if (await hasAnyUser()) redirect("/entrar");
  return (
    <>
      <p className="mb-1.5 text-[11px] font-semibold tracking-eyebrow text-electric uppercase">Primeiro acesso</p>
      <h1 className="text-xl font-bold tracking-display">Crie a conta do super administrador</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        Esta tela só aparece uma vez. A conta criada terá acesso total à plataforma.
      </p>
      <SetupForm />
    </>
  );
}
