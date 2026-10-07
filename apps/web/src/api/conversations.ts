import { requestJson } from "./client";

export type Conversation = {
  createdAt: string;
  id: string;
  participant: { email: string; id: string };
};

export type Message = {
  clientMessageId: string;
  content: string;
  conversationId: string;
  createdAt: string;
  id: string;
  senderId: string;
};

export type MessageHistory = { messages: Message[]; nextCursor: string | null };

export async function sendMessage(
  conversationId: string,
  clientMessageId: string,
  content: string,
): Promise<Message> {
  const data = await requestJson(`/conversations/${conversationId}/messages`, {
    body: JSON.stringify({ clientMessageId, content }),
    method: "POST",
  });
  if (!isMessage(data)) throw new Error("The API message response is invalid");
  return data;
}

export async function createConversation(
  participantId: string,
): Promise<string> {
  const data = await requestJson("/conversations", {
    body: JSON.stringify({ participantId }),
    method: "POST",
  });

  if (
    typeof data !== "object" ||
    data === null ||
    !("id" in data) ||
    typeof data.id !== "string"
  ) {
    throw new Error("The API conversation response is invalid");
  }

  return data.id;
}

export async function getConversations(): Promise<Conversation[]> {
  const data = await requestJson("/conversations");
  if (!Array.isArray(data) || !data.every(isConversation)) {
    throw new Error("The API conversations response is invalid");
  }

  return data;
}

export async function getMessageHistory(
  conversationId: string,
  cursor?: string,
): Promise<MessageHistory> {
  const query = new URLSearchParams({ limit: "50" });
  if (cursor) query.set("cursor", cursor);

  const data = await requestJson(
    `/conversations/${conversationId}/messages?${query}`,
  );
  if (
    typeof data !== "object" ||
    data === null ||
    !("messages" in data) ||
    !("nextCursor" in data) ||
    !Array.isArray(data.messages) ||
    !data.messages.every(isMessage) ||
    (data.nextCursor !== null && typeof data.nextCursor !== "string")
  ) {
    throw new Error("The API message history response is invalid");
  }

  return { messages: data.messages, nextCursor: data.nextCursor };
}

function isConversation(data: unknown): data is Conversation {
  return (
    typeof data === "object" &&
    data !== null &&
    "id" in data &&
    "createdAt" in data &&
    "participant" in data &&
    typeof data.id === "string" &&
    typeof data.createdAt === "string" &&
    isParticipant(data.participant)
  );
}

export function isMessage(data: unknown): data is Message {
  return (
    typeof data === "object" &&
    data !== null &&
    "clientMessageId" in data &&
    "content" in data &&
    "conversationId" in data &&
    "createdAt" in data &&
    "id" in data &&
    "senderId" in data &&
    typeof data.clientMessageId === "string" &&
    typeof data.content === "string" &&
    typeof data.conversationId === "string" &&
    typeof data.createdAt === "string" &&
    typeof data.id === "string" &&
    typeof data.senderId === "string"
  );
}

function isParticipant(data: unknown): data is Conversation["participant"] {
  return (
    typeof data === "object" &&
    data !== null &&
    "email" in data &&
    "id" in data &&
    typeof data.email === "string" &&
    typeof data.id === "string"
  );
}
