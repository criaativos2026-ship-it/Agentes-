"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { PencilIcon, PlusIcon } from "lucide-react";
import { deleteRoleAction, orgAddMemberAction, orgChangeMemberRoleAction, orgSetMemberStatusAction, saveRoleAction } from "@/app/actions/org-team";
import { Field, FormError, useFormFeedback } from "@/components/form";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";

type RoleOption = { id: string; name: string };

export function OrgMemberActions({ slug, member, roles }: { slug: string; member: { id: string; name: string; status: string; roleId: string }; roles: RoleOption[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label={`Papel de ${member.name}`}
        wrapperClassName="w-44"
        className="h-9 text-sm"
        defaultValue={member.roleId}
        disabled={pending}
        onChange={(e) => {
          const el = e.target;
          start(async () => {
            const res = await orgChangeMemberRoleAction(slug, member.id, el.value);
            if (res?.error) {
              toast.error(res.error);
              el.value = member.roleId;
            } else toast.success(res?.ok ?? "Papel atualizado.");
          });
        }}
      >
        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </NativeSelect>
      {member.status === "active" ? (
        <ConfirmButton variant="destructive" title={`Desativar o acesso de ${member.name}?`} description="A pessoa deixa de acessar a empresa imediatamente." confirmLabel="Desativar" onConfirm={() => orgSetMemberStatusAction(slug, member.id, "disabled")}>
          Desativar
        </ConfirmButton>
      ) : (
        <ConfirmButton title={`Reativar o acesso de ${member.name}?`} confirmLabel="Reativar" onConfirm={() => orgSetMemberStatusAction(slug, member.id, "active")}>
          Reativar
        </ConfirmButton>
      )}
    </div>
  );
}

export function OrgAddMember({ slug, roles }: { slug: string; roles: RoleOption[] }) {
  const [state, action] = useActionState(orgAddMemberAction, undefined);
  const ref = useFormFeedback(state);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Adicionar pessoa</CardTitle>
        <CardDescription>A pessoa entra com a senha provisória e pode trocá-la em Minha conta.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={ref} action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <input type="hidden" name="slug" value={slug} />
          <div className="sm:col-span-2 lg:col-span-5"><FormError state={state} /></div>
          <Field label="Nome" htmlFor="a-name"><Input id="a-name" name="name" required /></Field>
          <Field label="E-mail" htmlFor="a-email"><Input id="a-email" name="email" type="email" required /></Field>
          <Field label="Cargo (opcional)" htmlFor="a-job"><Input id="a-job" name="jobTitle" /></Field>
          <Field label="Papel" htmlFor="a-role">
            <NativeSelect id="a-role" name="roleId" defaultValue={roles.find((r) => r.name === "Usuário")?.id}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Senha provisória" htmlFor="a-pass" hint="Mín. 10 caracteres.">
            <Input id="a-pass" name="tempPassword" autoComplete="off" />
          </Field>
          <div className="sm:col-span-2 lg:col-span-5"><SubmitButton>Adicionar</SubmitButton></div>
        </form>
      </CardContent>
    </Card>
  );
}

type Catalog = { key: string; group: string; description: string }[];

export function RoleEditor({ slug, catalog, role }: { slug: string; catalog: Catalog; role?: { id: string; name: string; description: string | null; permissions: string[] } }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(saveRoleAction, undefined);
  useFormFeedback(state, { onSuccess: () => setOpen(false) });
  const groups = [...new Set(catalog.map((c) => c.group))];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {role ? (
          <Button variant="outline" size="sm"><PencilIcon /> Editar</Button>
        ) : (
          <Button variant="outline" className="w-fit"><PlusIcon /> Novo papel personalizado</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogTitle>{role ? `Editar papel "${role.name}"` : "Novo papel"}</DialogTitle>
        <DialogDescription>Escolha exatamente o que este papel pode fazer.</DialogDescription>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="slug" value={slug} />
          {role && <input type="hidden" name="roleId" value={role.id} />}
          <FormError state={state} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do papel" htmlFor="r-name"><Input id="r-name" name="name" defaultValue={role?.name} required /></Field>
            <Field label="Descrição" htmlFor="r-desc"><Input id="r-desc" name="description" defaultValue={role?.description ?? ""} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((g) => (
              <fieldset key={g} className="rounded-lg border border-line p-3">
                <legend className="px-1 text-xs font-semibold text-ink-muted">{g}</legend>
                <div className="grid gap-2">
                  {catalog.filter((c) => c.group === g).map((c) => (
                    <label key={c.key} className="flex items-start gap-2.5 text-sm">
                      <Checkbox name="permissions[]" value={c.key} defaultChecked={role?.permissions.includes(c.key)} className="mt-0.5" />
                      <span>{c.description}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div><SubmitButton>Salvar papel</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteRole({ slug, roleId, name }: { slug: string; roleId: string; name: string }) {
  return (
    <ConfirmButton variant="destructive" title={`Excluir o papel "${name}"?`} description="Só é possível excluir papéis sem pessoas vinculadas." confirmLabel="Excluir" onConfirm={() => deleteRoleAction(slug, roleId)}>
      Excluir
    </ConfirmButton>
  );
}
