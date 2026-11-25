import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can, requireOrgPermission } from "@/server/auth/guards";
import { getExecutionDetail } from "@/server/queries/executions";
import { PageHeader } from "@/components/page-header";
import { ExecutionDetail } from "@/components/executions/execution-detail";
import { ExecutionControls } from "@/components/executions/execution-controls";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Execução" };

export default async function OrgExecutionPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await requireOrgPermission(org, "executions.view");
  if (!uuidSchema.safeParse(id).success) notFound();
  const d = await getExecutionDetail(ctx.org.id, id);
  if (!d || (d.exec.isTest && !ctx.viaPlatform)) notFound();
  if (!can(ctx, "executions.view_all") && d.exec.triggeredBy !== ctx.user.id) notFound();
  const own = d.exec.triggeredBy === ctx.user.id;
  return (
    <>
      <PageHeader
        eyebrow={ctx.org.name}
        title={`Execução · ${d.agentName ?? "agente"}`}
        actions={<ExecutionControls slug={ctx.org.slug} executionId={id} status={d.exec.status} canCancel={can(ctx, "executions.cancel") || own} canDecide={can(ctx, "approvals.decide")} approvals={d.approvals.filter((a) => a.status === "pending").map((a) => ({ id: a.id, summary: a.summary }))} />}
      />
      <ExecutionDetail d={d} tz={ctx.org.timezone} />
    </>
  );
}
