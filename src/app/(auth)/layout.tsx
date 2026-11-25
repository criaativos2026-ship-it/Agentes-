import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-8" />
      <div className="w-full max-w-[420px] rounded-2xl border border-line bg-surface/80 p-6 shadow-2xl backdrop-blur sm:p-8">{children}</div>
      <p className="mt-6 text-xs text-ink-subtle">
        <a href="/privacidade" className="hover:text-ink-muted">Aviso de privacidade</a>
      </p>
    </main>
  );
}
