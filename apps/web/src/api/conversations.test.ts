import { beforeEach, describe, expect, it, vi } from "vitest";

const requestJson = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({ requestJson }));

import { getMessageHistory } from "./conversations";

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
