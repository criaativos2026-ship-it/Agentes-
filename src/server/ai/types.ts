/**
 * Interface neutra de provedores de IA. Cada adaptador converte para o formato nativo do SDK oficial.
 * O histórico de UMA execução (transcript) é guardado no formato nativo do provedor e só recebe
 * acréscimos (append-only) — exigência dos modelos que validam blocos de raciocínio reenviados.
 */
export type ProviderId = "anthropic" | "openai" | "openai_compatible";

export type ToolSpec = {
  name: string;
  description: string;
  /** JSON Schema (objeto) dos parâmetros. */
  inputSchema: Record<string, unknown>;
};

export type ToolCall = { id: string; name: string; input: unknown };
export type ToolResultInput = { id: string; name: string; content: string; isError?: boolean };

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

export type StopKind = "end" | "tool_use" | "max_tokens" | "refusal" | "pause" | "other";

export type TurnResult = {
  text: string;
  toolCalls: ToolCall[];
  stop: StopKind;
  usage: Usage;
  /** Modelo que efetivamente respondeu (pode diferir em caso de fallback). */
  servedModel: string;
  /** Mensagem do assistente no formato nativo (vai para o transcript sem alteração). */
  assistantMessage: unknown;
  refusalDetail?: string;
};

export type GenerationParams = {
  maxTokens: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  temperature?: number;
};

export type TurnRequest = {
  model: string;
  system: string;
  tools: ToolSpec[];
  transcript: unknown[];
  params: GenerationParams;
  signal?: AbortSignal;
};

export interface LLMProvider {
  readonly id: ProviderId;
  createTurn(req: TurnRequest): Promise<TurnResult>;
  userMessage(text: string): unknown;
  toolResultsMessage(results: ToolResultInput[]): unknown[];
  /** Teste de comunicação real com o provedor (usado antes de marcar a chave como verificada). */
  ping(model: string): Promise<{ ok: true } | { ok: false; error: string }>;
}

/** Erro do provedor com indicação de que vale tentar de novo (429, 5xx, rede). */
export class ProviderError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly status?: number) {
    super(message);
    this.name = "ProviderError";
  }
}
