import { z } from "zod";

/**
 * Definição de workflow em GRAFO (nós + ligação "next"/"else"), já no formato que um construtor
 * visual futuro vai editar. A execução começa no primeiro nó.
 * Variáveis em textos: {{input}} (entrada do disparo), {{last}} (último resultado), {{node.<id>}}.
 */
const id = z.string().regex(/^[a-z0-9_-]{1,40}$/i, "ID de etapa inválido");

export const nodeSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("agent"), label: z.string().max(120).optional(), agentId: z.string().uuid(), prompt: z.string().min(1).max(8000), next: id.optional() }),
  z.object({
    id,
    type: z.literal("condition"),
    label: z.string().max(120).optional(),
    source: z.string().max(80).default("last"),
    operator: z.enum(["contains", "not_contains", "equals", "not_empty"]),
    value: z.string().max(500).default(""),
    next: id.optional(),
    else: id.optional(),
  }),
  z.object({ id, type: z.literal("approval"), label: z.string().max(120).optional(), summary: z.string().min(3).max(500), next: id.optional() }),
  z.object({ id, type: z.literal("end"), label: z.string().max(120).optional() }),
]);

export const definitionSchema = z
  .object({ nodes: z.array(nodeSchema).min(1).max(50) })
  .superRefine((d, ctx) => {
    const ids = new Set<string>();
    for (const n of d.nodes) {
      if (ids.has(n.id)) ctx.addIssue({ code: "custom", message: `Etapa repetida: ${n.id}` });
      ids.add(n.id);
    }
    for (const n of d.nodes) for (const ref of ["next", "else"] as const) {
      const target = (n as Record<string, unknown>)[ref] as string | undefined;
      if (target && !ids.has(target)) ctx.addIssue({ code: "custom", message: `Etapa "${n.id}" aponta para "${target}", que não existe.` });
    }
  });

export type WorkflowNode = z.infer<typeof nodeSchema>;
export type WorkflowDefinition = z.infer<typeof definitionSchema>;

/** Próxima etapa padrão: "next" explícito ou a seguinte na lista. */
export function nextNodeId(def: WorkflowDefinition, node: WorkflowNode, branch: "next" | "else" = "next"): string | null {
  const explicit = (node as Record<string, unknown>)[branch] as string | undefined;
  if (explicit) return explicit;
  if (branch === "else") return null; // condição falsa sem "else" encerra
  const i = def.nodes.findIndex((n) => n.id === node.id);
  return def.nodes[i + 1]?.id ?? null;
}

export function render(template: string, vars: { input: string; last: string; outputs: Record<string, string> }) {
  return template
    .replace(/\{\{\s*input\s*\}\}/g, vars.input)
    .replace(/\{\{\s*last\s*\}\}/g, vars.last)
    .replace(/\{\{\s*node\.([a-z0-9_-]+)\s*\}\}/gi, (_, k: string) => vars.outputs[k] ?? "");
}

export function evaluate(node: Extract<WorkflowNode, { type: "condition" }>, vars: { input: string; last: string; outputs: Record<string, string> }) {
  const src = node.source === "last" ? vars.last : node.source === "input" ? vars.input : node.source.startsWith("node.") ? (vars.outputs[node.source.slice(5)] ?? "") : "";
  const a = src.toLowerCase();
  const b = node.value.toLowerCase();
  if (node.operator === "contains") return a.includes(b);
  if (node.operator === "not_contains") return !a.includes(b);
  if (node.operator === "equals") return a.trim() === b.trim();
  return a.trim().length > 0;
}
