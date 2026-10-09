import { describe, expect, it } from "vitest";

import type { Message } from "./api/conversations";
import { appendMessages } from "./messages";

const firstMessage: Message = {
  clientMessageId: "client-1",
  content: "First",
  conversationId: "conversation-1",
  createdAt: "2026-10-07T00:00:00.000Z",
  id: "message-1",
  senderId: "user-1",
};

const secondMessage: Message = {
  ...firstMessage,
  clientMessageId: "client-2",
  content: "Second",
  createdAt: "2026-10-07T00:01:00.000Z",
  id: "message-2",
};

describe("appendMessages", () => {
  it("orders sub-millisecond timestamps before using the ID tie breaker", () => {
    const earlier = {
      ...firstMessage,
      id: "message-z",
      createdAt: "2026-10-08T12:00:00.000100Z",
    };
    const later = {
      ...secondMessage,
      id: "message-a",
      createdAt: "2026-10-08T12:00:00.000900Z",
    };
    expect(appendMessages([later], [earlier])).toEqual([earlier, later]);
  });
  it("uses message ID ordering for equal timestamps, matching history cursors", () => {
    const tiedMessage = { ...secondMessage, createdAt: firstMessage.createdAt };
    expect(appendMessages([tiedMessage], [firstMessage])).toEqual([
      firstMessage,
      tiedMessage,
    ]);
  });
  it("deduplicates websocket deliveries and keeps messages chronological", () => {
    expect(
      appendMessages([secondMessage], [firstMessage, secondMessage]),
    ).toEqual([firstMessage, secondMessage]);
  });
});
