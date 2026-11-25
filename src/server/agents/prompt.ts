import "server-only";
import type { AgentVersion } from "@/server/db/schema";
import { SECURITY_POLICY } from "@/server/security/prompt-guard";

/**
 * Monta o prompt de sistema do agente. Fica ESTÁVEL entre chamadas (sem data/hora ou IDs variáveis),
 * para aproveitar o cache de prompt dos provedores; o contexto variável vai na mensagem do usuário.
 */
export function buildSystemPrompt(input: {
  agent: { name: string; objective: string | null; description: string | null };
  version: Pick<AgentVersion, "systemPrompt" | "instructions" | "personality" | "language" | "boundaries">;
  orgName: string;
  toolNames: string[];
  hasKnowledge: boolean;
}) {
  const v = input.version;
  const parts = [
    `Você é "${input.agent.name}", um agente de inteligência artificial da empresa ${input.orgName}, operando na plataforma NEXUS AI.`,
    input.agent.objective ? `## Objetivo principal\n${input.agent.objective}` : "",
    input.agent.description ? `## Sobre você\n${input.agent.description}` : "",
    v.systemPrompt ? `## Instruções do agente\n${v.systemPrompt}` : "",
    v.instructions ? `## Instruções complementares\n${v.instructions}` : "",
    v.personality ? `## Personalidade e tom\n${v.personality}` : "",
    v.boundaries ? `## Limites de atuação (não ultrapasse)\n${v.boundaries}` : "",
    `## Idioma\nResponda sempre em ${v.language === "pt-BR" ? "português do Brasil" : v.language}, salvo pedido explícito do usuário.`,
    input.toolNames.length
      ? `## Ferramentas\nVocê pode usar: ${input.toolNames.join(", ")}. Use-as quando ajudarem a cumprir a tarefa com dados reais. Algumas ações passam por aprovação humana antes de acontecer; se uma ação for recusada, explique e siga sem ela.`
      : "## Ferramentas\nVocê não tem ferramentas: responda apenas com base na conversa.",
    input.hasKnowledge ? "Para dúvidas sobre a empresa, consulte a base de conhecimento (knowledge_search) antes de responder e diga quando a informação não estiver lá." : "",
    SECURITY_POLICY,
  ];
  return parts.filter(Boolean).join("\n\n");
}

/** Mensagem do usuário com o contexto variável (data/hora, canal). */
export function wrapUserTurn(text: string, ctx: { timezone: string; userName?: string | null; channel: string }) {
  const now = new Intl.DateTimeFormat("pt-BR", { timeZone: ctx.timezone, dateStyle: "full", timeStyle: "short" }).format(new Date());
  return `[Contexto: ${now} (${ctx.timezone}); canal: ${ctx.channel}${ctx.userName ? `; usuário: ${ctx.userName}` : ""}]\n\nMensagem:\n${text}`;
}
