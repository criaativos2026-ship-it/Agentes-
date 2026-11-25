import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Cartão de indicador. Os valores SEMPRE vêm do banco; sem dado, mostra "—". */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number | null;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "brand" | "electric" | "success" | "danger" | "warning";
}) {
  const toneClass = {
    default: "text-ink-muted bg-surface-2",
    brand: "text-brand bg-brand/10",
    electric: "text-electric bg-electric/10",
    success: "text-success bg-success/10",
    danger: "text-danger bg-danger/10",
    warning: "text-warning bg-warning/10",
  }[tone];
  return (
    <div className="rounded-xl border border-line bg-card/80 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-muted">{label}</p>
        {Icon && (
          <span className={cn("grid size-8 place-items-center rounded-lg", toneClass)}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-display text-ink tabular-nums sm:text-[28px]">{value ?? "—"}</p>
      {hint && <p className="mt-1 text-xs text-ink-subtle">{hint}</p>}
    </div>
  );
}
