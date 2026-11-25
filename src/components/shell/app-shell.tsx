"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NAV_ICONS, type NavSection } from "./icons";
import { UserMenu, type UserMenuProps } from "./user-menu";

function NavList({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-5">
      {sections.map((section, i) => (
        <div key={section.title ?? i}>
          {section.title && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-eyebrow text-ink-subtle uppercase">{section.title}</p>}
          <ul className="grid gap-0.5">
            {section.items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-surface-2 text-ink shadow-[inset_2px_0_0_var(--nx-brand)]" : "text-ink-muted hover:bg-surface-2/60 hover:text-ink",
                    )}
                  >
                    <Icon className={cn("size-[18px]", active ? "text-brand" : "text-ink-subtle group-hover:text-ink-muted")} aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold text-primary-foreground tabular-nums">{item.badge}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Estrutura dos painéis: menu lateral fixo no computador; barra superior + gaveta no celular. */
export function AppShell({
  sections,
  areaLabel,
  homeHref,
  user,
  banner,
  children,
}: {
  sections: NavSection[];
  areaLabel: string;
  homeHref: string;
  user: UserMenuProps;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-bg-alt/70 backdrop-blur lg:flex">
        <div className="px-5 pt-5 pb-4">
          <Link href={homeHref} aria-label="Início">
            <Logo />
          </Link>
          <p className="mt-3 truncate rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted">{areaLabel}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <NavList sections={sections} />
        </div>
        <div className="border-t border-line p-3">
          <UserMenu {...user} />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="-ml-1 grid size-10 place-items-center rounded-lg text-ink-muted hover:bg-surface-2"
            aria-label="Abrir menu"
          >
            <MenuIcon className="size-5" />
          </button>
          <Link href={homeHref} aria-label="Início" className="flex-1">
            <Logo />
          </Link>
          <UserMenu {...user} compact />
        </header>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent side="left" aria-describedby={undefined}>
            <DialogTitle className="sr-only">Menu</DialogTitle>
            <div className="px-5 pt-5 pb-3">
              <Logo />
              <p className="mt-3 truncate rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted">{areaLabel}</p>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-6">
              <NavList sections={sections} onNavigate={() => setOpen(false)} />
            </div>
          </DialogContent>
        </Dialog>
        {banner}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
