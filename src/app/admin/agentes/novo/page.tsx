import type { Metadata } from "next";
import { requirePlatformUser } from "@/server/auth/guards";
import { builderOptions } from "@/server/queries/agents";
import { PageHeader } from "@/components/page-header";
import { NewAgentForm } from "./new-agent-form";

export const metadata: Metadata = { title: "Novo agente" };

export default async function NovoAgentePage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const user = await requirePlatformUser();
  const { org } = await searchParams;
  const opts = await builderOptions(user.id);
  return (
    <>
      <PageHeader eyebrow="Construtor de agentes" title="Novo agente" description="Escolha a empresa dona e, se quiser, um modelo de partida. Tudo pode ser personalizado depois." />
      <NewAgentForm orgs={opts.orgs} templates={opts.templates.map((t) => ({ key: t.key, name: t.name, description: t.description, category: t.category }))} defaultOrg={org} />
    </>
  );
}
