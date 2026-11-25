"use client";

import { sendAgentMessageAction } from "@/app/actions/executions";
import { ChatPanel, type ChatMessage } from "@/components/agents/chat-panel";

export function AgentChat(props: { slug: string; agentId: string; agentName: string; initialMessages: ChatMessage[]; conversationId?: string; approvalsHref?: string; disabledReason?: string }) {
  return (
    <ChatPanel
      agentName={props.agentName}
      initialMessages={props.initialMessages}
      initialConversationId={props.conversationId}
      approvalsHref={props.approvalsHref}
      disabledReason={props.disabledReason}
      send={(i) => sendAgentMessageAction({ slug: props.slug, agentId: props.agentId, ...i })}
    />
  );
}
