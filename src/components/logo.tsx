import { cn } from "@/lib/utils";

/** Marca provisória do NEXUS AI (símbolo geométrico + nome). Substitua quando a marca definitiva existir. */
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <defs>
          <linearGradient id="nx-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--nx-electric)" />
            <stop offset="1" stopColor="var(--nx-brand)" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--nx-surface-2)" stroke="url(#nx-g)" strokeWidth="1.5" />
        <path d="M9 22V10l14 12V10" fill="none" stroke="url(#nx-g)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && (
        <span className="text-[17px] font-extrabold tracking-display text-ink">
          NEXUS<span className="text-brand"> AI</span>
        </span>
      )}
    </span>
  );
}
