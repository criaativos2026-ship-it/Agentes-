"use client";

import { setOrganizationStatusAction } from "@/app/actions/admin-orgs";
import { ConfirmButton } from "@/components/confirm-button";

export function OrgStatusActions({ orgId, status }: { orgId: string; status: string }) {
  if (status === "suspended" || status === "canceled" || status === "trial") {
    return (
      <ConfirmButton
        variant="outline"
        size="default"
        title="Ativar empresa?"
        description="A empresa e sua equipe voltam a ter acesso normal à plataforma."
        confirmLabel="Ativar"
        onConfirm={() => setOrganizationStatusAction(orgId, "active")}
      >
        Ativar
      </ConfirmButton>
    );
  }
  return (
    <ConfirmButton
      variant="destructive"
      size="default"
      title="Suspender empresa?"
      description="Os agentes da empresa deixam de executar tarefas. A equipe ainda consegue entrar para ver dados e a assinatura. Você pode reativar depois."
      confirmLabel="Suspender"
      onConfirm={() => setOrganizationStatusAction(orgId, "suspended")}
    >
      Suspender
    </ConfirmButton>
  );
}
