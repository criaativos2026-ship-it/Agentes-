import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformUser } from "@/server/auth/guards";
import { executionOwner, getExecutionDetail } from "@/server/queries/executions";
import { PageHeader } from "@/components/page-header";
import { ExecutionDetail } from "@/components/executions/execution-detail";
import { ExecutionControls } from "@/components/executions/execution-controls";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Execução" };

export default async function AdminExecucaoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformUser();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const owner = await executionOwner(id);
  if (!owner) notFound();
  const d = await getExecutionDetail(owner.orgId, id);
  if (!d) notFound();
  return (
    <>
      <PageHeader eyebrow="Monitoramento" title={`Execução · ${d.agentName ?? "agente"}`} description={<Link href={`/app/${owner.slug}`} className="text-electric hover:underline">{owner.slug}</Link>} actions={<ExecutionControls slug={owner.slug} executionId={id} status={d.exec.status} canCancel canDecide approvals={d.approvals.filter((a) => a.status === "pending").map((a) => ({ id: a.id, summary: a.summary }))} />} />
      <ExecutionDetail d={d} showCost />
    </>
  );
}
