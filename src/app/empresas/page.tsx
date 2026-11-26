import type { Metadata } from "next";
import Link from "next/link";
import { Building2Icon, ChevronRightIcon } from "lucide-react";
import { listUserOrgs, requireUser } from "@/server/auth/guards";
import { Logo } from "@/components/logo";
import { EmptyState } from "@/components/empty-state";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Escolha a empresa" };

export default async function EmpresasPage() {
  const user = await requireUser();
  const orgs = await listUserOrgs(user.id);
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10">
      <Logo className="mb-8" />
      <h1 className="text-xl font-semibold tracking-display">Olá, {user.name.split(" ")[0]}</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">Escolha a empresa que deseja acessar.</p>
      {orgs.length === 0 ? (
        <EmptyState icon={Building2Icon} title="Você ainda não faz parte de nenhuma empresa" description="Peça ao administrador da sua empresa para liberar seu acesso." />
      ) : (
        <ul className="grid gap-2">
          {orgs.map((o) => (
            <li key={o.id}>
              <Link href={`/app/${o.slug}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-strong hover:bg-surface-2">
                <Building2Icon className="size-5 text-electric" />
                <span className="flex-1 font-medium">{o.name}</span>
                <ChevronRightIcon className="size-4 text-ink-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form action={logout} className="mt-6">
        <Button variant="ghost" type="submit" className="w-full">Sair</Button>
      </form>
    </main>
  );
}
