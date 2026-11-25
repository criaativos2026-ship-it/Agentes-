import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="text-center">
        <Logo className="justify-center" />
        <p className="mt-8 text-sm font-semibold text-electric">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-display">Página não encontrada</h1>
        <p className="mt-2 text-sm text-ink-muted">O endereço não existe ou você não tem acesso a ele.</p>
        <Button asChild className="mt-6">
          <Link href="/">Voltar ao início</Link>
        </Button>
      </div>
    </main>
  );
}
