import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/guards";
import { hasAnyUser } from "@/server/auth/setup";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ senha?: string }> }) {
  if (await getSession()) redirect("/");
  if (!(await hasAnyUser())) redirect("/configurar");
  const { senha } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold tracking-display">Entrar</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">Acesse o painel da sua empresa.</p>
      {senha === "redefinida" && (
        <p role="status" className="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">
          Senha redefinida. Entre com a nova senha.
        </p>
      )}
      <LoginForm />
    </>
  );
}
