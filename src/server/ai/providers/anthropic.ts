import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ToolResultInput, TurnRequest, TurnResult, StopKind } from "../types";
import { ProviderError } from "../types";
import { modelInfo } from "../models";

/**
 * Adaptador Anthropic (SDK oficial @anthropic-ai/sdk). Decisões, conforme a referência da API:
 * - thinking adaptativo é o padrão nos modelos atuais (não enviamos `thinking`); profundidade via output_config.effort;
 * - `temperature` não é enviado aos modelos novos (rejeitado);
 * - prompt caching automático (cache_control no topo): o prompt de sistema e as ferramentas são estáveis;
 * - `fallbacks: "default"` nos modelos que suportam: uma recusa por política é reprocessada no modelo alternativo;
 * - o conteúdo do assistente volta ao histórico sem alterações (blocos de raciocínio preservados).
 */
export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic" as const;
  private client: Anthropic;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new Anthropic({ apiKey, baseURL: baseURL || undefined, maxRetries: 2, timeout: 10 * 60 * 1000 });
  }

  userMessage(text: string) {
    return { role: "user", content: text } satisfies Anthropic.Beta.BetaMessageParam;
  }

  toolResultsMessage(results: ToolResultInput[]) {
    // Todos os resultados de uma rodada vão juntos numa única mensagem do usuário.
    return [
      {
        role: "user",
        content: results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.id, content: r.content, is_error: r.isError || undefined })),
      } satisfies Anthropic.Beta.BetaMessageParam,
    ];
  }

  async createTurn(req: TurnRequest): Promise<TurnResult> {
    const info = modelInfo(req.model);
    const body: Anthropic.Beta.MessageCreateParamsNonStreaming = {
      model: req.model,
      max_tokens: req.params.maxTokens,
      system: req.system,
      messages: req.transcript as Anthropic.Beta.BetaMessageParam[],
      cache_control: { type: "ephemeral" },
      ...(req.tools.length
        ? {
            tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema })),
          }
        : {}),
      ...(req.params.effort && (info?.supportsEffort ?? true) ? { output_config: { effort: req.params.effort } } : {}),
      ...(req.params.temperature !== undefined && info?.supportsTemperature ? { temperature: req.params.temperature } : {}),
      ...(info?.supportsFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    };
    let res: Anthropic.Beta.BetaMessage;
    try {
      res = await this.client.beta.messages.create(body, { signal: req.signal });
    } catch (err) {
      throw mapError(err);
    }
    const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    const toolCalls = res.content
      .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input }));
    const stopMap: Record<string, StopKind> = { end_turn: "end", tool_use: "tool_use", max_tokens: "max_tokens", refusal: "refusal", pause_turn: "pause", stop_sequence: "end" };
    const stop = stopMap[res.stop_reason ?? ""] ?? "other";
    return {
      text,
      toolCalls: stop === "tool_use" || toolCalls.length ? toolCalls : [],
      stop: toolCalls.length && stop !== "refusal" && stop !== "max_tokens" ? "tool_use" : stop,
      usage: {
        inputTokens: res.usage.input_tokens ?? 0,
        outputTokens: res.usage.output_tokens ?? 0,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
      },
      servedModel: res.model,
      assistantMessage: { role: "assistant", content: res.content },
      refusalDetail: stop === "refusal" ? (res.stop_details && "explanation" in res.stop_details ? String(res.stop_details.explanation ?? "") : "") : undefined,
    };
  }

  async ping(model: string) {
    try {
      await this.client.messages.create({ model, max_tokens: 16, messages: [{ role: "user", content: "Responda apenas: ok" }] });
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: mapError(err).message };
    }
  }
}

function mapError(err: unknown): ProviderError {
  if (err instanceof Anthropic.AuthenticationError) return new ProviderError("Chave da Anthropic inválida ou sem permissão.", false, 401);
  if (err instanceof Anthropic.PermissionDeniedError) return new ProviderError("A chave não tem permissão para este modelo/recurso.", false, 403);
  if (err instanceof Anthropic.NotFoundError) return new ProviderError("Modelo não encontrado no provedor.", false, 404);
  if (err instanceof Anthropic.BadRequestError) return new ProviderError(`Requisição recusada pelo provedor: ${err.message}`, false, 400);
  if (err instanceof Anthropic.RateLimitError) return new ProviderError("Limite de uso do provedor atingido; nova tentativa em breve.", true, 429);
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError("Falha de conexão com o provedor de IA.", true);
  if (err instanceof Anthropic.APIError) return new ProviderError(`Erro do provedor (${err.status}).`, (err.status ?? 500) >= 500, err.status);
  if (err instanceof Error && err.name === "AbortError") return new ProviderError("Tempo limite atingido na chamada ao provedor.", false);
  return new ProviderError(err instanceof Error ? err.message : "Erro desconhecido do provedor.", false);
}
