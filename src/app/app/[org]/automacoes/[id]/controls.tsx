"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyIcon } from "lucide-react";
import { rotateWebhookTokenAction, runWorkflowNowAction, setWorkflowStatusAction } from "@/app/actions/workflows";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function StatusButtons({ slug, id, status }: { slug: string; id: string; status: string }) {
  return status === "active" ? (
    <ConfirmButton title="Pausar a automação?" description="Gatilhos por webhook e agenda deixam de disparar." confirmLabel="Pausar" onConfirm={() => setWorkflowStatusAction(slug, id, "paused")}>Pausar</ConfirmButton>
  ) : (
    <ConfirmButton variant="default" size="default" title="Ativar a automação?" description="Gatilhos por webhook e agenda passam a disparar execuções reais dos agentes." confirmLabel="Ativar" onConfirm={() => setWorkflowStatusAction(slug, id, "active")}>Ativar</ConfirmButton>
  );
}

export function RunNow({ slug, id }: { slug: string; id: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="grid gap-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Entrada ({{input}}), ex.: dados do lead" aria-label="Entrada da automação" />
      <Button disabled={pending} onClick={() => start(async () => { const r = await runWorkflowNowAction(slug, id, text); if (r?.error) toast.error(r.error); else { toast.success(r?.ok ?? "Disparada."); router.refresh(); } })}>Executar</Button>
    </div>
  );
}

export function WebhookToken({ slug, id, hasToken }: { slug: string; id: string; hasToken: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-2 grid gap-2">
      {token ? (
        <div className="flex gap-2">
          <Input readOnly value={token} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button variant="outline" aria-label="Copiar token" onClick={() => navigator.clipboard.writeText(token).then(() => toast.success("Token copiado."))}><CopyIcon /></Button>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">{hasToken ? "Token configurado (não é exibido novamente)." : "Nenhum token ainda."}</p>
      )}
      <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => { const r = await rotateWebhookTokenAction(slug, id); if (r?.error) toast.error(r.error); else if (r?.token) setToken(r.token); })}>
        {hasToken ? "Gerar novo token (invalida o anterior)" : "Gerar token"}
      </Button>
    </div>
  );
}
