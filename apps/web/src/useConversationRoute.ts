import { readonly, ref, watch, type Ref } from "vue";
import type { Router } from "vue-router";

import type { Conversation } from "./api/conversations";

type ConversationRouteState = {
  conversations: Readonly<Ref<readonly Conversation[]>>;
  hasLoadedConversations: Readonly<Ref<boolean>>;
  isLoadingConversations: Readonly<Ref<boolean>>;
};

export function useConversationRoute(
  router: Router,
  state: ConversationRouteState,
) {
  const selectedConversationId = ref<string | null>(null);
  const navigationError = ref<string | null>(null);
  let navigationVersion = 0;
  let navigationTarget: string | null = null;
  let selectionIntent = 0;
  let disposed = false;

  const stopWatchingRoute = watch(
    () => router.currentRoute.value.fullPath,
    (path) => {
      if (path !== navigationTarget) selectionIntent += 1;
      synchronizeSelection();
    },
    { flush: "sync" },
  );

  function synchronizeSelection(rewrite = true): void {
    if (
      !state.hasLoadedConversations.value ||
      disposed ||
      navigationTarget ||
      router.currentRoute.value.path !== "/app"
    )
      return;
    const query = router.currentRoute.value.query;
    const rawId = query.conversation;
    const requestedId = typeof rawId === "string" ? rawId.toLowerCase() : null;
    const selected =
      state.conversations.value.find(
        (conversation) => conversation.id === requestedId,
      ) ?? state.conversations.value[0];
    const id = selected?.id ?? null;
    if (id !== selectedConversationId.value) selectedConversationId.value = id;
    if (
      rewrite &&
      ((id && rawId !== id) || (!id && Object.hasOwn(query, "conversation")))
    ) {
      void navigateToConversation(id, true);
    }
  }

  async function navigateToConversation(
    id: string | null,
    replace = false,
  ): Promise<void> {
    if (disposed || router.currentRoute.value.path !== "/app") return;
    const route = router.currentRoute.value;
    const query = { ...route.query };
    if (id) query.conversation = id;
    else delete query.conversation;
    const location = { path: "/app", query, hash: route.hash };
    const version = ++navigationVersion;
    navigationTarget = router.resolve(location).fullPath;
    let completed = false;
    try {
      const failure = replace
        ? await router.replace(location)
        : await router.push(location);
      completed = !failure;
    } catch {
      if (!disposed && version === navigationVersion)
        navigationError.value =
          "Unable to select the conversation. Please try again.";
    } finally {
      if (!disposed && version === navigationVersion) {
        navigationTarget = null;
        synchronizeSelection(completed);
      }
    }
  }

  async function openConversation(id: string): Promise<void> {
    if (
      disposed ||
      !state.conversations.value.some((conversation) => conversation.id === id)
    )
      return;
    selectionIntent += 1;
    if (
      selectedConversationId.value === id &&
      router.currentRoute.value.query.conversation === id &&
      !navigationTarget
    )
      return;
    await navigateToConversation(id);
  }

  const stopWatchingList = watch(
    [state.conversations, state.hasLoadedConversations],
    () => synchronizeSelection(),
    { immediate: true, flush: "sync" },
  );
  const stopWatchingRefresh = watch(
    state.isLoadingConversations,
    (loading) => {
      if (loading) navigationError.value = null;
    },
    { flush: "sync" },
  );

  function captureSelectionIntent(): number {
    return selectionIntent;
  }

  async function selectCreatedConversation(
    id: string,
    intent: number,
  ): Promise<void> {
    if (disposed || intent !== selectionIntent) return;
    await navigateToConversation(id);
  }

  function dispose(): void {
    disposed = true;
    navigationVersion += 1;
    stopWatchingRoute();
    stopWatchingList();
    stopWatchingRefresh();
  }

  return {
    selectedConversationId: readonly(selectedConversationId),
    navigationError: readonly(navigationError),
    openConversation,
    captureSelectionIntent,
    selectCreatedConversation,
    dispose,
  };
}
