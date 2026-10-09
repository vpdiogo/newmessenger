import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Message } from "./api/conversations";
import { useConversationAnnouncements } from "./useConversationAnnouncements";

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    clientMessageId: id,
    content: "Hello",
    conversationId: "conversation-a",
    senderId: "participant",
    createdAt: "2026-10-08T12:00:00.000000Z",
    ...overrides,
  };
}

const states: ReturnType<typeof useConversationAnnouncements>[] = [];
function setup() {
  const conversationId = ref<string | null>("conversation-a");
  const userId = ref("owner");
  const connection = ref<"connecting" | "connected" | "disconnected">(
    "connecting",
  );
  const state = useConversationAnnouncements(
    conversationId,
    () => userId.value,
    () => "friend@example.test",
    connection,
  );
  states.push(state);
  return { state, conversationId, userId, connection };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const state of states.splice(0)) state.dispose();
  vi.useRealTimers();
});

describe("incoming message announcements", () => {
  it("batches new content with the author and deduplicates message IDs", () => {
    const { state } = setup();
    state.announceIncomingMessages([
      message("first"),
      message("first"),
      message("second", { content: "Second" }),
    ]);
    vi.advanceTimersByTime(250);
    expect(state.messageAnnouncement.value).toBe(
      "friend@example.test says: Hello\nfriend@example.test says: Second",
    );
    state.announceIncomingMessages([message("first")]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("suppresses local sends and other conversations", () => {
    const { state } = setup();
    state.announceIncomingMessages([
      message("own", { senderId: "owner" }),
      message("outside", { conversationId: "conversation-b" }),
    ]);
    vi.advanceTimersByTime(250);
    expect(state.messageAnnouncement.value).toBe("");
  });

  it("keeps every message received while a batch is being published", () => {
    const { state } = setup();
    state.announceIncomingMessages([message("first")]);
    vi.advanceTimersByTime(150);
    state.announceIncomingMessages([
      message("second", { content: "During publication" }),
    ]);
    vi.advanceTimersByTime(100);
    expect(state.messageAnnouncement.value).toContain("Hello");
    expect(state.messageAnnouncement.value).toContain("During publication");
  });

  it("renders a clearing interval before announcing identical text from a new ID", () => {
    const { state } = setup();
    state.announceIncomingMessages([message("first")]);
    vi.advanceTimersByTime(250);
    state.announceIncomingMessages([message("second")]);
    vi.advanceTimersByTime(150);
    expect(state.messageAnnouncement.value).toBe("");
    vi.advanceTimersByTime(100);
    expect(state.messageAnnouncement.value).toBe(
      "friend@example.test says: Hello",
    );
  });

  it.each([100, 200])(
    "cancels pending content after selection changes at %sms",
    (elapsed) => {
      const { state, conversationId } = setup();
      state.announceIncomingMessages([message("old")]);
      vi.advanceTimersByTime(elapsed);
      conversationId.value = "conversation-b";
      vi.advanceTimersByTime(1000);
      expect(state.messageAnnouncement.value).toBe("");
      state.announceIncomingMessages([
        message("new", {
          conversationId: "conversation-b",
          content: "New conversation",
        }),
      ]);
      vi.advanceTimersByTime(250);
      expect(state.messageAnnouncement.value).toBe(
        "friend@example.test says: New conversation",
      );
    },
  );

  it("clears queued content on logout/account change and disposal", () => {
    const { state, userId } = setup();
    state.announceIncomingMessages([message("old")]);
    userId.value = "another-owner";
    vi.advanceTimersByTime(250);
    expect(state.messageAnnouncement.value).toBe("");
    state.announceIncomingMessages([message("pending")]);
    state.dispose();
    vi.advanceTimersByTime(1000);
    expect(state.messageAnnouncement.value).toBe("");
  });
});

describe("connection announcements", () => {
  it("announces established/lost/recovered connection without repeated retry noise", () => {
    const { state, connection } = setup();
    connection.value = "connected";
    expect(state.connectionAnnouncement.value).toBe("Connection established.");
    connection.value = "disconnected";
    vi.advanceTimersByTime(750);
    expect(state.connectionAnnouncement.value).toBe(
      "Connection lost. Reconnecting.",
    );
    for (let index = 0; index < 3; index++) {
      connection.value = "connecting";
      connection.value = "disconnected";
      vi.advanceTimersByTime(1000);
      expect(state.connectionAnnouncement.value).toBe(
        "Connection lost. Reconnecting.",
      );
      expect(vi.getTimerCount()).toBe(0);
    }
    connection.value = "connected";
    expect(state.connectionAnnouncement.value).toBe("Connection established.");
  });

  it("suppresses brief disconnects and cancels pending status on disposal", () => {
    const { state, connection } = setup();
    connection.value = "connected";
    connection.value = "disconnected";
    vi.advanceTimersByTime(300);
    connection.value = "connected";
    vi.advanceTimersByTime(1000);
    expect(state.connectionAnnouncement.value).toBe("Connection established.");
    connection.value = "disconnected";
    state.dispose();
    vi.advanceTimersByTime(1000);
    expect(state.connectionAnnouncement.value).toBe("");
  });
});
