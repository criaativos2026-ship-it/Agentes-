import "server-only";
import OpenAI from "openai";
import type { LLMProvider, ProviderId, ToolResultInput, TurnRequest, TurnResult } from "../types";
import { ProviderError } from "../types";

/**
 * Adaptador OpenAI (SDK oficial `openai`, Chat Completions com ferramentas). Também atende provedores
 * compatíveis com a API da OpenAI via baseURL (OpenRouter, Groq, Ollama…).
 */
export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  constructor(readonly id: ProviderId, apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL: baseURL || undefined, maxRetries: 2, timeout: 10 * 60 * 1000 });
  }

  userMessage(text: string) {
    return { role: "user", content: text } satisfies OpenAI.Chat.ChatCompletionMessageParam;
  }

  toolResultsMessage(results: ToolResultInput[]) {
    return results.map((r) => ({ role: "tool" as const, tool_call_id: r.id, content: r.isError ? `ERRO: ${r.content}` : r.content }) satisfies OpenAI.Chat.ChatCompletionMessageParam);
  }

  async createTurn(req: TurnRequest): Promise<TurnResult> {
    let res: OpenAI.Chat.ChatCompletion;
    try {
      res = await this.client.chat.completions.create(
        {
          model: req.model,
          max_completion_tokens: req.params.maxTokens,
          messages: [{ role: "system", content: req.system }, ...(req.transcript as OpenAI.Chat.ChatCompletionMessageParam[])],
          ...(req.tools.length
            ? { tools: req.tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.inputSchema } })) }
            : {}),
          ...(req.params.temperature !== undefined ? { temperature: req.params.temperature } : {}),
        },
        { signal: req.signal },
      );
    } catch (err) {
      throw mapError(err);
    }
    const choice = res.choices[0];
    const msg = choice?.message;
    const toolCalls = (msg?.tool_calls ?? [])
      .filter((c): c is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => c.type === "function")
      .map((c) => {
        let input: unknown = {};
        try {
          input = JSON.parse(c.function.arguments || "{}");
        } catch {
          input = { __invalid_json__: c.function.arguments };
        }
        return { id: c.id, name: c.function.name, input };
      });
    const finish = choice?.finish_reason;
    return {
      text: (msg?.content ?? "").trim(),
      toolCalls,
      stop: toolCalls.length ? "tool_use" : finish === "length" ? "max_tokens" : finish === "content_filter" ? "refusal" : "end",
      usage: {
        inputTokens: res.usage?.prompt_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
        cacheReadTokens: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        cacheWriteTokens: 0,
      },
      servedModel: res.model,
      assistantMessage: msg ? { role: "assistant", content: msg.content ?? null, ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) } : { role: "assistant", content: "" },
    };
  }

  /** Embeddings (usados pela busca vetorial da base de conhecimento). */
  async embed(texts: string[], model: string, dimensions: number) {
    try {
      const res = await this.client.embeddings.create({ model, input: texts, dimensions });
      return { vectors: res.data.map((d) => d.embedding), tokens: res.usage?.total_tokens ?? 0 };
    } catch (err) {
      throw mapError(err);
    }
  }

  async ping(model: string) {
    try {
      await this.client.chat.completions.create({ model, max_completion_tokens: 16, messages: [{ role: "user", content: "Responda apenas: ok" }] });
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: mapError(err).message };
    }
  }
}

function mapError(err: unknown): ProviderError {
  if (err instanceof OpenAI.AuthenticationError) return new ProviderError("Chave do provedor inválida.", false, 401);
  if (err instanceof OpenAI.NotFoundError) return new ProviderError("Modelo não encontrado no provedor.", false, 404);
  if (err instanceof OpenAI.BadRequestError) return new ProviderError(`Requisição recusada pelo provedor: ${err.message}`, false, 400);
  if (err instanceof OpenAI.RateLimitError) return new ProviderError("Limite de uso do provedor atingido.", true, 429);
  if (err instanceof OpenAI.APIConnectionError) return new ProviderError("Falha de conexão com o provedor de IA.", true);
  if (err instanceof OpenAI.APIError) return new ProviderError(`Erro do provedor (${err.status}).`, (err.status ?? 500) >= 500, err.status);
  return new ProviderError(err instanceof Error ? err.message : "Erro desconhecido do provedor.", false);
}
