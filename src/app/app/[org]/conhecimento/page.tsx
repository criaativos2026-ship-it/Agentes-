import type { Metadata } from "next";
import { BookOpenIcon } from "lucide-react";
import { can, requireOrgPermission } from "@/server/auth/guards";
import { listKnowledge } from "@/server/queries/org";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { when } from "@/lib/format";
import { AddDocument, DeleteDocument, DeleteKb, NewKbForm, SearchTest } from "./kb-forms";

export const metadata: Metadata = { title: "Base de conhecimento" };

const SOURCE = { upload: "Arquivo", text: "Texto", faq: "Perguntas e respostas" } as const;

export default async function KnowledgePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrgPermission(org, "knowledge.view");
  const { kbs, vector } = await listKnowledge(ctx);
  const manage = can(ctx, "knowledge.manage");
  return (
    <>
      <PageHeader
        eyebrow={ctx.org.name}
        title="Base de conhecimento"
        description="Documentos que os agentes podem consultar. Ficam isolados na sua empresa; cada agente só acessa as bases liberadas para ele."
      />
      <p className="mb-4 text-xs text-ink-muted">
        Busca: {vector ? <Badge variant="success">híbrida (texto + vetorial)</Badge> : <Badge variant="warning">somente texto — busca vetorial pendente (chave de embeddings não configurada)</Badge>} · Formatos: PDF, DOCX, TXT, MD, CSV, XLSX (até 10 MB). Guardamos apenas o texto extraído, não o arquivo original.
      </p>
      {manage && <NewKbForm slug={ctx.org.slug} />}
      {kbs.length === 0 ? (
        <EmptyState icon={BookOpenIcon} title="Nenhuma base de conhecimento" description={manage ? "Crie uma base e envie os documentos da empresa." : "O administrador ainda não criou bases."} />
      ) : (
        <div className="mt-4 grid gap-4">
          {kbs.map((kb) => (
            <Card key={kb.id}>
              <CardHeader>
                <CardTitle>{kb.name}</CardTitle>
                <CardDescription>{kb.description ?? `${kb.docs.length} documento(s)`}</CardDescription>
                {manage && <div data-slot="card-action"><DeleteKb slug={ctx.org.slug} kbId={kb.id} name={kb.name} /></div>}
              </CardHeader>
              <CardContent className="grid gap-4">
                {kb.docs.length === 0 ? (
                  <p className="text-sm text-ink-muted">Nenhum documento ainda.</p>
                ) : (
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {kb.docs.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{d.title}</span>
                          <span className="block text-xs text-ink-subtle">
                            {SOURCE[d.source]} · {d.chunks} trechos{d.embedded ? " · vetorizado" : ""} · {when(d.createdAt, ctx.org.timezone)}
                          </span>
                          {d.error && <span className="block text-xs text-warning">{d.error}</span>}
                        </span>
                        <Badge variant={d.status === "ready" ? "success" : d.status === "error" ? "danger" : "electric"}>{d.status === "ready" ? "Pronto" : d.status === "error" ? "Erro" : "Processando"}</Badge>
                        {manage && <DeleteDocument slug={ctx.org.slug} documentId={d.id} title={d.title} />}
                      </li>
                    ))}
                  </ul>
                )}
                {manage && <AddDocument slug={ctx.org.slug} kbId={kb.id} />}
                <SearchTest slug={ctx.org.slug} kbId={kb.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
