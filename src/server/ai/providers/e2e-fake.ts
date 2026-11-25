import "server-only";
import type { LLMProvider, TurnRequest, TurnResult } from "../types";

/**
 * DUBLÊ DE TESTE para os testes E2E (NEXUS_E2E_FAKE_LLM=1). Não é um recurso do produto:
 * só é ativado por variável de ambiente explícita e recusa rodar fora de localhost.
 * Comportamento determinístico: se a última mensagem do usuário contém "tarefa:", pede a ferramenta
 * create_task; "email:" pede send_email; "lead:" pede crm_register_opportunity; senão responde com eco.
 */
export function createE2EFakeProvider(): LLMProvider {
  const appUrl = process.env.APP_URL ?? "";
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(appUrl)) throw new Error("Dublê de LLM só pode rodar em localhost.");
  const usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 };
  return {
    id: "anthropic",
    userMessage: (text) => ({ role: "user", content: text }),
    toolResultsMessage: (results) => [{ role: "user", content: results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content, is_error: r.isError })) }],
    async ping() {
      return { ok: true };
    },
    async createTurn(req: TurnRequest): Promise<TurnResult> {
      const last = req.transcript[req.transcript.length - 1] as { role: string; content: unknown };
      if (Array.isArray(last.content) && (last.content as { type: string }[]).some((b) => b.type === "tool_result")) {
        const r = (last.content as { content: string; is_error?: boolean }[])[0];
        const text = r.is_error ? `Não consegui concluir: ${r.content}` : `Pronto! Resultado: ${r.content}`;
        return { text, toolCalls: [], stop: "end", usage, servedModel: req.model, assistantMessage: { role: "assistant", content: [{ type: "text", text }] } };
      }
      const userText = typeof last.content === "string" ? last.content : "";
      const msg = userText.split("Mensagem:").pop()?.trim() ?? userText;
      const taskMatch = msg.match(/tarefa:\s*(.+)/i);
      const emailMatch = msg.match(/email:\s*(\S+@\S+)/i);
      const leadMatch = msg.match(/lead:\s*(.+)/i);
      const call = taskMatch && req.tools.some((t) => t.name === "create_task")
        ? { id: `call_${Date.now()}`, name: "create_task", input: { title: taskMatch[1].slice(0, 120) } }
        : emailMatch && req.tools.some((t) => t.name === "send_email")
          ? { id: `call_${Date.now()}`, name: "send_email", input: { to: emailMatch[1], subject: "Teste", body: "Mensagem de teste" } }
          : leadMatch && req.tools.some((t) => t.name === "crm_register_opportunity")
            ? { id: `call_${Date.now()}`, name: "crm_register_opportunity", input: { name: leadMatch[1].slice(0, 120), source: "teste E2E" } }
            : null;
      if (call) {
        return { text: "", toolCalls: [call], stop: "tool_use", usage, servedModel: req.model, assistantMessage: { role: "assistant", content: [{ type: "tool_use", ...call }] } };
      }
      const text = `Recebi: ${msg.slice(0, 200)}`;
      return { text, toolCalls: [], stop: "end", usage, servedModel: req.model, assistantMessage: { role: "assistant", content: [{ type: "text", text }] } };
    },
  };
}
