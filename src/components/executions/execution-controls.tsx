"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, XIcon } from "lucide-react";
import { cancelExecutionAction, decideApprovalAction } from "@/app/actions/executions";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ApprovalButtons({ slug, approvalId, summary }: { slug: string; approvalId: string; summary: string }) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const router = useRouter();
  const decide = (d: "approved" | "rejected") =>
    start(async () => {
      const res = await decideApprovalAction(slug, approvalId, d, reason);
      if (res?.error) toast.error(res.error);
      else toast.success(res?.ok ?? "Decisão registrada.");
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (opcional)" className="h-9 w-56 text-sm" aria-label={`Motivo para ${summary}`} />
      <Button size="sm" variant="electric" disabled={pending} onClick={() => decide("approved")}><CheckIcon /> Aprovar</Button>
      <Button size="sm" variant="destructive" disabled={pending} onClick={() => decide("rejected")}><XIcon /> Recusar</Button>
    </div>
  );
}

export function ExecutionControls({ slug, executionId, status, canCancel, canDecide, approvals }: { slug: string; executionId: string; status: string; canCancel: boolean; canDecide: boolean; approvals: { id: string; summary: string }[] }) {
  const router = useRouter();
  const active = ["queued", "running", "waiting_approval", "waiting"].includes(status);
  return (
    <div className="flex flex-col items-end gap-2">
      {canDecide && approvals.map((a) => (
        <div key={a.id} className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-right">
          <p className="mb-1.5 text-xs text-warning">{a.summary}</p>
          <ApprovalButtons slug={slug} approvalId={a.id} summary={a.summary} />
        </div>
      ))}
      {canCancel && active && (
        <ConfirmButton
          variant="destructive"
          size="default"
          title="Cancelar esta execução?"
          description="Se estiver em andamento, o agente para no próximo passo. Ações já realizadas não são desfeitas."
          confirmLabel="Cancelar execução"
          onConfirm={async () => {
            const r = await cancelExecutionAction(slug, executionId);
            router.refresh();
            return r;
          }}
        >
          Cancelar execução
        </ConfirmButton>
      )}
    </div>
  );
}
