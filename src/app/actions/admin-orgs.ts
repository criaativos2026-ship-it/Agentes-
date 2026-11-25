"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { withPlatform } from "@/server/db/client";
import { organizations, users } from "@/server/db/schema";
import { requestMeta, requirePlatformUser, requireSuperAdmin } from "@/server/auth/guards";
import { addMember, createOrganization, systemRoleId } from "@/server/services/organizations";
import { changeMemberRole, setMemberStatus } from "@/server/services/members";
import { createPasswordResetLink } from "@/server/auth/password-reset";
import { revokeAllUserSessions } from "@/server/auth/session";
import { audit } from "@/server/audit/log";
import { parseForm, toErrorState, UserFacingError } from "@/server/actions/result";
import { emailSchema, nameSchema, optionalText, passwordSchema, uuidSchema } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

const orgSchema = z.object({
  name: nameSchema,
  segment: optionalText(120),
  description: optionalText(4000),
  document: optionalText(30),
  contactEmail: emailSchema.optional(),
  contactPhone: optionalText(40),
  status: z.enum(["trial", "active"]).default("trial"),
  isDemo: z.literal("on").optional(),
  // Primeiro administrador (opcional)
  adminName: optionalText(120),
  adminEmail: emailSchema.optional(),
  adminPassword: passwordSchema.optional(),
});

