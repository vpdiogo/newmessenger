import { describe, expect, it } from "vitest";

import type { Message } from "./api/conversations";
import { groupTranscriptMessages } from "./transcript";

function message(overrides: Partial<Message>): Message {
  return {
    clientMessageId: "client-1",
    content: "Hello",
    conversationId: "conversation-1",
    createdAt: "2026-10-08T12:00:00.000Z",
    id: "message-1",
    senderId: "user-1",
    ...overrides,
  };
}

describe("groupTranscriptMessages", () => {
  it("groups consecutive messages from the same sender on the same day", () => {
    const firstMessage = message({ id: "message-1" });
    const secondMessage = message({
      clientMessageId: "client-2",
      content: "Again",
      createdAt: "2026-10-08T12:01:00.000Z",
      id: "message-2",
    });

    expect(
      groupTranscriptMessages([firstMessage, secondMessage]),
    ).toMatchObject([
      { messages: [firstMessage, secondMessage], senderId: "user-1" },
    ]);
  });

  it("starts a group when the sender or calendar day changes", () => {
    const firstMessage = message({ id: "message-1" });
    const otherSenderMessage = message({
      clientMessageId: "client-2",
      id: "message-2",
      senderId: "user-2",
    });
    const nextDayMessage = message({
      clientMessageId: "client-3",
      createdAt: "2026-10-09T12:00:00.000Z",
      id: "message-3",
      senderId: "user-2",
    });

    expect(
      groupTranscriptMessages([
        firstMessage,
        otherSenderMessage,
        nextDayMessage,
      ]).map(({ messages, senderId }) => ({
        messageIds: messages.map(({ id }) => id),
        senderId,
      })),
    ).toEqual([
      { messageIds: ["message-1"], senderId: "user-1" },
      { messageIds: ["message-2"], senderId: "user-2" },
      { messageIds: ["message-3"], senderId: "user-2" },
    ]);
  });
});
