import { nextTick, readonly, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getMessageHistory: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock("./api/conversations", () => api);

import { ApiError } from "./api/client";
import type { Message, MessageHistory } from "./api/conversations";
import { submitMessageOnEnter } from "./components/conversations/messageKeyboard";
import { useConversationMessages } from "./useConversationMessages";

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    content: id,
    clientMessageId: `client-${id}`,
    conversationId: "conversation-a",
    senderId: "sender-a",
    createdAt: "2026-10-08T12:00:00.000Z",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const states: ReturnType<typeof useConversationMessages>[] = [];
function createState(incoming?: (messages: Message[]) => void) {
  const selection = ref<string | null>(null);
  const state = useConversationMessages(readonly(selection), {
    onIncomingMessages: incoming,
  });
  states.push(state);
  return {
    ...state,
    async selectConversation(id: string | null): Promise<void> {
      selection.value = id;
      await vi.waitFor(() => expect(state.isLoadingMessages.value).toBe(false));
    },
  };
}

function createObservedState() {
  const incoming = vi.fn();
  return { state: createState(incoming), incoming };
}

async function pressEnter(state: ReturnType<typeof createState>) {
  let sending: Promise<void> | undefined;
  submitMessageOnEnter(
    { key: "Enter", preventDefault: vi.fn() } as unknown as KeyboardEvent,
    () => {
      sending = state.submitMessage();
    },
  );
  await sending;
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getMessageHistory.mockResolvedValue({ messages: [], nextCursor: null });
  api.sendMessage.mockImplementation(
    async (conversationId: string, clientMessageId: string, content: string) =>
      message("sent", { conversationId, clientMessageId, content }),
  );
});
afterEach(() => {
  for (const state of states.splice(0)) state.dispose();
});

describe("keyboard intent through the existing submission flow", () => {
  it("retains drafts without sending when selection is absent or history is loading", async () => {
    const state = createState();
    state.messageContent.value = "No selection";
    await pressEnter(state);
    expect(state.messageContent.value).toBe("No selection");
    const page = deferred<MessageHistory>();
    api.getMessageHistory.mockReturnValueOnce(page.promise);
    const selecting = state.selectConversation("conversation-a");
    state.messageContent.value = "Loading draft";
    await pressEnter(state);
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(state.messageContent.value).toBe("Loading draft");
    page.resolve({ messages: [], nextCursor: null });
    await selecting;
    await pressEnter(state);
    expect(api.sendMessage).toHaveBeenCalledExactlyOnceWith(
      "conversation-a",
      expect.any(String),
      "Loading draft",
    );
  });

  it.each(["", " \n ", "a".repeat(2001)])(
    "retains an invalid draft without a keyboard send (case %#)",
    async (draft) => {
      const state = createState();
      await state.selectConversation("conversation-a");
      state.messageContent.value = draft;
      await pressEnter(state);
      expect(api.sendMessage).not.toHaveBeenCalled();
      expect(state.messageContent.value).toBe(draft);
    },
  );

  it("blocks repeated Enter while pending and suppresses local-send announcements", async () => {
    const { state, incoming } = createObservedState();
    await state.selectConversation("conversation-a");
    const response = deferred<Message>();
    api.sendMessage.mockReturnValueOnce(response.promise);
    state.messageContent.value = "One message";
    const sending = pressEnter(state);
    await pressEnter(state);
    await pressEnter(state);
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    expect(state.messageContent.value).toBe("One message");
    response.resolve(message("sent", { content: "One message" }));
    await sending;
    expect(state.messageContent.value).toBe("");
    expect(incoming).not.toHaveBeenCalled();
  });

  it("reuses failed keyboard IDs on unchanged retry and replaces them after editing", async () => {
    const state = createState();
    await state.selectConversation("conversation-a");
    state.messageContent.value = "Original";
    api.sendMessage.mockRejectedValue(new TypeError("Response lost"));
    await pressEnter(state);
    const originalId = state.pendingMessage.value!.clientMessageId;
    await pressEnter(state);
    expect(api.sendMessage.mock.calls.map((call) => call[1])).toEqual([
      originalId,
      originalId,
    ]);
    expect(state.messageErrorMessage.value).toContain("Retry unchanged");
    state.messageContent.value = "Edited";
    api.sendMessage.mockResolvedValueOnce(
      message("sent", { content: "Edited" }),
    );
    await pressEnter(state);
    expect(api.sendMessage.mock.calls[2]?.[1]).not.toBe(originalId);
    expect(api.sendMessage.mock.calls[2]?.[2]).toBe("Edited");
    expect(state.messageErrorMessage.value).toBeNull();
  });

  it("isolates a pending keyboard response after switching conversations", async () => {
    const { state, incoming } = createObservedState();
    await state.selectConversation("conversation-a");
    const response = deferred<Message>();
    api.sendMessage.mockReturnValueOnce(response.promise);
    state.messageContent.value = "Old conversation";
    const sending = pressEnter(state);
    await state.selectConversation("conversation-b");
    state.messageContent.value = "New draft";
    response.resolve(message("old-response"));
    await sending;
    expect(state.selectedConversationId.value).toBe("conversation-b");
    expect(state.messageContent.value).toBe("New draft");
    expect(state.messages.value).toEqual([]);
    expect(incoming).not.toHaveBeenCalled();
  });
});

