import { ptBR, type MessageKey } from "./pt-BR";

const dictionaries = { "pt-BR": ptBR } as const;
export type Locale = keyof typeof dictionaries;
export const DEFAULT_LOCALE: Locale = "pt-BR";

/** Tradução simples por chave; devolve a própria chave se faltar (fácil de detectar). */
export function t(key: MessageKey | string, locale: Locale = DEFAULT_LOCALE): string {
  const dict = dictionaries[locale] as Record<string, string>;
  return dict[key] ?? key;
}
