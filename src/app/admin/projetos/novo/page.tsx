import type { Metadata } from "next";
import { isNotNull } from "drizzle-orm";
import { requirePlatformUser } from "@/server/auth/guards";
import { withPlatform } from "@/server/db/client";
import { organizations, users } from "@/server/db/schema";
import { INTEGRATIONS } from "@/server/integrations/catalog";
import { PageHeader } from "@/components/page-header";
import { ProjectForm } from "../project-form";

export const metadata: Metadata = { title: "Novo projeto" };

export default async function NovoProjetoPage() {
  const user = await requirePlatformUser();
  const { orgs, staff } = await withPlatform(user.id, async (tx) => ({
    orgs: await tx.select({ id: organizations.id, name: organizations.name }).from(organizations).orderBy(organizations.name),
    staff: await tx.select({ id: users.id, name: users.name }).from(users).where(isNotNull(users.platformRole)).orderBy(users.name),
  }));
  if (!orgs.length) return <p className="text-sm text-ink-muted">Cadastre a empresa antes de criar o projeto.</p>;
  return (
    <>
      <PageHeader eyebrow="Projetos personalizados" title="Novo projeto" />
      <ProjectForm orgs={orgs} staff={staff} integrations={INTEGRATIONS.map((i) => ({ key: i.key, name: i.name }))} />
    </>
  );
}
