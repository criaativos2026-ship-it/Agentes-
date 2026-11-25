import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireOrgPermission } from "@/server/auth/guards";
import { withOrg } from "@/server/db/client";
import { reports } from "@/server/db/schema";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PrintButton } from "@/components/print-button";
import { uuidSchema } from "@/lib/validation";
import { when } from "@/lib/format";

export const metadata: Metadata = { title: "Relatório" };

export default async function RelatorioPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await requireOrgPermission(org, "reports.view");
  if (!uuidSchema.safeParse(id).success) notFound();
  const [r] = await withOrg(ctx.org.id, ctx.user.id, (tx) => tx.select().from(reports).where(eq(reports.id, id)));
  if (!r) notFound();
  return (
    <>
      <PageHeader eyebrow="Relatório" title={r.title} description={when(r.createdAt, ctx.org.timezone)} actions={<PrintButton />} />
      <Card><CardContent><div className="text-sm leading-relaxed whitespace-pre-wrap">{r.content}</div></CardContent></Card>
    </>
  );
}
