import type { Message } from "./api/conversations";

export function appendMessages(
  existingMessages: Message[],
  incomingMessages: Message[],
): Message[] {
  const messagesById = new Map(
    existingMessages.map((message) => [message.id, message]),
  );

  for (const message of incomingMessages) {
    messagesById.set(message.id, message);
  }

  return [...messagesById.values()].sort(
    (first, second) =>
      first.createdAt.localeCompare(second.createdAt) ||
      first.id.localeCompare(second.id),
  );
}
