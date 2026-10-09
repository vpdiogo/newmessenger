import { computed, nextTick } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getConversations: vi.fn(),
  createConversation: vi.fn(),
  getMessageHistory: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock("./api/conversations", () => api);
vi.mock("./auth/session", () => ({
  session: { user: { sub: "owner", email: "owner@example.test" } },
}));

import type {
  Conversation,
  Message,
  MessageHistory,
} from "./api/conversations";
import { useConversationAnnouncements } from "./useConversationAnnouncements";
import {
  useConversationMessages,
  type MessageUpdateSource,
} from "./useConversationMessages";
import { useConversationRoute } from "./useConversationRoute";
import { useConversations } from "./useConversations";

function conversation(id: string): Conversation {
  return {
    id,
    createdAt: "",
    participant: { id: id + "-participant", email: id + "@example.test" },
  };
}

function message(id: string, conversationId = "first"): Message {
  return {
    id,
    clientMessageId: id,
    conversationId,
    senderId: "friend",
    content: id,
    createdAt: "2026-10-09T12:00:00Z",
  };
}

const disposers: (() => void)[] = [];
async function setup() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/app", component: {} }],
  });
  await router.push("/app?conversation=first");
  const data = useConversations();
  const route = useConversationRoute(router, data);
  const participant = computed(
    () =>
      data.conversations.value.find(
        (item) => item.id === route.selectedConversationId.value,
      )?.participant.email,
  );
  const announcements = useConversationAnnouncements(
    route.selectedConversationId,
    () => "owner",
    () => participant.value,
    computed(() => "connected" as const),
  );
  const sources: MessageUpdateSource[] = [];
  const messages = useConversationMessages(route.selectedConversationId, {
    beforeMessagesUpdate(source) {
      sources.push(source);
      return async () => {
        await nextTick();
      };
    },
    onIncomingMessages: announcements.announceIncomingMessages,
  });
  const dispose = () => {
    messages.dispose();
    route.dispose();
    data.dispose();
    announcements.dispose();
  };
  disposers.push(dispose);
  return { router, data, route, messages, announcements, sources, dispose };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getConversations.mockResolvedValue([
    conversation("first"),
    conversation("second"),
  ]);
  api.getMessageHistory.mockImplementation(async (id: string) => ({
    messages: [message("history-" + id, id)],
    nextCursor: null,
  }));
});
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

it("drives actual message loading from route-owned selection without resetting drafts on refresh", async () => {
  const { data, route, messages, sources } = await setup();
  await data.loadConversations();
  await vi.waitFor(() =>
    expect(messages.messages.value[0]?.id).toBe("history-first"),
  );
  expect(api.getMessageHistory).toHaveBeenCalledExactlyOnceWith(
    "first",
    undefined,
    "backward",
  );
  messages.messageContent.value = "retained";
  await data.loadConversations();
  await route.openConversation("first");
  expect(messages.messageContent.value).toBe("retained");
  expect(api.getMessageHistory).toHaveBeenCalledTimes(1);
  await route.openConversation("second");
  await vi.waitFor(() =>
    expect(messages.messages.value[0]?.id).toBe("history-second"),
  );
  expect(messages.messageContent.value).toBe("");
  expect(sources).toEqual(["initial", "initial"]);
});

it("preserves source-aware announcements and cancels a queued arrival when routing changes", async () => {
  const { data, route, messages, announcements, sources } = await setup();
  await data.loadConversations();
  await vi.waitFor(() => expect(messages.isLoadingMessages.value).toBe(false));
  expect(announcements.messageAnnouncement.value).toBe("");
  messages.handleMessageCreated(message("arrival"));
  messages.handleMessageCreated(message("arrival"));
  await vi.waitFor(() =>
    expect(announcements.messageAnnouncement.value).toBe(
      "first@example.test says: arrival",
    ),
  );
  expect(sources.filter((source) => source === "realtime")).toHaveLength(2);
  messages.handleMessageCreated(message("queued-old"));
  await route.openConversation("second");
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(announcements.messageAnnouncement.value).toBe("");
  expect(
    messages.messages.value.every((item) => item.conversationId === "second"),
  ).toBe(true);
});

it("invalidates actual in-flight history and effect publication after the feature is disposed", async () => {
  const { data, route, messages, announcements, dispose } = await setup();
  let resolve!: (history: MessageHistory) => void;
  api.getMessageHistory.mockReturnValueOnce(
    new Promise<MessageHistory>((accept) => {
      resolve = accept;
    }),
  );
  await data.loadConversations();
  expect(route.selectedConversationId.value).toBe("first");
  dispose();
  resolve({ messages: [message("late-history")], nextCursor: null });
  messages.handleMessageCreated(message("late-event"));
  await nextTick();
  await nextTick();
  expect(messages.messages.value).toEqual([]);
  expect(announcements.messageAnnouncement.value).toBe("");
});