describe("message submission recovery", () => {
  it("reuses the original ID after a lost response and deduplicates realtime delivery", async () => {
    const state = createState();
    await state.selectConversation("conversation-a");
    state.messageContent.value = "hello";
    api.sendMessage.mockRejectedValueOnce(new TypeError("Response lost"));
    await state.submitMessage();
    const original = state.pendingMessage.value!;
    state.handleMessageCreated(
      message("sent", {
        clientMessageId: original.clientMessageId,
        content: "hello",
      }),
    );
    expect(state.messageContent.value).toBe("hello");
    await state.submitMessage();
    expect(api.sendMessage.mock.calls.map((call) => call[1])).toEqual([
      original.clientMessageId,
      original.clientMessageId,
    ]);
    expect(state.messages.value).toHaveLength(1);
    expect(state.pendingMessage.value).toBeNull();
  });

  it("leaves retry mode when failed content changes and submits a new ID", async () => {
    const state = createState();
    await state.selectConversation("conversation-a");
    state.messageContent.value = "original";
    api.sendMessage.mockRejectedValueOnce(new TypeError("Offline"));
    await state.submitMessage();
    const originalId = state.pendingMessage.value!.clientMessageId;
    state.messageContent.value = "edited";
    expect(state.pendingMessage.value).toBeNull();
    expect(state.messageErrorMessage.value).toBeNull();
    await state.submitMessage();
    expect(api.sendMessage.mock.calls[1]?.[1]).not.toBe(originalId);
    expect(api.sendMessage.mock.calls[1]?.[2]).toBe("edited");
  });

  it("validates trimmed content against the backend's 2,000-character boundary", async () => {
    const state = createState();
    await state.selectConversation("conversation-a");
    state.messageContent.value = "a".repeat(2001);
    await state.submitMessage();
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(state.messageErrorMessage.value).toContain("2,000");
    expect(state.messageContent.value).toHaveLength(2001);
    state.messageContent.value = `  ${"a".repeat(2000)}  `;
    await state.submitMessage();
    expect(api.sendMessage.mock.calls[0]?.[2]).toHaveLength(2000);
    state.messageContent.value = " \n ";
    await state.submitMessage();
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("retains rejected drafts without turning permanent errors into retries", async () => {
    const state = createState();
    await state.selectConversation("conversation-a");
    state.messageContent.value = "rejected";
    api.sendMessage.mockRejectedValueOnce(new ApiError(400, "Invalid request"));
    await state.submitMessage();
    expect(state.pendingMessage.value).toBeNull();
    expect(state.messageContent.value).toBe("rejected");
    expect(state.messageErrorMessage.value).toContain("Check its content");
    state.messageContent.value = "corrected";
    await state.submitMessage();
    expect(state.messages.value[0]?.content).toBe("corrected");
    expect(state.messageErrorMessage.value).toBeNull();
  });

  it("guards concurrent sends and preserves a draft edited while a send is pending", async () => {
    const state = createState();
    await state.selectConversation("conversation-a");
    const response = deferred<Message>();
    api.sendMessage.mockReturnValueOnce(response.promise);
    state.messageContent.value = "original";
    const sending = state.submitMessage();
    await state.submitMessage();
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    state.messageContent.value = "next draft";
    response.resolve(message("sent", { content: "original" }));
    await sending;
    expect(state.messageContent.value).toBe("next draft");
    expect(state.isSendingMessage.value).toBe(false);
  });

  it("ignores stale send failures even when returning to the same conversation", async () => {
    const state = createState();
    await state.selectConversation("conversation-a");
    const response = deferred<Message>();
    api.sendMessage.mockReturnValueOnce(response.promise);
    state.messageContent.value = "old draft";
    const sending = state.submitMessage();
    await state.selectConversation("conversation-b");
    await state.selectConversation("conversation-a");
    state.messageContent.value = "current draft";
    response.reject(new TypeError("Old failure"));
    await sending;
    expect(state.pendingMessage.value).toBeNull();
    expect(state.messageErrorMessage.value).toBeNull();
    expect(state.messageContent.value).toBe("current draft");
  });
});

describe("latest history and reconnect recovery", () => {
  it("does not announce initial or earlier history, then reports only unseen recovered messages", async () => {
    const { state, incoming } = createObservedState();
    api.getMessageHistory.mockResolvedValueOnce({
      messages: [message("m050")],
      nextCursor: "m050",
    });
    await state.selectConversation("conversation-a");
    api.getMessageHistory.mockResolvedValueOnce({
      messages: [message("m001")],
      nextCursor: null,
    });
    await state.loadEarlierMessages();
    expect(incoming).not.toHaveBeenCalled();
    state.handleMessageCreated(message("m075"));
    await nextTick();
    expect(incoming).toHaveBeenCalledExactlyOnceWith([message("m075")]);
    api.getMessageHistory.mockResolvedValueOnce({
      messages: [message("m075"), message("m100")],
      nextCursor: null,
    });
    await state.recoverMessages();
    expect(incoming.mock.calls).toEqual([
      [[message("m075")]],
      [[message("m100")]],
    ]);
  });

  it("suppresses duplicate deliveries, sent-response announcements, and stale publication after switching", async () => {
    const { state, incoming } = createObservedState();
    await state.selectConversation("conversation-a");
    state.messageContent.value = "Own send";
    await state.submitMessage();
    expect(incoming).not.toHaveBeenCalled();
    state.handleMessageCreated(message("new"));
    state.handleMessageCreated(message("new"));
    await nextTick();
    expect(incoming).toHaveBeenCalledExactlyOnceWith([message("new")]);
    incoming.mockClear();
    state.handleMessageCreated(message("old-pending"));
    await state.selectConversation("conversation-b");
    await nextTick();
    expect(incoming).not.toHaveBeenCalled();
  });
  it("clears selection and ignores pending history when the conversation list becomes empty", async () => {
    const state = createState();
    const response = deferred<MessageHistory>();
    api.getMessageHistory.mockReturnValueOnce(response.promise);
    const loading = state.selectConversation("conversation-a");
    await state.selectConversation(null);
    response.reject(new TypeError("Stale response"));
    await loading;
    expect(state.selectedConversationId.value).toBeNull();
    expect(state.messages.value).toEqual([]);
    expect(state.isLoadingMessages.value).toBe(false);
    expect(state.historyError.value).toBeNull();
  });

  it("does not skip a gap when realtime delivery precedes the initial HTTP response", async () => {
    const state = createState();
    const initialPage = deferred<MessageHistory>();
    api.getMessageHistory
      .mockReturnValueOnce(initialPage.promise)
      .mockResolvedValueOnce({
        messages: [message("m075"), message("m100")],
        nextCursor: null,
      });
    const selecting = state.selectConversation("conversation-a");
    await state.recoverMessages();
    state.handleMessageCreated(message("m100"));
    initialPage.resolve({ messages: [message("m050")], nextCursor: "m050" });
    await selecting;
    await vi.waitFor(() => {
      expect(state.messages.value.map((item) => item.id)).toEqual([
        "m050",
        "m075",
        "m100",
      ]);
    });
    expect(api.getMessageHistory).toHaveBeenLastCalledWith(
      "conversation-a",
      "m050",
    );
  });

  it("retries from the last recovered page rather than a newer realtime message", async () => {
    const state = createState();
    api.getMessageHistory.mockResolvedValueOnce({
      messages: [message("m001")],
      nextCursor: null,
    });
    await state.selectConversation("conversation-a");
    api.getMessageHistory
      .mockResolvedValueOnce({
        messages: [message("m050")],
        nextCursor: "m050",
      })
      .mockRejectedValueOnce(new TypeError("Partial recovery failed"));
    await state.recoverMessages();
    expect(state.historyError.value).toBeTruthy();
    state.handleMessageCreated(message("m100"));
    api.getMessageHistory.mockResolvedValueOnce({
      messages: [message("m075"), message("m100")],
      nextCursor: null,
    });
    await state.retryHistory();
    expect(api.getMessageHistory).toHaveBeenLastCalledWith(
      "conversation-a",
      "m050",
    );
    expect(state.messages.value.map((item) => item.id)).toEqual([
      "m001",
      "m050",
      "m075",
      "m100",
    ]);
  });

  it("repeats backward pagination when an earlier-page request fails", async () => {
    const state = createState();
    api.getMessageHistory.mockResolvedValueOnce({
      messages: [message("m050")],
      nextCursor: "m050",
    });
    await state.selectConversation("conversation-a");
    api.getMessageHistory.mockRejectedValueOnce(
      new TypeError("Earlier history unavailable"),
    );
    await state.loadEarlierMessages();
    api.getMessageHistory.mockResolvedValueOnce({
      messages: [message("m001")],
      nextCursor: null,
    });
    await state.retryHistory();
    expect(api.getMessageHistory).toHaveBeenLastCalledWith(
      "conversation-a",
      "m050",
      "backward",
    );
    expect(state.messages.value.map((item) => item.id)).toEqual([
      "m001",
      "m050",
    ]);
    expect(state.historyError.value).toBeNull();
  });

  it("recovers forward from the origin after an initially empty conversation", async () => {
    const state = createState();
    await state.selectConversation("conversation-a");
    api.getMessageHistory
      .mockResolvedValueOnce({
        messages: [message("m001")],
        nextCursor: "m001",
      })
      .mockResolvedValueOnce({ messages: [message("m100")], nextCursor: null });
    await state.recoverMessages();
    expect(api.getMessageHistory).toHaveBeenNthCalledWith(
      2,
      "conversation-a",
      undefined,
    );
    expect(api.getMessageHistory).toHaveBeenLastCalledWith(
      "conversation-a",
      "m001",
    );
    expect(state.messages.value).toHaveLength(2);
  });

  it("loads latest and earlier pages without replacing the backward cursor during recovery", async () => {
    const state = createState();
    api.getMessageHistory.mockResolvedValueOnce({
      messages: [message("m3")],
      nextCursor: "m3",
    });
    await state.selectConversation("conversation-a");
    expect(api.getMessageHistory).toHaveBeenLastCalledWith(
      "conversation-a",
      undefined,
      "backward",
    );
    api.getMessageHistory
      .mockResolvedValueOnce({ messages: [message("m4")], nextCursor: "m4" })
      .mockResolvedValueOnce({ messages: [message("m5")], nextCursor: null });
    await state.recoverMessages();
    expect(api.getMessageHistory).toHaveBeenLastCalledWith(
      "conversation-a",
      "m4",
    );
    expect(state.earlierCursor.value).toBe("m3");
    api.getMessageHistory.mockResolvedValueOnce({
      messages: [message("m1"), message("m2")],
      nextCursor: null,
    });
    await state.loadEarlierMessages();
    expect(api.getMessageHistory).toHaveBeenLastCalledWith(
      "conversation-a",
      "m3",
      "backward",
    );
    expect(state.messages.value.map((item) => item.id)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
    ]);
  });

  it("ignores stale initial history responses and errors across A-B-A selection", async () => {
    const state = createState();
    const oldPage = deferred<MessageHistory>();
    api.getMessageHistory.mockReturnValueOnce(oldPage.promise);
    const initial = state.selectConversation("conversation-a");
    await state.selectConversation("conversation-b");
    api.getMessageHistory.mockResolvedValueOnce({
      messages: [message("current")],
      nextCursor: "current",
    });
    await state.selectConversation("conversation-a");
    oldPage.reject(new Error("Stale history failure"));
    await initial;
    expect(state.messages.value.map((item) => item.id)).toEqual(["current"]);
    expect(state.earlierCursor.value).toBe("current");
    expect(state.historyError.value).toBeNull();
  });

  it("recovers an empty conversation using latest history and supports retry after initial failure", async () => {
    const state = createState();
    api.getMessageHistory.mockRejectedValueOnce(new TypeError("Offline"));
    await state.selectConversation("conversation-a");
    expect(state.historyError.value).toBeTruthy();
    api.getMessageHistory.mockResolvedValueOnce({
      messages: [message("recovered")],
      nextCursor: null,
    });
    await state.recoverMessages();
    expect(api.getMessageHistory).toHaveBeenLastCalledWith(
      "conversation-a",
      undefined,
      "backward",
    );
    expect(state.messages.value[0]?.id).toBe("recovered");
    expect(state.historyError.value).toBeNull();
  });

  it("uses the recovery page cursor even if a newer realtime message arrives mid-request", async () => {
    const state = createState();
    api.getMessageHistory.mockResolvedValueOnce({
      messages: [message("m1")],
      nextCursor: null,
    });
    await state.selectConversation("conversation-a");
    const recoveringPage = deferred<MessageHistory>();
    api.getMessageHistory
      .mockReturnValueOnce(recoveringPage.promise)
      .mockResolvedValueOnce({
        messages: [message("m3"), message("m4")],
        nextCursor: null,
      });
    const recovering = state.recoverMessages();
    state.handleMessageCreated(message("m4"));
    recoveringPage.resolve({ messages: [message("m2")], nextCursor: "m2" });
    await recovering;
    expect(api.getMessageHistory).toHaveBeenLastCalledWith(
      "conversation-a",
      "m2",
    );
    expect(state.messages.value.map((item) => item.id)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
    ]);
    state.handleMessageCreated(
      message("outside", { conversationId: "conversation-b" }),
    );
    expect(state.messages.value).toHaveLength(4);
  });
});
