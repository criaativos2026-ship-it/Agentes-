"use client";

import Link from "next/link";
import { Building2Icon, LogOutIcon, ShieldIcon, UserIcon } from "lucide-react";
import { logout } from "@/app/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type UserMenuProps = { name: string; email: string; roleLabel: string; isPlatform: boolean; multiOrg?: boolean; compact?: boolean };

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export function UserMenu({ name, email, roleLabel, isPlatform, multiOrg, compact }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn("flex items-center gap-3 rounded-lg text-left outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-electric", compact ? "p-1" : "w-full p-2")}
        aria-label="Menu da conta"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-on-brand">{initials(name)}</span>
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{name}</span>
            <span className="block truncate text-xs text-ink-subtle">{roleLabel}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={compact ? "bottom" : "top"}>
        <DropdownMenuLabel>
          <span className="block font-medium">{name}</span>
          <span className="block truncate text-xs text-ink-subtle">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/conta">
            <UserIcon /> Minha conta
          </Link>
        </DropdownMenuItem>
        {isPlatform && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldIcon /> Painel administrativo
            </Link>
          </DropdownMenuItem>
        )}
        {multiOrg && (
          <DropdownMenuItem asChild>
            <Link href="/empresas">
              <Building2Icon /> Trocar de empresa
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <form action={logout}>
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full">
              <LogOutIcon className="text-danger" /> Sair
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
