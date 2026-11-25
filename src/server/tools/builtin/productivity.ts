import "server-only";
import { z } from "zod";
import { desc, ilike, or } from "drizzle-orm";
import { withOrg } from "@/server/db/client";
import { crmOpportunities, reports, tasks } from "@/server/db/schema";
import { defineTool } from "../types";

const ok = async () => ({ ok: true as const });

export const createTask = defineTool({
  key: "create_task",
  name: "Criar tarefa",
  description: "Cria uma tarefa interna na empresa (para acompanhamento da equipe). Use para registrar pendências, encaminhamentos a humanos e próximos passos.",
  category: "produtividade",
  input: z.object({
    title: z.string().trim().min(3).max(200).describe("Título curto da tarefa"),
    description: z.string().trim().max(4000).optional().describe("Detalhes e contexto"),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Prazo no formato AAAA-MM-DD"),
  }),
  risk: "low",
  requiresApproval: false,
  summarize: (i) => `Criar tarefa "${i.title}"`,
  availability: ok,
  async execute(ctx, input) {
    const [t] = await withOrg(ctx.orgId, ctx.userId, (tx) =>
      tx
        .insert(tasks)
        .values({
          organizationId: ctx.orgId,
          title: input.title,
          description: input.description,
          dueAt: input.due_date ? new Date(`${input.due_date}T12:00:00Z`) : null,
          agentId: ctx.agentId,
          executionId: ctx.executionId,
          createdBy: ctx.userId,
        })
        .returning({ id: tasks.id }),
    );
    return { content: `Tarefa criada (id ${t.id}).`, data: { taskId: t.id } };
  },
});

export const createReport = defineTool({
  key: "create_report",
  name: "Criar relatório",
  description: "Salva um relatório em Markdown na área de Relatórios da empresa. Use para entregar análises, resumos e resultados de pesquisas.",
  category: "produtividade",
  input: z.object({
    title: z.string().trim().min(3).max(200),
    content_markdown: z.string().trim().min(10).max(60000).describe("Conteúdo completo do relatório em Markdown"),
  }),
  risk: "low",
  requiresApproval: false,
  summarize: (i) => `Salvar relatório "${i.title}"`,
  availability: ok,
  async execute(ctx, input) {
    const [r] = await withOrg(ctx.orgId, ctx.userId, (tx) =>
      tx.insert(reports).values({ organizationId: ctx.orgId, title: input.title, content: input.content_markdown, executionId: ctx.executionId, agentId: ctx.agentId, createdBy: ctx.userId }).returning({ id: reports.id }),
    );
    return { content: `Relatório salvo (id ${r.id}).`, data: { reportId: r.id } };
  },
});

export const crmRegisterOpportunity = defineTool({
  key: "crm_register_opportunity",
  name: "Registrar oportunidade (CRM interno)",
  description: "Registra uma oportunidade/lead no CRM interno da empresa. Use SOMENTE com dados obtidos de fontes reais (mensagens, documentos, pesquisas) — nunca invente contatos.",
  category: "crm",
  input: z.object({
    name: z.string().trim().min(2).max(160).describe("Nome do contato ou da oportunidade"),
    company: z.string().trim().max(160).optional(),
    contact: z.string().trim().max(200).optional().describe("E-mail ou telefone, se informado pela fonte"),
    source: z.string().trim().max(200).optional().describe("De onde veio a informação"),
    stage: z.enum(["novo", "qualificado", "proposta", "negociacao", "ganho", "perdido"]).default("novo"),
    score: z.number().int().min(0).max(100).optional().describe("Potencial de 0 a 100"),
    notes: z.string().trim().max(4000).optional(),
  }),
  risk: "low",
  requiresApproval: false,
  summarize: (i) => `Registrar oportunidade "${i.name}"${i.company ? ` (${i.company})` : ""}`,
  availability: ok,
  async execute(ctx, input) {
    const [o] = await withOrg(ctx.orgId, ctx.userId, (tx) =>
      tx.insert(crmOpportunities).values({ organizationId: ctx.orgId, ...input, executionId: ctx.executionId }).returning({ id: crmOpportunities.id }),
    );
    return { content: `Oportunidade registrada (id ${o.id}).`, data: { opportunityId: o.id } };
  },
});

export const crmSearch = defineTool({
  key: "crm_search_opportunities",
  name: "Consultar oportunidades (CRM interno)",
  description: "Lista oportunidades do CRM interno, opcionalmente filtrando por texto (nome, empresa ou observações).",
  category: "crm",
  input: z.object({ query: z.string().trim().max(120).optional(), limit: z.number().int().min(1).max(50).default(20) }),
  risk: "low",
  requiresApproval: false,
  summarize: (i) => `Consultar oportunidades${i.query ? ` com "${i.query}"` : ""}`,
  availability: ok,
  async execute(ctx, input) {
    const rows = await withOrg(ctx.orgId, ctx.userId, (tx) => {
      const term = input.query ? `%${input.query.replace(/[%_]/g, "")}%` : null;
      return tx
        .select({ id: crmOpportunities.id, name: crmOpportunities.name, company: crmOpportunities.company, stage: crmOpportunities.stage, score: crmOpportunities.score, createdAt: crmOpportunities.createdAt })
        .from(crmOpportunities)
        .where(term ? or(ilike(crmOpportunities.name, term), ilike(crmOpportunities.company, term), ilike(crmOpportunities.notes, term)) : undefined)
        .orderBy(desc(crmOpportunities.createdAt))
        .limit(input.limit);
    });
    return { content: rows.length ? JSON.stringify(rows) : "Nenhuma oportunidade encontrada.", data: { count: rows.length } };
  },
});

export const currentDatetime = defineTool({
  key: "current_datetime",
  name: "Data e hora atuais",
  description: "Informa a data e a hora atuais no fuso horário da empresa.",
  category: "produtividade",
  input: z.object({}),
  risk: "low",
  requiresApproval: false,
  summarize: () => "Consultar data e hora",
  availability: ok,
  async execute(ctx) {
    const now = new Date();
    const text = new Intl.DateTimeFormat("pt-BR", { timeZone: ctx.orgTimezone, dateStyle: "full", timeStyle: "short" }).format(now);
    return { content: `${text} (${ctx.orgTimezone})`, data: { iso: now.toISOString() } };
  },
});
