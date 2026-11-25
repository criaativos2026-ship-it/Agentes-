"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { SearchIcon, UploadIcon } from "lucide-react";
import { addTextDocumentAction, createKnowledgeBaseAction, deleteDocumentAction, deleteKnowledgeBaseAction, searchTestAction, uploadDocumentAction } from "@/app/actions/knowledge";
import { Field, FormError, useFormFeedback } from "@/components/form";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export function NewKbForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(createKnowledgeBaseAction, undefined);
  const ref = useFormFeedback(state);
  return (
    <Card>
      <CardContent>
        <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
          <input type="hidden" name="slug" value={slug} />
          <div className="sm:col-span-3"><FormError state={state} /></div>
          <Field label="Nova base de conhecimento" htmlFor="kb-name"><Input id="kb-name" name="name" placeholder="Ex.: Políticas comerciais" required /></Field>
          <Field label="Descrição (opcional)" htmlFor="kb-desc"><Input id="kb-desc" name="description" /></Field>
          <SubmitButton>Criar base</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function AddDocument({ slug, kbId }: { slug: string; kbId: string }) {
  const [upState, upAction] = useActionState(uploadDocumentAction, undefined);
  const upRef = useFormFeedback(upState);
  const [txState, txAction] = useActionState(addTextDocumentAction, undefined);
  const txRef = useFormFeedback(txState);
  return (
    <Tabs defaultValue="arquivo">
      <TabsList>
        <TabsTrigger value="arquivo"><UploadIcon /> Enviar arquivos</TabsTrigger>
        <TabsTrigger value="texto">Colar texto / Perguntas e respostas</TabsTrigger>
      </TabsList>
      <TabsContent value="arquivo" className="mt-3">
        <form ref={upRef} action={upAction} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="knowledgeBaseId" value={kbId} />
          <div className="sm:col-span-2"><FormError state={upState} /></div>
          <Input type="file" name="files" multiple accept=".pdf,.docx,.txt,.md,.csv,.xlsx" aria-label="Arquivos" required />
          <SubmitButton pendingText="Processando…">Enviar</SubmitButton>
        </form>
      </TabsContent>
      <TabsContent value="texto" className="mt-3">
        <form ref={txRef} action={txAction} className="grid gap-3">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="knowledgeBaseId" value={kbId} />
          <FormError state={txState} />
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <Field label="Título" htmlFor={`t-${kbId}`}><Input id={`t-${kbId}`} name="title" required /></Field>
            <Field label="Tipo" htmlFor={`k-${kbId}`}>
              <NativeSelect id={`k-${kbId}`} name="kind" defaultValue="text">
                <option value="text">Texto livre</option>
                <option value="faq">Perguntas e respostas</option>
              </NativeSelect>
            </Field>
          </div>
          <Field label="Conteúdo" htmlFor={`c-${kbId}`} hint='Para perguntas e respostas, use linhas "P: pergunta" e "R: resposta".'>
            <Textarea id={`c-${kbId}`} name="content" rows={6} required />
          </Field>
          <div><SubmitButton>Adicionar</SubmitButton></div>
        </form>
      </TabsContent>
    </Tabs>
  );
}

export function SearchTest({ slug, kbId }: { slug: string; kbId: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ title: string; method: string; content: string }[] | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="rounded-lg border border-dashed border-line-strong p-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await searchTestAction(slug, kbId, q);
            if (!r.ok) toast.error(r.error ?? "Falha na busca.");
            else setHits(r.hits);
          });
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Testar a busca: o que um agente perguntaria?" aria-label="Testar busca" />
        <Button type="submit" variant="outline" disabled={pending || q.trim().length < 2} aria-label="Buscar"><SearchIcon /></Button>
      </form>
      {hits && (
        <ul className="mt-3 grid gap-2">
          {hits.length === 0 && <li className="text-sm text-ink-muted">Nenhum trecho encontrado.</li>}
          {hits.map((h, i) => (
            <li key={i} className="rounded-md bg-bg-alt p-2.5 text-xs">
              <p className="mb-1 font-medium text-ink">{h.title} <Badge className="ml-1">{h.method}</Badge></p>
              <p className="whitespace-pre-wrap text-ink-muted">{h.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DeleteDocument({ slug, documentId, title }: { slug: string; documentId: string; title: string }) {
  return (
    <ConfirmButton variant="destructive" title={`Remover "${title}"?`} description="Os agentes deixam de consultar este conteúdo." confirmLabel="Remover" onConfirm={() => deleteDocumentAction(slug, documentId)}>
      Remover
    </ConfirmButton>
  );
}

export function DeleteKb({ slug, kbId, name }: { slug: string; kbId: string; name: string }) {
  return (
    <ConfirmButton variant="destructive" title={`Excluir a base "${name}"?`} description="Todos os documentos dela serão apagados. Só é possível se nenhum agente estiver usando." confirmLabel="Excluir base" onConfirm={() => deleteKnowledgeBaseAction(slug, kbId)}>
      Excluir base
    </ConfirmButton>
  );
}
