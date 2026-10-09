import { ref } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getConversations: vi.fn(),
  createConversation: vi.fn(),
}));
vi.mock("./api/conversations", () => api);
vi.mock("./auth/session", () => ({
  session: { user: { email: "owner@example.test" } },
}));

import { ApiError } from "./api/client";
import type { Conversation, Message } from "./api/conversations";
import { useConversations } from "./useConversations";

const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const thirdId = "00000000-0000-4000-8000-000000000003";

function conversation(id: string): Conversation {
  return {
    id,
    createdAt: "2026-10-08T12:00:00Z",
    participant: { id: `participant-${id}`, email: `${id}@example.test` },
  };
}

function incoming(conversationId: string): Message {
  return {
    id: "message",
    clientMessageId: "client-message",
    content: "Hello",
    senderId: "sender",
    conversationId,
    createdAt: "2026-10-08T12:00:00Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { resolve, reject, promise };
}

const states: ReturnType<typeof useConversations>[] = [];
async function setup(path = "/app") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/app", component: {} }],
  });
  await router.push(path);
  const selectedConversationId = ref<string | null>(null);
  const draft = ref("");
  const selectConversation = vi.fn(async (id: string | null) => {
    selectedConversationId.value = id;
    draft.value = "";
  });
  const state = useConversations(router, {
    selectedConversationId,
    selectConversation,
  });
  states.push(state);
  return { state, router, selectedConversationId, selectConversation, draft };
}

async function waitForRoute(
  router: Router,
  id: string | undefined,
): Promise<void> {
  await vi.waitFor(() =>
    expect(router.currentRoute.value.query.conversation).toBe(id),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getConversations.mockResolvedValue([
    conversation(firstId),
    conversation(secondId),
  ]);
  api.createConversation.mockResolvedValue(thirdId);
});
afterEach(() => {
  for (const state of states.splice(0)) state.dispose();
});

