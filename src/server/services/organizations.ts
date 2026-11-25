import "server-only";
import { and, eq, isNull, like, sql } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { organizationMembers, organizations, roles, users } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import { audit } from "@/server/audit/log";
import { slugify } from "@/lib/validation";
import { UserFacingError } from "@/server/errors";
import type { SystemRoleKey } from "@/server/rbac/catalog";

export type NewOrganization = {
  name: string;
  segment?: string;
  description?: string;
  document?: string;
  contactEmail?: string;
  contactPhone?: string;
  status?: "trial" | "active";
  isDemo?: boolean;
};

/** Gera um slug único a partir do nome (requer escopo plataforma). */
export async function uniqueOrgSlug(tx: Tx, name: string) {
  const base = slugify(name);
  const taken = await tx
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(like(organizations.slug, `${base}%`));
  const set = new Set(taken.map((t) => t.slug));
  if (!set.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!set.has(`${base}-${i}`)) return `${base}-${i}`;
  throw new UserFacingError("Não foi possível gerar um endereço para a empresa.");
}

/** Cadastra uma empresa (escopo plataforma). */
export async function createOrganization(tx: Tx, actorUserId: string | null, data: NewOrganization) {
  const slug = await uniqueOrgSlug(tx, data.name);
  const [org] = await tx
    .insert(organizations)
    .values({
      name: data.name,
      slug,
      segment: data.segment,
      description: data.description,
      document: data.document,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      status: data.status ?? "trial",
      isDemo: data.isDemo ?? false,
      createdBy: actorUserId,
    })
    .returning();
  await audit(tx, {
    organizationId: org.id,
    actorUserId,
    action: "organization.created",
    summary: `Empresa "${org.name}" cadastrada`,
    entityType: "organization",
    entityId: org.id,
  });
  return org;
}

export async function systemRoleId(tx: Tx, key: SystemRoleKey) {
  const [role] = await tx
    .select({ id: roles.id })
    .from(roles)
    .where(and(isNull(roles.organizationId), eq(roles.key, key)))
    .limit(1);
  if (!role) throw new Error(`Papel de sistema ${key} ausente — rode as migrações.`);
  return role.id;
}

/**
 * Cria (ou reaproveita) um usuário e o associa à empresa.
 * Deve rodar em escopo PLATAFORMA: e-mails são únicos na plataforma inteira e a consulta
 * precisa enxergar contas de outras empresas para não duplicar a pessoa.
 * A senha provisória só é usada se a conta for nova.
 */
export async function addMember(
  tx: Tx,
  actorUserId: string | null,
  input: { organizationId: string; email: string; name: string; roleId: string; tempPassword?: string; jobTitle?: string },
) {
  const email = input.email.trim().toLowerCase();
  let [user] = await tx
    .select({ id: users.id, status: users.status, anonymizedAt: users.anonymizedAt })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  let created = false;
  if (!user) {
    if (!input.tempPassword) throw new UserFacingError("Informe uma senha provisória para a nova conta.");
    [user] = await tx
      .insert(users)
      .values({ email, name: input.name, passwordHash: await hashPassword(input.tempPassword) })
      .returning({ id: users.id, status: users.status, anonymizedAt: users.anonymizedAt });
    created = true;
  } else if (user.anonymizedAt) {
    throw new UserFacingError("Este e-mail pertence a uma conta removida e não pode ser reutilizado.");
  }

  // O papel precisa ser de sistema ou da própria empresa.
  const [role] = await tx
    .select({ id: roles.id, organizationId: roles.organizationId })
    .from(roles)
    .where(eq(roles.id, input.roleId))
    .limit(1);
  if (!role || (role.organizationId !== null && role.organizationId !== input.organizationId)) {
    throw new UserFacingError("Papel inválido para esta empresa.");
  }

  const existing = await tx
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, user.id)))
    .limit(1);
  if (existing.length) throw new UserFacingError("Esta pessoa já faz parte da empresa.");

  const [member] = await tx
    .insert(organizationMembers)
    .values({
      organizationId: input.organizationId,
      userId: user.id,
      roleId: input.roleId,
      jobTitle: input.jobTitle,
      invitedBy: actorUserId,
    })
    .returning();

  await audit(tx, {
    organizationId: input.organizationId,
    actorUserId,
    action: "member.added",
    summary: `${input.name} adicionado(a) à equipe${created ? " (conta nova)" : ""}`,
    entityType: "member",
    entityId: member.id,
  });
  return { member, userId: user.id, created };
}
