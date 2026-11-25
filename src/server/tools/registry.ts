import "server-only";
import { z } from "zod";
import type { ToolDefinition } from "./types";
import { createReport, createTask, crmRegisterOpportunity, crmSearch, currentDatetime } from "./builtin/productivity";
import { knowledgeSearch } from "./builtin/knowledge";
import { httpRequest, webSearch } from "./builtin/web";
import { gmailSend, sendEmailTool, whatsappSend } from "./builtin/communication";
import { calendarCreateEvent, driveListFiles, mapsSearchPlaces, sheetsAppendRow } from "./builtin/google";
import { hubspotCreateContact, hubspotSearchContacts, restApiRequest, sendWebhook } from "./builtin/crm-external";
import { scheduleFollowup } from "./builtin/automation";

/**
 * Registro central de ferramentas. Para criar uma nova: implemente ToolDefinition (validação Zod,
 * risco, aprovação, disponibilidade, execução) e adicione aqui — o Construtor a mostra automaticamente.
 */
const ALL: ToolDefinition[] = [
  knowledgeSearch,
  currentDatetime,
  createTask,
  createReport,
  crmRegisterOpportunity,
  crmSearch,
  webSearch,
  httpRequest,
  sendEmailTool,
  gmailSend,
  whatsappSend,
  calendarCreateEvent,
  sheetsAppendRow,
  driveListFiles,
  mapsSearchPlaces,
  hubspotSearchContacts,
  hubspotCreateContact,
  restApiRequest,
  sendWebhook,
  scheduleFollowup,
] as ToolDefinition[];

export const TOOL_REGISTRY = new Map(ALL.map((t) => [t.key, t]));

export function getTool(key: string) {
  return TOOL_REGISTRY.get(key);
}

export function listTools() {
  return ALL;
}

/** JSON Schema enviado ao modelo (gerado do schema Zod — fonte única de validação). */
export function toolJsonSchema(t: ToolDefinition): Record<string, unknown> {
  const schema = z.toJSONSchema(t.input, { target: "draft-7", io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/** Decide se uma chamada precisa de aprovação humana. Ferramentas de risco alto SEMPRE precisam. */
export function needsApproval(t: ToolDefinition, input: unknown, override: boolean | null | undefined) {
  if (t.risk === "high") return true;
  if (override === true) return true;
  if (override === false) return false;
  return typeof t.requiresApproval === "function" ? t.requiresApproval(input as never) : t.requiresApproval;
}
