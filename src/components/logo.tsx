import { cn } from "@/lib/utils";

/** Marca provisória do NEXUS AI (símbolo geométrico + nome). Substitua quando a marca definitiva existir. */
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        {/* Cores sólidas: um gradiente com ID fixo quebra quando o logo aparece duas vezes (menu oculto no celular). */}
        <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--nx-surface-2)" stroke="var(--nx-electric)" strokeWidth="1.5" />
        <path d="M9 22V10l14 12V10" fill="none" stroke="var(--nx-brand)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && (
        <span className="text-[17px] font-extrabold tracking-display text-ink">
          NEXUS<span className="text-brand"> AI</span>
        </span>
      )}
    </span>
  );
}
