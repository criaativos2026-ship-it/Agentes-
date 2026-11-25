import type { ReactNode } from "react";

export function PageHeader({ title, description, eyebrow, actions }: { title: ReactNode; description?: ReactNode; eyebrow?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1.5 text-[11px] font-semibold tracking-eyebrow text-electric uppercase">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-display text-ink sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