export async function createOrganizationAction(_: FormState, form: FormData): Promise<FormState> {
  let orgId: string;
  try {
    const user = await requirePlatformUser();
    const data = parseForm(orgSchema, form);
    if (data.adminEmail && (!data.adminName || !data.adminPassword)) {
      throw new UserFacingError("Para criar o administrador da empresa, informe nome, e-mail e senha provisória.");
    }
    orgId = await withPlatform(user.id, async (tx) => {
      const org = await createOrganization(tx, user.id, { ...data, isDemo: data.isDemo === "on" });
      if (data.adminEmail && data.adminName) {
        await addMember(tx, user.id, {
          organizationId: org.id,
          email: data.adminEmail,
          name: data.adminName,
          tempPassword: data.adminPassword,
          roleId: await systemRoleId(tx, "org_admin"),
        });
      }
      return org.id;
    });
  } catch (err) {
    return { ...toErrorState(err), fields: { name: String(form.get("name") ?? "") } };
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/empresas/${orgId}`);
}

const updateSchema = orgSchema.pick({ name: true, segment: true, description: true, document: true, contactEmail: true, contactPhone: true }).extend({
  id: uuidSchema,
  timezone: z.string().trim().max(60).default("America/Sao_Paulo"),
  httpAllowlist: optionalText(2000),
});

export async function updateOrganizationAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requirePlatformUser();
    const data = parseForm(updateSchema, form);
    const allow = (data.httpAllowlist ?? "")
      .split(/[\s,]+/)
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    for (const d of allow) if (!/^(\*\.)?[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw new UserFacingError(`Domínio inválido: ${d}`);
    try {
      Intl.DateTimeFormat("pt-BR", { timeZone: data.timezone });
    } catch {
      throw new UserFacingError("Fuso horário inválido.");
    }
    await withPlatform(user.id, async (tx) => {
      const [current] = await tx.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, data.id));
      if (!current) throw new UserFacingError("Empresa não encontrada.");
      await tx
        .update(organizations)
        .set({
          name: data.name,
          segment: data.segment ?? null,
          description: data.description ?? null,
          document: data.document ?? null,
          contactEmail: data.contactEmail ?? null,
          contactPhone: data.contactPhone ?? null,
          timezone: data.timezone,
          settings: { ...current.settings, httpAllowlist: allow },
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, data.id));
      await audit(tx, { organizationId: data.id, actorUserId: user.id, action: "organization.updated", summary: "Dados da empresa atualizados", entityType: "organization", entityId: data.id });
    });
    revalidatePath(`/admin/empresas/${data.id}`);
    return { ok: "Dados salvos." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function setOrganizationStatusAction(orgId: string, status: "trial" | "active" | "suspended" | "canceled"): Promise<FormState> {
  try {
    const user = await requireSuperAdmin();
    uuidSchema.parse(orgId);
    z.enum(["trial", "active", "suspended", "canceled"]).parse(status);
    await withPlatform(user.id, async (tx) => {
      const [org] = await tx.update(organizations).set({ status, updatedAt: new Date() }).where(eq(organizations.id, orgId)).returning({ name: organizations.name });
      if (!org) throw new UserFacingError("Empresa não encontrada.");
      await audit(tx, { organizationId: orgId, actorUserId: user.id, action: "organization.status_changed", summary: `Status da empresa alterado para "${status}"`, metadata: { status } });
    });
    revalidatePath(`/admin/empresas/${orgId}`);
    return { ok: "Status atualizado." };
  } catch (err) {
    return toErrorState(err);
  }
}

// ---------------------------------------------------------------------------
// Membros (visão da plataforma)
// ---------------------------------------------------------------------------

const memberSchema = z.object({
  organizationId: uuidSchema,
  name: nameSchema,
  email: emailSchema,
  roleId: uuidSchema,
  tempPassword: passwordSchema.optional(),
  jobTitle: optionalText(80),
});

export async function adminAddMemberAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requirePlatformUser();
    const data = parseForm(memberSchema, form);
    const res = await withPlatform(user.id, (tx) => addMember(tx, user.id, data));
    revalidatePath(`/admin/empresas/${data.organizationId}`);
    return { ok: res.created ? "Pessoa adicionada com senha provisória." : "Pessoa já tinha conta e foi adicionada à empresa." };
  } catch (err) {
    return toErrorState(err);
  }
}

/** Gera um link de redefinição de senha (para quando o e-mail ainda não está configurado). */
export async function generateResetLinkAction(userId: string): Promise<FormState & { url?: string }> {
  try {
    const admin = await requireSuperAdmin();
    uuidSchema.parse(userId);
    const [u] = await withPlatform(admin.id, (tx) => tx.select({ email: users.email }).from(users).where(eq(users.id, userId)));
    if (!u) throw new UserFacingError("Usuário não encontrado.");
    const link = await createPasswordResetLink(u.email, admin.id);
    if (!link) throw new UserFacingError("Conta inativa ou removida.");
    const meta = await requestMeta();
    await withPlatform(admin.id, (tx) => audit(tx, { actorUserId: admin.id, action: "user.reset_link_generated", summary: `Link de redefinição gerado para ${u.email}`, ip: meta.ip }));
    return { ok: "Link gerado (válido por 1 hora, uso único).", url: link.url };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function setUserStatusAction(userId: string, status: "active" | "disabled"): Promise<FormState> {
  try {
    const admin = await requireSuperAdmin();
    uuidSchema.parse(userId);
    if (userId === admin.id) throw new UserFacingError("Você não pode desativar a própria conta.");
    await withPlatform(admin.id, async (tx) => {
      const [target] = await tx.select({ platformRole: users.platformRole, email: users.email }).from(users).where(eq(users.id, userId));
      if (!target) throw new UserFacingError("Usuário não encontrado.");
      if (status === "disabled" && target.platformRole === "super_admin") {
        const [others] = await tx
          .select({ n: count() })
          .from(users)
          .where(and(eq(users.platformRole, "super_admin"), eq(users.status, "active"), ne(users.id, userId)));
        if (Number(others.n) === 0) throw new UserFacingError("A plataforma precisa de ao menos um super administrador ativo.");
      }
      await tx.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, userId));
      await audit(tx, { actorUserId: admin.id, action: `user.${status === "active" ? "enabled" : "disabled"}`, summary: `Conta ${target.email} ${status === "active" ? "reativada" : "desativada"}`, entityType: "user", entityId: userId });
    });
    if (status === "disabled") await revokeAllUserSessions(userId);
    revalidatePath("/admin/usuarios");
    return { ok: status === "active" ? "Conta reativada." : "Conta desativada e sessões encerradas." };
  } catch (err) {
    return toErrorState(err);
  }
}

const staffSchema = z.object({ name: nameSchema, email: emailSchema, password: passwordSchema, platformRole: z.enum(["super_admin", "platform_staff"]) });

/** Cria conta da equipe interna da plataforma (nível 1). */
export async function createPlatformUserAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireSuperAdmin();
    const data = parseForm(staffSchema, form);
    const { hashPassword } = await import("@/server/auth/password");
    const passwordHash = await hashPassword(data.password);
    await withPlatform(admin.id, async (tx) => {
      const existing = await tx.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
      if (existing.length) throw new UserFacingError("Já existe uma conta com este e-mail.");
      const [u] = await tx.insert(users).values({ name: data.name, email: data.email, passwordHash, platformRole: data.platformRole }).returning({ id: users.id });
      await audit(tx, { actorUserId: admin.id, action: "user.platform_created", summary: `Conta da equipe da plataforma criada: ${data.email}`, entityType: "user", entityId: u.id });
    });
    revalidatePath("/admin/usuarios");
    return { ok: "Conta criada com senha provisória." };
  } catch (err) {
    return toErrorState(err);
  }
}

/** Papel de uma pessoa numa empresa (plataforma). */
export async function adminChangeMemberRoleAction(orgId: string, memberId: string, roleId: string): Promise<FormState> {
  try {
    const admin = await requirePlatformUser();
    [orgId, memberId, roleId].forEach((v) => uuidSchema.parse(v));
    await withPlatform(admin.id, (tx) => changeMemberRole(tx, admin.id, orgId, memberId, roleId));
    revalidatePath(`/admin/empresas/${orgId}`);
    return { ok: "Papel atualizado." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function adminSetMemberStatusAction(orgId: string, memberId: string, status: "active" | "disabled"): Promise<FormState> {
  try {
    const admin = await requirePlatformUser();
    [orgId, memberId].forEach((v) => uuidSchema.parse(v));
    z.enum(["active", "disabled"]).parse(status);
    await withPlatform(admin.id, (tx) => setMemberStatus(tx, admin.id, orgId, memberId, status));
    revalidatePath(`/admin/empresas/${orgId}`);
    return { ok: status === "active" ? "Acesso reativado." : "Acesso desativado." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function anonymizeUserAction(userId: string): Promise<FormState> {
  try {
    const admin = await requireSuperAdmin();
    uuidSchema.parse(userId);
    const { anonymizeUser } = await import("@/server/services/privacy");
    await withPlatform(admin.id, (tx) => anonymizeUser(tx, admin.id, userId));
    await revokeAllUserSessions(userId);
    revalidatePath("/admin/usuarios");
    return { ok: "Dados pessoais removidos (conta anonimizada)." };
  } catch (err) {
    return toErrorState(err);
  }
}
