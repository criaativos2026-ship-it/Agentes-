"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { CopyIcon } from "lucide-react";
import { anonymizeUserAction, createPlatformUserAction, generateResetLinkAction, setUserStatusAction } from "@/app/actions/admin-orgs";
import { ConfirmButton } from "@/components/confirm-button";
import { Field, FormError, useFormFeedback } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";

export function UserRowActions({ userId, name, status, deletionRequested }: { userId: string; name: string; status: string; deletionRequested: boolean }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await generateResetLinkAction(userId);
            if (res?.error) toast.error(res.error);
            else if (res?.url) setLink(res.url);
          })
        }
      >
        Link de senha
      </Button>
      {status === "active" ? (
        <ConfirmButton variant="destructive" title={`Desativar a conta de ${name}?`} description="A pessoa perde o acesso a todas as empresas imediatamente e as sessões abertas são encerradas." confirmLabel="Desativar" onConfirm={() => setUserStatusAction(userId, "disabled")}>
          Desativar
        </ConfirmButton>
      ) : (
        <ConfirmButton title={`Reativar a conta de ${name}?`} confirmLabel="Reativar" onConfirm={() => setUserStatusAction(userId, "active")}>
          Reativar
        </ConfirmButton>
      )}
      {deletionRequested && (
        <ConfirmButton
          variant="destructive"
          title={`Excluir os dados de ${name}?`}
          description="Ação IRREVERSÍVEL (LGPD): nome, e-mail e senha são apagados e a pessoa não consegue mais entrar. Os registros operacionais continuam, sem identificá-la."
          confirmLabel="Excluir dados"
          onConfirm={() => anonymizeUserAction(userId)}
        >
          Excluir dados
        </ConfirmButton>
      )}
      <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent>
          <DialogTitle>Link de redefinição de senha</DialogTitle>
          <DialogDescription>Envie para {name} por um canal seguro. Vale por 1 hora e é de uso único.</DialogDescription>
          <div className="flex gap-2">
            <Input readOnly value={link ?? ""} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button variant="outline" aria-label="Copiar link" onClick={() => link && navigator.clipboard.writeText(link).then(() => toast.success("Link copiado."))}>
              <CopyIcon />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function NewStaffForm() {
  const [state, action] = useActionState(createPlatformUserAction, undefined);
  const ref = useFormFeedback(state);
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Nova conta da equipe NEXUS</CardTitle>
        <CardDescription>Acesso ao painel administrativo. &quot;Equipe NEXUS&quot; não altera planos, cobranças nem configurações gerais.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={ref} action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4"><FormError state={state} /></div>
          <Field label="Nome" htmlFor="s-name"><Input id="s-name" name="name" required /></Field>
          <Field label="E-mail" htmlFor="s-email"><Input id="s-email" name="email" type="email" required /></Field>
          <Field label="Senha provisória" htmlFor="s-pass"><Input id="s-pass" name="password" autoComplete="off" required minLength={10} /></Field>
          <Field label="Nível" htmlFor="s-role">
            <NativeSelect id="s-role" name="platformRole" defaultValue="platform_staff">
              <option value="platform_staff">Equipe NEXUS</option>
              <option value="super_admin">Super administrador</option>
            </NativeSelect>
          </Field>
          <div><SubmitButton>Criar conta</SubmitButton></div>
        </form>
      </CardContent>
    </Card>
  );
}
