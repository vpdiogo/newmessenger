import { isReadonly, ref } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { expect, it, vi } from "vitest";

import type { Conversation } from "./api/conversations";
import { useConversationRoute } from "./useConversationRoute";

async function setup() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/app", component: {} }],
  });
  await router.push("/app?conversation=first");
  const state = {
    conversations: ref<Conversation[]>([
      {
        id: "first",
        createdAt: "",
        participant: { id: "friend", email: "friend@example.test" },
      },
      {
        id: "second",
        createdAt: "",
        participant: { id: "other", email: "other@example.test" },
      },
    ]),
    hasLoadedConversations: ref(true),
    isLoadingConversations: ref(false),
  };
  return { router, state, route: useConversationRoute(router, state) };
}

it("exposes a read-only selected ID and owns navigation error feedback", async () => {
  const { router, route, state } = await setup();
  try {
    expect(isReadonly(route.selectedConversationId)).toBe(true);
    expect(route.selectedConversationId.value).toBe("first");
    vi.spyOn(router, "push").mockRejectedValueOnce(
      new Error("Navigation failed"),
    );
    await route.openConversation("second");
    expect(route.selectedConversationId.value).toBe("first");
    expect(route.navigationError.value).toContain("Unable to select");
    state.isLoadingConversations.value = true;
    expect(route.navigationError.value).toBeNull();
  } finally {
    route.dispose();
  }
});

it("keeps requested selection unresolved until the list is known, then resolves successful emptiness", async () => {
  const { router, route, state } = await setup();
  route.dispose();
  state.hasLoadedConversations.value = false;
  state.conversations.value = [];
  const pending = useConversationRoute(router, state);
  try {
    expect(pending.selectedConversationId.value).toBeNull();
    expect(router.currentRoute.value.query.conversation).toBe("first");
    state.hasLoadedConversations.value = true;
    await vi.waitFor(() =>
      expect(router.currentRoute.value.query.conversation).toBeUndefined(),
    );
    expect(pending.selectedConversationId.value).toBeNull();
  } finally {
    pending.dispose();
  }
});

it("stops route/list side effects after disposal", async () => {
  const { router, route, state } = await setup();
  route.dispose();
  state.conversations.value = [];
  await router.push("/app?conversation=second");
  expect(route.selectedConversationId.value).toBe("first");
  expect(router.currentRoute.value.query.conversation).toBe("second");
});
