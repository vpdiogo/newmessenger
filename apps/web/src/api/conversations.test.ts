import { beforeEach, describe, expect, it, vi } from "vitest";

const requestJson = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({ requestJson }));

import {
  createConversation,
  getMessageHistory,
  sendMessage,
} from "./conversations";

describe("createConversation", () => {
  it("sends the participant email", async () => {
    requestJson.mockResolvedValue({ id: "conversation-id" });

    await expect(
      createConversation("person@example.test"),
    ).resolves.toBe("conversation-id");
    expect(requestJson).toHaveBeenCalledWith("/conversations", {
      body: JSON.stringify({ participantEmail: "person@example.test" }),
      method: "POST",
    });
  });
});

describe("getMessageHistory", () => {
  beforeEach(() => {
    requestJson.mockReset();
  });

  it("requests the next cursor and returns a validated page", async () => {
    requestJson.mockResolvedValue({
      messages: [
        {
          clientMessageId: "client-message-id",
          content: "Hello",
          conversationId: "conversation-id",
          createdAt: "2026-10-07T00:00:00.000Z",
          id: "message-id",
          senderId: "sender-id",
        },
      ],
      nextCursor: "message-id",
    });

    await expect(
      getMessageHistory("conversation-id", "previous-message-id"),
    ).resolves.toEqual({
      messages: [
        {
          clientMessageId: "client-message-id",
          content: "Hello",
          conversationId: "conversation-id",
          createdAt: "2026-10-07T00:00:00.000Z",
          id: "message-id",
          senderId: "sender-id",
        },
      ],
      nextCursor: "message-id",
    });
    expect(requestJson).toHaveBeenCalledWith(
      "/conversations/conversation-id/messages?limit=50&cursor=previous-message-id",
    );
  });
});

describe("sendMessage", () => {
  it("sends the client message ID required for an idempotent request", async () => {
    const message = {
      clientMessageId: "client-message-id",
      content: "Hello",
      conversationId: "conversation-id",
      createdAt: "2026-10-07T00:00:00.000Z",
      id: "message-id",
      senderId: "sender-id",
    };
    requestJson.mockResolvedValue(message);

    await expect(
      sendMessage("conversation-id", "client-message-id", "Hello"),
    ).resolves.toEqual(message);
    expect(requestJson).toHaveBeenCalledWith(
      "/conversations/conversation-id/messages",
      {
        body: JSON.stringify({
          clientMessageId: "client-message-id",
          content: "Hello",
        }),
        method: "POST",
      },
    );
  });
});
