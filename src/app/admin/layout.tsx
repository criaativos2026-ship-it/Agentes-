import type { Metadata } from "next";
import { requirePlatformUser } from "@/server/auth/guards";
import { AppShell } from "@/components/shell/app-shell";
import { ADMIN_NAV } from "./nav";

export const metadata: Metadata = { title: { default: "Administração", template: "%s · Administração · NEXUS AI" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformUser();
  return (
    <AppShell
      sections={ADMIN_NAV}
      areaLabel="Painel administrativo"
      homeHref="/admin"
      user={{
        name: user.name,
        email: user.email,
        roleLabel: user.platformRole === "super_admin" ? "Super administrador" : "Equipe NEXUS",
        isPlatform: true,
      }}
    >
      {children}
    </AppShell>
  );
}
