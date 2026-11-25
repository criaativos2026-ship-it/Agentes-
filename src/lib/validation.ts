import { z } from "zod";

// Mensagens de validação padrão em português.
z.config(z.locales.ptBR ? z.locales.ptBR() : z.locales.pt());

export const emailSchema = z
  .string({ error: "Informe o e-mail." })
  .trim()
  .toLowerCase()
  .max(254, "E-mail muito longo.")
  .email("E-mail inválido.");

export const nameSchema = z.string({ error: "Informe o nome." }).trim().min(2, "Nome muito curto.").max(120, "Nome muito longo.");

export const passwordSchema = z
  .string({ error: "Informe a senha." })
  .min(10, "A senha precisa ter ao menos 10 caracteres.")
  .max(200, "Senha muito longa.");

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, "Use só letras minúsculas, números e hífen.");

export const uuidSchema = z.string().uuid("Identificador inválido.");

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .optional()
    .transform((v) => (v ? v : undefined));

/** "Imobiliária São João" → "imobiliaria-sao-joao" */
export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "empresa";
}
