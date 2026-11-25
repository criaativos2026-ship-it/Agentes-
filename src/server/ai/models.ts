import type { ProviderId } from "./types";

export type ModelInfo = {
  id: string;
  label: string;
  provider: ProviderId;
  /** US$ por milhão de tokens. null = sem tabela (custo não estimado). */
  price: { input: number; output: number; cacheRead: number; cacheWrite: number } | null;
  supportsEffort: boolean;
  /** Modelos novos da Anthropic rejeitam temperature. */
  supportsTemperature: boolean;
  /** Suporta o parâmetro server-side `fallbacks` (recusa → modelo alternativo). */
  supportsFallbacks: boolean;
  note?: string;
};

/**
 * Catálogo de modelos com preços de tabela (fonte: referência oficial da API Claude, nov/2026).
 * Escrita em cache = 1,25 × entrada. Outros provedores: o administrador informa o ID do modelo;
 * sem preço conhecido, o consumo de tokens é registrado mas o custo não é estimado.
 */
export const MODELS: ModelInfo[] = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (recomendado)", provider: "anthropic", price: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }, supportsEffort: true, supportsTemperature: false, supportsFallbacks: true },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "anthropic", price: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 }, supportsEffort: true, supportsTemperature: false, supportsFallbacks: true },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (econômico)", provider: "anthropic", price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }, supportsEffort: true, supportsTemperature: false, supportsFallbacks: false, note: "Preço para prompts até 100 mil tokens." },
  { id: "claude-fable-5-2", label: "Claude Fable 5.2 (mais capaz)", provider: "anthropic", price: { input: 8, output: 40, cacheRead: 0.2, cacheWrite: 10 }, supportsEffort: true, supportsTemperature: false, supportsFallbacks: true },
];

export const DEFAULT_MODEL = "claude-opus-5-5";

export const PROVIDERS: { id: ProviderId; label: string; envKey?: string; needsBaseUrl?: boolean }[] = [
  { id: "anthropic", label: "Anthropic (Claude)", envKey: "ANTHROPIC_API_KEY" },
  { id: "openai", label: "OpenAI", envKey: "OPENAI_API_KEY" },
  { id: "openai_compatible", label: "Compatível com OpenAI (OpenRouter, Groq, Ollama…)", needsBaseUrl: true },
];

export function modelInfo(model: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === model);
}

/** Custo estimado em micro-dólares. */
export function estimateCostMicros(model: string, u: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }) {
  const p = modelInfo(model)?.price;
  if (!p) return 0;
  return Math.round(u.inputTokens * p.input + u.outputTokens * p.output + u.cacheReadTokens * p.cacheRead + u.cacheWriteTokens * p.cacheWrite);
}
