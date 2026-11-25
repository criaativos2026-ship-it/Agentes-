import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { withOrg, withPlatform, withUser } from "@/server/db/client";
import { organizationMembers, organizations, rolePermissions, roles } from "@/server/db/schema";
import { ALL_PERMISSIONS, type Permission } from "@/server/rbac/catalog";
import { hasAcceptedPrivacy } from "@/lib/privacy";
import { AccessDeniedError } from "@/server/errors";
import { SESSION_COOKIE, validateSessionToken, type SessionUser } from "./session";

/** Usuário da requisição atual — conferido no banco a cada requisição. */
export const getSession = cache(async (): Promise<{ sessionId: string; user: SessionUser } | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});

export const isPlatformUser = (u: Pick<SessionUser, "platformRole">) => u.platformRole !== null;
export const isSuperAdmin = (u: Pick<SessionUser, "platformRole">) => u.platformRole === "super_admin";

/** Exige login e o aceite do aviso de privacidade vigente (LGPD). */
export async function requireUser(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect("/entrar");
  if (!hasAcceptedPrivacy(s.user)) redirect("/aceite");
  return s.user;
}

/** Nível 1 — equipe da plataforma (super administrador e equipe interna). */
export async function requirePlatformUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isPlatformUser(user)) redirect("/");
  return user;
}

/** Ações críticas da plataforma (planos, cobranças, configurações gerais). */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isSuperAdmin(user)) redirect("/admin");
  return user;
}

export type OrgContext = {
  user: SessionUser;
  org: { id: string; slug: string; name: string; status: string; timezone: string; isDemo: boolean };
  memberId: string | null;
  roleKey: string | null;
  roleName: string;
  permissions: ReadonlySet<Permission>;
  /** Acesso de suporte feito pela equipe da plataforma (não é membro da empresa). */
  viaPlatform: boolean;
};

const orgColumns = {
  id: organizations.id,
  slug: organizations.slug,
  name: organizations.name,
  status: organizations.status,
  timezone: organizations.timezone,
  isDemo: organizations.isDemo,
};

/** Resolve a empresa pelo slug e as permissões do usuário nela. Empresa alheia = 404. */
export const getOrgContext = cache(async (slug: string): Promise<OrgContext | null> => {
  const user = await requireUser();
  if (!/^[a-z0-9-]{2,64}$/.test(slug)) return null;

  if (isPlatformUser(user)) {
    const [org] = await withPlatform(user.id, (tx) =>
      tx.select(orgColumns).from(organizations).where(eq(organizations.slug, slug)).limit(1),
    );
    if (!org) return null;
    return {
      user,
      org,
      memberId: null,
      roleKey: "platform",
      roleName: user.platformRole === "super_admin" ? "Super administrador" : "Equipe NEXUS",
      permissions: new Set(ALL_PERMISSIONS),
      viaPlatform: true,
    };
  }

  const [row] = await withUser(user.id, (tx) =>
    tx
      .select({ org: orgColumns, memberId: organizationMembers.id, roleId: organizationMembers.roleId })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(
        and(
          eq(organizations.slug, slug),
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.status, "active"),
          ne(organizations.status, "canceled"),
        ),
      )
      .limit(1),
  );
  if (!row) return null;

  const perms = await withOrg(row.org.id, user.id, async (tx) => {
    const [role] = await tx.select({ key: roles.key, name: roles.name }).from(roles).where(eq(roles.id, row.roleId));
    const list = await tx
      .select({ key: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, row.roleId));
    return { role, keys: list.map((p) => p.key as Permission) };
  });

  return {
    user,
    org: row.org,
    memberId: row.memberId,
    roleKey: perms.role?.key ?? null,
    roleName: perms.role?.name ?? "—",
    permissions: new Set(perms.keys),
    viaPlatform: false,
  };
});

export async function requireOrg(slug: string): Promise<OrgContext> {
  const ctx = await getOrgContext(slug);
  if (!ctx) notFound();
  return ctx;
}

export const can = (ctx: OrgContext, perm: Permission) => ctx.permissions.has(perm);

/** Para páginas: sem permissão = 404 (não revela o que existe). */
export async function requireOrgPermission(slug: string, perm: Permission): Promise<OrgContext> {
  const ctx = await requireOrg(slug);
  if (!can(ctx, perm)) notFound();
  return ctx;
}


/** Para ações do servidor: lança AccessDeniedError (convertido em mensagem pelo wrapper da ação). */
export async function assertOrgPermission(slug: string, perm: Permission): Promise<OrgContext> {
  const ctx = await getOrgContext(slug);
  if (!ctx || !can(ctx, perm)) throw new AccessDeniedError();
  return ctx;
}

export async function requestMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}

/** Lista as empresas do usuário (escolha de empresa após o login). */
export async function listUserOrgs(userId: string) {
  return withUser(userId, (tx) =>
    tx
      .select({ id: organizations.id, slug: organizations.slug, name: organizations.name, status: organizations.status })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.status, "active"),
          ne(organizations.status, "canceled"),
        ),
      )
      .orderBy(organizations.name),
  );
}
