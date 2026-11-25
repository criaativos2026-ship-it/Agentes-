import type { Metadata } from "next";
import { requirePlatformUser } from "@/server/auth/guards";
import { PageHeader } from "@/components/page-header";
import { NewOrgForm } from "./new-org-form";

export const metadata: Metadata = { title: "Nova empresa" };

export default async function NovaEmpresaPage() {
  await requirePlatformUser();
  return (
    <>
      <PageHeader eyebrow="Clientes" title="Cadastrar empresa" description="Crie o ambiente privado da empresa e, se quiser, o primeiro administrador dela." />
      <NewOrgForm />
    </>
  );
}
