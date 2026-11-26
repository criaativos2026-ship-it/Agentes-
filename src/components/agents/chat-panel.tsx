"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangleIcon, CheckCircle2Icon, CircleDashedIcon, Loader2Icon, SendIcon, WrenchIcon, XCircleIcon, ClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; tools?: { name: string; status: string }[]; executionId?: string | null };

type Live = {
  id: string;
  status: string;
  error: string | null;
  output: { text?: string } | null;
  steps: { id: string; type: string; name: string; status: string; durationMs: number | null; error: string | null }[];
  approvals: { id: string; summary: string; status: string }[];
};

type SendResult = { ok: true; conversationId: string; executionId: string } | { ok: false; error?: string };

const FINAL = new Set(["succeeded", "failed", "canceled", "timed_out"]);

function StepIcon({ status }: { status: string }) {
  if (status === "succeeded") return <CheckCircle2Icon className="size-3.5 text-success" />;
  if (status === "failed") return <XCircleIcon className="size-3.5 text-danger" />;
  if (status === "waiting") return <ClockIcon className="size-3.5 text-warning" />;
  if (status === "skipped") return <CircleDashedIcon className="size-3.5 text-ink-subtle" />;
  return <Loader2Icon className="size-3.5 animate-spin text-electric" />;
}

/** Texto do assistente com quebras de linha e links clicáveis (sem HTML do modelo). */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="text-electric underline underline-offset-2">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

export function ChatPanel({
  agentName,
  initialMessages,
  initialConversationId,
  send,
  approvalsHref,
  placeholder = "Escreva sua mensagem ou descreva a tarefa…",
  disabledReason,
}: {
  agentName: string;
  initialMessages: ChatMessage[];
  initialConversationId?: string;
  send: (input: { conversationId?: string; text: string; clientRequestId: string }) => Promise<SendResult>;
  approvalsHref?: string;
  placeholder?: string;
  disabledReason?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [live, setLive] = useState<Live | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, live]);

  // Acompanha a execução até terminar (ou ficar aguardando aprovação).
  useEffect(() => {
    if (!live || FINAL.has(live.status)) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/executions/${live.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Live;
        if (stop) return;
        if (FINAL.has(data.status)) {
          const reply =
            data.status === "succeeded"
              ? (data.output?.text ?? "")
              : data.status === "canceled"
                ? "Execução cancelada."
                : `⚠️ Não consegui concluir: ${data.error ?? "erro"}`;
          setMessages((m) => [...m, { id: `a-${data.id}`, role: "assistant", text: reply, tools: data.steps.filter((s) => s.type === "tool").map((s) => ({ name: s.name, status: s.status })), executionId: data.id }]);
          setLive(null);
        } else setLive(data);
      } catch {
        /* rede instável: tenta de novo no próximo ciclo */
      }
    };
    const iv = setInterval(tick, 1200);
    tick();
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [live?.id, live?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = pending || (!!live && !FINAL.has(live.status));
  const waiting = live?.status === "waiting_approval";

  function submit() {
    const value = text.trim();
    if (!value || busy || disabledReason) return;
    const clientRequestId = crypto.randomUUID();
    start(async () => {
      const res = await send({ conversationId, text: value, clientRequestId });
      if (!res.ok) {
        toast.error(res.error ?? "Não foi possível enviar.");
        return;
      }
      setText("");
      setConversationId(res.conversationId);
      setMessages((m) => [...m, { id: `u-${res.executionId}`, role: "user", text: value }]);
      setLive({ id: res.executionId, status: "queued", error: null, output: null, steps: [], approvals: [] });
    });
  }

  return (
    <div className="flex h-[min(70dvh,720px)] min-h-[420px] flex-col overflow-hidden rounded-xl border border-line bg-surface/80">
      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && !live && (
          <div className="grid h-full place-items-center text-center text-sm text-ink-muted">
            <div>
              <p className="font-medium text-ink">Converse com {agentName}</p>
              <p className="mt-1">Faça uma pergunta ou peça uma tarefa. Os passos do agente aparecem em tempo real.</p>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[88%] rounded-xl px-4 py-2.5", m.role === "user" ? "bg-ink text-on-brand [&_a]:text-on-brand" : "border border-line bg-bg-alt")}>
              {m.tools && m.tools.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-1.5">
                  {m.tools.map((t, i) => (
                    <li key={i} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-muted">
                      <WrenchIcon className="size-3" /> {t.name} <StepIcon status={t.status} />
                    </li>
                  ))}
                </ul>
              )}
              <RichText text={m.text} />
              {m.executionId && m.role === "assistant" && <p className="mt-1 text-[10px] text-ink-subtle">execução {m.executionId.slice(0, 8)}</p>}
            </div>
          </div>
        ))}
        {live && (
          <div className="max-w-[88%] rounded-xl border border-line bg-bg-alt px-4 py-3">
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              {waiting ? <AlertTriangleIcon className="size-4 text-warning" /> : <Loader2Icon className="size-4 animate-spin text-electric" />}
              {live.status === "queued" ? "Na fila…" : waiting ? "Aguardando aprovação humana" : `${agentName} está trabalhando…`}
            </p>
            {live.steps.length > 0 && (
              <ol className="mt-2 space-y-1">
                {live.steps.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-xs text-ink-muted">
                    <StepIcon status={s.status} /> {s.name}
                    {s.error && <span className="truncate text-danger">— {s.error}</span>}
                  </li>
                ))}
              </ol>
            )}
            {waiting && (
              <div className="mt-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">
                {live.approvals.filter((a) => a.status === "pending").map((a) => (
                  <p key={a.id}>• {a.summary}</p>
                ))}
                {approvalsHref && (
                  <Link href={approvalsHref} className="mt-1 inline-block font-semibold underline">
                    Ir para Aprovações
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {disabledReason && <p className="mb-2 text-xs text-warning">{disabledReason}</p>}
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            aria-label="Mensagem"
            className="max-h-40 min-h-11"
            rows={1}
            disabled={!!disabledReason}
          />
          <Button type="submit" size="icon" className="size-11 shrink-0" disabled={busy || !text.trim() || !!disabledReason} aria-label="Enviar">
            {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          </Button>
        </div>
      </form>
    </div>
  );
}
