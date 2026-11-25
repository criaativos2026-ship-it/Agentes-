/** Estado devolvido pelas ações do servidor para os formulários (compartilhado cliente/servidor). */
export type FormState = { error?: string; ok?: string; fields?: Record<string, string>; id?: string } | undefined;
