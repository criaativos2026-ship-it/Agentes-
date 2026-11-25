"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { CopyIcon, KeyRoundIcon } from "lucide-react";
import { adminAddMemberAction, adminChangeMemberRoleAction, adminSetMemberStatusAction, generateResetLinkAction } from "@/app/actions/admin-orgs";
import { Field, FormError, useFormFeedback } from "@/components/form";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";

type RoleOption = { id: string; name: string; isSystem: boolean };

export function MemberActions({
  orgId,
  member,
  roles,
  canResetLink,
}: {
  orgId: string;
  member: { id: string; userId: string; name: string; status: string; roleId: string };
  roles: RoleOption[];
  canResetLink: boolean;
}) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label={`Papel de ${member.name}`}
        wrapperClassName="w-44"
        className="h-9 text-sm"
        defaultValue={member.roleId}
        disabled={pending}
        onChange={(e) => {
          const roleId = e.target.value;
          start(async () => {
            const res = await adminChangeMemberRoleAction(orgId, member.id, roleId);
            if (res?.error) {
              toast.error(res.error);
              e.target.value = member.roleId;
            } else toast.success(res?.ok ?? "Papel atualizado.");
          });
        }}
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </NativeSelect>
      {canResetLink && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await generateResetLinkAction(member.userId);
              if (res?.error) toast.error(res.error);
              else if (res?.url) setLink(res.url);
            })
          }
        >
          <KeyRoundIcon /> Link de senha
        </Button>
      )}
      {member.status === "active" ? (
        <ConfirmButton
          variant="destructive"
          title={`Desativar o acesso de ${member.name}?`}
          description="A pessoa deixa de acessar esta empresa imediatamente. O histórico é mantido."
          confirmLabel="Desativar"
          onConfirm={() => adminSetMemberStatusAction(orgId, member.id, "disabled")}
        >
          Desativar
        </ConfirmButton>
      ) : (
        <ConfirmButton title={`Reativar o acesso de ${member.name}?`} confirmLabel="Reativar" onConfirm={() => adminSetMemberStatusAction(orgId, member.id, "active")}>
          Reativar
        </ConfirmButton>
      )}
      <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent>
          <DialogTitle>Link de redefinição de senha</DialogTitle>
          <DialogDescription>Envie este link para {member.name} por um canal seguro. Ele vale por 1 hora e só pode ser usado uma vez.</DialogDescription>
          <div className="flex gap-2">
            <Input readOnly value={link ?? ""} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button
              variant="outline"
              aria-label="Copiar link"
              onClick={() => {
                if (link) navigator.clipboard.writeText(link).then(() => toast.success("Link copiado."));
              }}
            >
              <CopyIcon />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AddMemberForm({ orgId, roles }: { orgId: string; roles: RoleOption[] }) {
  const [state, action] = useActionState(adminAddMemberAction, undefined);
  const ref = useFormFeedback(state);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Adicionar pessoa</CardTitle>
        <CardDescription>Se o e-mail já tiver conta na plataforma, a pessoa é apenas vinculada (a senha provisória é ignorada).</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={ref} action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <input type="hidden" name="organizationId" value={orgId} />
          <div className="sm:col-span-2 lg:col-span-5"><FormError state={state} /></div>
          <Field label="Nome" htmlFor="m-name"><Input id="m-name" name="name" required /></Field>
          <Field label="E-mail" htmlFor="m-email"><Input id="m-email" name="email" type="email" required /></Field>
          <Field label="Cargo (opcional)" htmlFor="m-job"><Input id="m-job" name="jobTitle" /></Field>
          <Field label="Papel" htmlFor="m-role">
            <NativeSelect id="m-role" name="roleId" defaultValue={roles.find((r) => r.name === "Usuário")?.id}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Senha provisória" htmlFor="m-pass" hint="Mín. 10 caracteres.">
            <Input id="m-pass" name="tempPassword" autoComplete="off" />
          </Field>
          <div className="sm:col-span-2 lg:col-span-5"><SubmitButton>Adicionar</SubmitButton></div>
        </form>
      </CardContent>
    </Card>
  );
}
