import { cn } from "@/lib/utils";
import { WORDMARK_AI, WORDMARK_NEXUS, WORDMARK_WIDTH } from "./brand-paths";

/**
 * Marca NEXUS AI (ver docs/MANUAL_DE_MARCA.md). Símbolo: um "N" traçado como caminho entre dois
 * nós; o nó de resultado é o único ponto de cor (azul de sinal). Letras em contorno, sem fonte externa.
 * `tone="negative"` para fundos escuros.
 */
export function Logo({ className, compact, tone = "positive" }: { className?: string; compact?: boolean; tone?: "positive" | "negative" }) {
  const ink = tone === "negative" ? "#FFFFFF" : "var(--nx-ink)";
  const s = 52 / 64;
  return (
    <svg
      viewBox={`0 0 ${compact ? 56 : WORDMARK_WIDTH} 56`}
      className={cn("h-7 w-auto shrink-0", className)}
      role="img"
      aria-label="NEXUS AI"
    >
      <g transform={`translate(0 2) scale(${s})`}>
        <path d="M19 46V18L45 46V18" fill="none" stroke={ink} strokeWidth="6" strokeMiterlimit="10" />
        <circle cx="19" cy="46" r="6.5" fill={ink} />
        <circle cx="45" cy="18" r="6.5" fill="var(--nx-electric)" />
      </g>
      {!compact && (
        <>
          <path d={WORDMARK_NEXUS} fill={ink} />
          <path d={WORDMARK_AI} fill={ink} />
        </>
      )}
    </svg>
  );
}
