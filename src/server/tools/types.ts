import type { z } from "zod";

export type ToolRisk = "low" | "medium" | "high";

export type ToolContext = {
  orgId: string;
  orgTimezone: string;
  orgSettings: { httpAllowlist?: string[] };
  agentId: string;
  agentVersionId: string;
  executionId: string;
  /** Quem disparou a execução (pode ser nulo em gatilhos automáticos). */
  userId: string | null;
  knowledgeBaseIds: string[];
  /** Configuração da ferramenta neste agente (definida no Construtor). */
  config: Record<string, unknown>;
  isTest: boolean;
  signal: AbortSignal;
};

export type ToolResult = {
  /** Texto devolvido ao modelo. */
  content: string;
  /** Dados estruturados para o log da execução. */
  data?: unknown;
  isError?: boolean;
};

export type Availability = { ok: true } | { ok: false; reason: string };

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  /** Identificador estável (também é o nome enviado ao modelo). */
  key: string;
  name: string;
  /** Descrição para o modelo (o que faz e quando usar). */
  description: string;
  category: "conhecimento" | "dados" | "comunicação" | "crm" | "produtividade" | "web" | "integração" | "automação";
  input: S;
  risk: ToolRisk;
  /** Padrão de aprovação humana (pode ser sobrescrito por agente, exceto ferramentas "high", que sempre exigem). */
  requiresApproval: boolean | ((input: z.infer<S>) => boolean);
  /** Integração que precisa estar conectada para a ferramenta funcionar. */
  integration?: string;
  /** Texto curto do que será feito (mostrado ao aprovador). */
  summarize(input: z.infer<S>): string;
  /** Pode executar agora? (credenciais, integração, configuração). Nunca finge disponibilidade. */
  availability(ctx: Pick<ToolContext, "orgId" | "orgSettings" | "config">): Promise<Availability>;
  execute(ctx: ToolContext, input: z.infer<S>): Promise<ToolResult>;
  /** Tempo máximo de execução (ms). */
  timeoutMs?: number;
}

export const defineTool = <S extends z.ZodType>(def: ToolDefinition<S>) => def;