describe("conversation route selection", () => {
  it("restores a non-first conversation directly from the URL", async () => {
    const { state, selectedConversationId, selectConversation } = await setup(
      `/app?conversation=${secondId}`,
    );
    await state.loadConversations();
    expect(selectedConversationId.value).toBe(secondId);
    expect(selectConversation).toHaveBeenCalledExactlyOnceWith(secondId);
  });

  it.each([
    "",
    "?conversation=invalid",
    "?conversation=00000000-0000-4000-8000-999999999999",
    `?conversation=${firstId}&conversation=${secondId}`,
  ])("falls back safely for absent or invalid query %s", async (query) => {
    const { state, router, selectConversation } = await setup(
      `/app${query}${query ? "&" : "?"}keep=yes#anchor`,
    );
    const push = vi.spyOn(router, "push");
    const replace = vi.spyOn(router, "replace");
    await state.loadConversations();
    await waitForRoute(router, firstId);
    expect(selectConversation).toHaveBeenCalledExactlyOnceWith(firstId);
    expect(router.currentRoute.value.query.keep).toBe("yes");
    expect(router.currentRoute.value.hash).toBe("#anchor");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("preserves the query after a failed initial fetch, then restores it on retry", async () => {
    const { state, router, selectConversation } = await setup(
      `/app?conversation=${secondId}`,
    );
    api.getConversations.mockRejectedValueOnce(new TypeError("Offline"));
    await state.loadConversations();
    expect(router.currentRoute.value.query.conversation).toBe(secondId);
    expect(selectConversation).not.toHaveBeenCalled();
    await state.loadConversations();
    expect(selectConversation).toHaveBeenCalledExactlyOnceWith(secondId);
    expect(state.listError.value).toBeNull();
  });

  it("clears a removed selection and query when the list becomes empty", async () => {
    const { state, router, selectedConversationId, draft } = await setup(
      `/app?conversation=${secondId}&keep=yes`,
    );
    await state.loadConversations();
    draft.value = "old draft";
    api.getConversations.mockResolvedValueOnce([]);
    await state.loadConversations();
    await waitForRoute(router, undefined);
    expect(selectedConversationId.value).toBeNull();
    expect(draft.value).toBe("");
    expect(router.currentRoute.value.query.keep).toBe("yes");
  });

  it("restores Back/Forward selections while repeated clicks and refresh retain the draft", async () => {
    const { state, router, selectedConversationId, selectConversation, draft } =
      await setup(`/app?conversation=${firstId}&keep=yes`);
    await state.loadConversations();
    await state.openConversation(secondId);
    draft.value = "keep this draft";
    const calls = selectConversation.mock.calls.length;
    await state.openConversation(secondId);
    await state.loadConversations();
    expect(draft.value).toBe("keep this draft");
    expect(selectConversation).toHaveBeenCalledTimes(calls);
    router.back();
    await vi.waitFor(() => expect(selectedConversationId.value).toBe(firstId));
    router.forward();
    await vi.waitFor(() => expect(selectedConversationId.value).toBe(secondId));
    expect(router.currentRoute.value.query.keep).toBe("yes");
  });

  it("uses the latest route when an initial list response arrives late", async () => {
    const { state, router, selectConversation } = await setup(
      `/app?conversation=${firstId}`,
    );
    const response = deferred<Conversation[]>();
    api.getConversations.mockReturnValueOnce(response.promise);
    const loading = state.loadConversations();
    await router.push(`/app?conversation=${secondId}`);
    response.resolve([conversation(firstId), conversation(secondId)]);
    await loading;
    expect(selectConversation).toHaveBeenCalledExactlyOnceWith(secondId);
  });

  it("does not loop when route correction is aborted", async () => {
    const { state, router } = await setup("/app?conversation=invalid");
    router.beforeEach(() => false);
    const replace = vi.spyOn(router, "replace");
    await state.loadConversations();
    await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(replace).toHaveBeenCalledTimes(1);
  });
});

describe("conversation discovery and refresh", () => {
  it("coalesces an event burst and follows up for events received during a stale fetch", async () => {
    const { state, selectedConversationId, draft, selectConversation } =
      await setup(`/app?conversation=${firstId}`);
    await state.loadConversations();
    draft.value = "keep this draft";
    const response = deferred<Conversation[]>();
    api.getConversations
      .mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce([
        conversation(thirdId),
        conversation(firstId),
        conversation(secondId),
      ]);
    const loading = state.loadConversations();
    for (let index = 0; index < 20; index++)
      state.discoverConversation(incoming(thirdId));
    expect(api.getConversations).toHaveBeenCalledTimes(2);
    response.resolve([conversation(firstId), conversation(secondId)]);
    await loading;
    expect(api.getConversations).toHaveBeenCalledTimes(3);
    expect(state.conversations.value[0]?.id).toBe(thirdId);
    expect(selectedConversationId.value).toBe(firstId);
    expect(draft.value).toBe("keep this draft");
    expect(selectConversation).toHaveBeenCalledTimes(1);
    state.discoverConversation(incoming(thirdId));
    expect(api.getConversations).toHaveBeenCalledTimes(3);
  });

  it("keeps existing data, selection, and draft after failure and recovers on retry", async () => {
    const { state, selectedConversationId, draft } = await setup(
      `/app?conversation=${secondId}`,
    );
    await state.loadConversations();
    draft.value = "draft";
    api.getConversations.mockRejectedValueOnce(new TypeError("Offline"));
    state.discoverConversation(incoming(thirdId));
    await vi.waitFor(() => expect(state.listError.value).toBeTruthy());
    expect(state.conversations.value).toHaveLength(2);
    expect(selectedConversationId.value).toBe(secondId);
    expect(draft.value).toBe("draft");
    api.getConversations.mockResolvedValueOnce([
      conversation(thirdId),
      conversation(firstId),
      conversation(secondId),
    ]);
    await state.loadConversations();
    expect(state.listError.value).toBeNull();
    expect(draft.value).toBe("draft");
  });

  it("ignores pending responses and discovery callbacks after disposal", async () => {
    const { state, selectConversation } = await setup();
    const response = deferred<Conversation[]>();
    api.getConversations.mockReturnValueOnce(response.promise);
    const loading = state.loadConversations();
    state.dispose();
    response.resolve([conversation(firstId)]);
    await loading;
    state.discoverConversation(incoming(thirdId));
    expect(state.conversations.value).toEqual([]);
    expect(selectConversation).not.toHaveBeenCalled();
    expect(api.getConversations).toHaveBeenCalledTimes(1);
  });
});

describe("conversation creation feedback", () => {
  it("rejects self-conversation case-insensitively without an HTTP request", async () => {
    const { state } = await setup();
    state.participantEmail.value = "  OWNER@EXAMPLE.TEST  ";
    await state.submitConversation();
    expect(api.createConversation).not.toHaveBeenCalled();
    expect(state.creationError.value).toContain("yourself");
  });

  it.each([
    [new ApiError(404, "Participant not found"), "No registered user"],
    [new ApiError(400, "Invalid request"), "Check the email"],
    [new ApiError(500, "Error"), "Please try again"],
    [new TypeError("Offline"), "Check your connection"],
  ])(
    "maps creation error %s to actionable feedback",
    async (error, expected) => {
      const { state } = await setup();
      state.participantEmail.value = "person@example.test";
      api.createConversation.mockRejectedValueOnce(error);
      await state.submitConversation();
      expect(state.creationError.value).toContain(expected);
    },
  );

  it("clears obsolete input errors without hiding a list error", async () => {
    const { state } = await setup();
    api.getConversations.mockRejectedValueOnce(new TypeError("Offline"));
    await state.loadConversations();
    state.participantEmail.value = "owner@example.test";
    await state.submitConversation();
    expect(state.creationError.value).toBeTruthy();
    state.participantEmail.value = "someone@example.test";
    expect(state.creationError.value).toBeNull();
    expect(state.listError.value).toBeTruthy();
  });

  it("selects a successfully created conversation in the URL after refreshing", async () => {
    const { state, router, selectedConversationId } = await setup(
      `/app?conversation=${firstId}&keep=yes`,
    );
    await state.loadConversations();
    api.getConversations.mockResolvedValueOnce([
      conversation(thirdId),
      conversation(firstId),
    ]);
    state.participantEmail.value = "Person@Example.Test";
    await state.submitConversation();
    expect(api.createConversation).toHaveBeenCalledExactlyOnceWith(
      "person@example.test",
    );
    expect(selectedConversationId.value).toBe(thirdId);
    expect(router.currentRoute.value.query.conversation).toBe(thirdId);
    expect(router.currentRoute.value.query.keep).toBe("yes");
  });

  it("does not overwrite newer navigation or input when creation finishes late", async () => {
    const { state, router, selectedConversationId } = await setup(
      `/app?conversation=${firstId}`,
    );
    await state.loadConversations();
    const response = deferred<string>();
    api.createConversation.mockReturnValueOnce(response.promise);
    api.getConversations.mockResolvedValueOnce([
      conversation(thirdId),
      conversation(firstId),
      conversation(secondId),
    ]);
    state.participantEmail.value = "person@example.test";
    const creating = state.submitConversation();
    await state.openConversation(secondId);
    state.participantEmail.value = "new-input@example.test";
    response.resolve(thirdId);
    await creating;
    expect(selectedConversationId.value).toBe(secondId);
    expect(router.currentRoute.value.query.conversation).toBe(secondId);
    expect(state.participantEmail.value).toBe("new-input@example.test");
  });

  it("distinguishes successful creation from a failed list refresh", async () => {
    const { state } = await setup(`/app?conversation=${firstId}`);
    await state.loadConversations();
    api.getConversations.mockRejectedValueOnce(new TypeError("Refresh failed"));
    state.participantEmail.value = "person@example.test";
    await state.submitConversation();
    expect(state.creationError.value).toContain("conversation was created");
    expect(state.listError.value).toBeTruthy();
  });

  it("does not restore obsolete creation feedback after editing during the list refresh", async () => {
    const { state } = await setup(`/app?conversation=${firstId}`);
    await state.loadConversations();
    const response = deferred<Conversation[]>();
    api.getConversations.mockReturnValueOnce(response.promise);
    state.participantEmail.value = "original@example.test";
    const creating = state.submitConversation();
    await vi.waitFor(() =>
      expect(api.getConversations).toHaveBeenCalledTimes(2),
    );
    expect(state.participantEmail.value).toBe("");
    state.participantEmail.value = "new@example.test";
    response.reject(new TypeError("Refresh failed"));
    await creating;
    expect(state.creationError.value).toBeNull();
    expect(state.listError.value).toBeTruthy();
    expect(state.participantEmail.value).toBe("new@example.test");
  });

  it("does not publish obsolete creation feedback when input changes during POST and refresh then fails", async () => {
    const { state } = await setup(`/app?conversation=${firstId}`);
    await state.loadConversations();
    const response = deferred<string>();
    api.createConversation.mockReturnValueOnce(response.promise);
    api.getConversations.mockRejectedValueOnce(new TypeError("Refresh failed"));
    state.participantEmail.value = "original@example.test";
    const creating = state.submitConversation();
    state.participantEmail.value = "new@example.test";
    response.resolve(thirdId);
    await creating;
    expect(state.creationError.value).toBeNull();
    expect(state.listError.value).toBeTruthy();
    expect(state.participantEmail.value).toBe("new@example.test");
  });
});
