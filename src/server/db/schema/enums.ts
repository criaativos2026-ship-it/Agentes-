import { pgEnum } from "drizzle-orm/pg-core";

export const platformRole = pgEnum("platform_role", ["super_admin", "platform_staff"]);
export const userStatus = pgEnum("user_status", ["active", "disabled"]);
export const orgStatus = pgEnum("org_status", ["trial", "active", "suspended", "canceled"]);
export const memberStatus = pgEnum("member_status", ["active", "disabled"]);

export const agentStatus = pgEnum("agent_status", ["draft", "testing", "published", "disabled"]);

export const documentStatus = pgEnum("document_status", ["pending", "processing", "ready", "error"]);
export const documentSource = pgEnum("document_source", ["upload", "text", "faq"]);

export const conversationChannel = pgEnum("conversation_channel", ["app", "test", "whatsapp", "api", "workflow"]);
export const messageRole = pgEnum("message_role", ["user", "assistant", "tool", "system"]);

export const executionKind = pgEnum("execution_kind", ["chat", "task", "workflow"]);
export const executionStatus = pgEnum("execution_status", [
  "queued",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
  "canceled",
  "timed_out",
]);
export const stepType = pgEnum("step_type", ["llm", "tool", "approval", "retrieval", "log", "workflow_node"]);
export const stepStatus = pgEnum("step_status", ["running", "succeeded", "failed", "skipped", "waiting"]);
export const approvalStatus = pgEnum("approval_status", ["pending", "approved", "rejected", "expired"]);

export const integrationStatus = pgEnum("integration_status", [
  "pending_credentials",
  "pending_authorization",
  "connected",
  "error",
  "disabled",
]);
export const credentialKind = pgEnum("credential_kind", ["api_key", "oauth", "basic", "webhook_secret"]);

export const planType = pgEnum("plan_type", ["monthly", "annual", "custom", "enterprise"]);
export const subscriptionStatus = pgEnum("subscription_status", ["trialing", "active", "past_due", "suspended", "canceled"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "paid", "failed", "refunded", "overdue", "canceled"]);
export const paymentMethod = pgEnum("payment_method", [
  "manual_pix",
  "manual_boleto",
  "manual_transfer",
  "stripe",
  "mercadopago",
]);
export const usageKind = pgEnum("usage_kind", ["llm_tokens", "execution", "tool_call", "embedding", "storage"]);

export const projectStatus = pgEnum("project_status", [
  "new",
  "discovery",
  "development",
  "configuration",
  "testing",
  "awaiting_approval",
  "active",
  "maintenance",
  "suspended",
]);

export const workflowStatus = pgEnum("workflow_status", ["draft", "active", "paused"]);
export const workflowTrigger = pgEnum("workflow_trigger", ["manual", "webhook", "schedule", "event"]);
export const taskStatus = pgEnum("task_status", ["open", "in_progress", "done", "canceled"]);

export const ticketStatus = pgEnum("ticket_status", ["open", "in_progress", "waiting_customer", "resolved", "closed"]);
export const ticketPriority = pgEnum("ticket_priority", ["low", "normal", "high", "urgent"]);
