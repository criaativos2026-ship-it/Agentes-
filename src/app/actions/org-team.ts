"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg, withPlatform } from "@/server/db/client";
import { organizationMembers, rolePermissions, roles } from "@/server/db/schema";
import { assertOrgPermission } from "@/server/auth/guards";
import { addMember } from "@/server/services/organizations";
import { changeMemberRole, setMemberStatus } from "@/server/services/members";
import { audit } from "@/server/audit/log";
import { ALL_PERMISSIONS, type Permission } from "@/server/rbac/catalog";
import { parseForm, toErrorState, UserFacingError } from "@/server/actions/result";
import { emailSchema, nameSchema, optionalText, passwordSchema, slugify, uuidSchema } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

const addSchema = z.object({
  slug: z.string(),
  name: nameSchema,
  email: emailSchema,
  roleId: uuidSchema,
  tempPassword: passwordSchema.optional(),
  jobTitle: optionalText(80),
});

export async function orgAddMemberAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const data = parseForm(addSchema, form);
    const ctx = await assertOrgPermission(data.slug, "members.manage");
    // E-mail é único na plataforma: a busca da conta precisa do escopo de sistema.
    // A empresa é fixada pela sessão (nunca vem do formulário).
    const res = await withPlatform(ctx.user.id, (tx) => addMember(tx, ctx.user.id, { ...data, organizationId: ctx.org.id }));
    revalidatePath(`/app/${ctx.org.slug}/equipe`);
    return { ok: res.created ? "Pessoa adicionada. Envie a senha provisória por um canal seguro." : "Pessoa já tinha conta na plataforma e foi vinculada à empresa." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function orgChangeMemberRoleAction(slug: string, memberId: string, roleId: string): Promise<FormState> {
  try {
    const ctx = await assertOrgPermission(slug, "members.manage");
    uuidSchema.parse(memberId);
    uuidSchema.parse(roleId);
    await withOrg(ctx.org.id, ctx.user.id, (tx) => changeMemberRole(tx, ctx.user.id, ctx.org.id, memberId, roleId));
    revalidatePath(`/app/${ctx.org.slug}/equipe`);
    return { ok: "Papel atualizado." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function orgSetMemberStatusAction(slug: string, memberId: string, status: "active" | "disabled"): Promise<FormState> {
  try {
    const ctx = await assertOrgPermission(slug, "members.manage");
    uuidSchema.parse(memberId);
    z.enum(["active", "disabled"]).parse(status);
    await withOrg(ctx.org.id, ctx.user.id, (tx) => setMemberStatus(tx, ctx.user.id, ctx.org.id, memberId, status));
    revalidatePath(`/app/${ctx.org.slug}/equipe`);
    return { ok: status === "active" ? "Acesso reativado." : "Acesso desativado." };
  } catch (err) {
    return toErrorState(err);
  }
}

const roleSchema = z.object({
  slug: z.string(),
  roleId: uuidSchema.optional(),
  name: z.string().trim().min(2, "Nome muito curto.").max(60),
  description: optionalText(200),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])).default([]),
});

export async function saveRoleAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const data = parseForm(roleSchema, form);
    const ctx = await assertOrgPermission(data.slug, "roles.manage");
    await withOrg(ctx.org.id, ctx.user.id, async (tx) => {
      let roleId = data.roleId;
      if (roleId) {
        const [r] = await tx.select().from(roles).where(and(eq(roles.id, roleId), eq(roles.organizationId, ctx.org.id)));
        if (!r) throw new UserFacingError("Papéis padrão não podem ser editados. Crie um papel personalizado.");
        await tx.update(roles).set({ name: data.name, description: data.description ?? null }).where(eq(roles.id, roleId));
        await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      } else {
        const key = `custom-${slugify(data.name)}-${Date.now().toString(36)}`;
        [{ id: roleId }] = await tx.insert(roles).values({ organizationId: ctx.org.id, key, name: data.name, description: data.description }).returning({ id: roles.id });
      }
      if (data.permissions.length) await tx.insert(rolePermissions).values(data.permissions.map((p) => ({ roleId: roleId!, permissionKey: p })));
      // Nunca deixar a empresa sem quem gerencia a equipe.
      if (data.roleId && !data.permissions.includes("members.manage")) {
        const { sql } = await import("drizzle-orm");
        const [left] = await tx.execute<{ n: number }>(sql`
          select count(*)::int as n from organization_members m
          where m.organization_id = ${ctx.org.id} and m.status = 'active'
            and exists (select 1 from role_permissions rp where rp.role_id = m.role_id and rp.permission_key = 'members.manage')`);
        if (Number(left.n) === 0) throw new UserFacingError("A empresa ficaria sem ninguém para gerenciar a equipe. Mantenha a permissão em algum papel ativo.");
      }
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, action: data.roleId ? "role.updated" : "role.created", summary: `Papel "${data.name}" ${data.roleId ? "atualizado" : "criado"}`, metadata: { permissions: data.permissions } });
    });
    // Permissões podem ter mudado: sessões continuam válidas, mas as permissões são relidas a cada requisição.
    revalidatePath(`/app/${ctx.org.slug}`, "layout");
    return { ok: "Papel salvo." };
  } catch (err) {
    return toErrorState(err);
  }
}

export async function deleteRoleAction(slug: string, roleId: string): Promise<FormState> {
  try {
    const ctx = await assertOrgPermission(slug, "roles.manage");
    uuidSchema.parse(roleId);
    await withOrg(ctx.org.id, ctx.user.id, async (tx) => {
      const [r] = await tx.select().from(roles).where(and(eq(roles.id, roleId), eq(roles.organizationId, ctx.org.id)));
      if (!r) throw new UserFacingError("Papel não encontrado (papéis padrão não podem ser excluídos).");
      const [used] = await tx.select({ n: count() }).from(organizationMembers).where(eq(organizationMembers.roleId, roleId));
      if (Number(used.n) > 0) throw new UserFacingError("Há pessoas com este papel. Troque o papel delas antes de excluir.");
      await tx.delete(roles).where(eq(roles.id, roleId));
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, action: "role.deleted", summary: `Papel "${r.name}" excluído` });
    });
    revalidatePath(`/app/${ctx.org.slug}/equipe`);
    return { ok: "Papel excluído." };
  } catch (err) {
    return toErrorState(err);
  }
}

