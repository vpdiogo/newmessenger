import { ref, watch, type Ref } from "vue";
import type { Router } from "vue-router";

import { ApiError } from "./api/client";
import {
  createConversation,
  getConversations,
  type Conversation,
  type Message,
} from "./api/conversations";
import { session } from "./auth/session";

type ConversationSelection = {
  selectedConversationId: Ref<string | null>;
  selectConversation: (conversationId: string | null) => Promise<void>;
};

export function useConversations(
  router: Router,
  selection: ConversationSelection,
) {
  const conversations = ref<Conversation[]>([]);
  const participantEmail = ref("");
  const isLoadingConversations = ref(false);
  const isCreatingConversation = ref(false);
  const listError = ref<string | null>(null);
  const creationError = ref<string | null>(null);
  let loaded = false;
  let disposed = false;
  let refreshPromise: Promise<boolean> | null = null;
  let refreshRequested = false;
  let navigationVersion = 0;
  let navigationTarget: string | null = null;
  let selectionIntent = 0;
  let inputVersion = 0;

  const stopWatchingInput = watch(
    participantEmail,
    () => {
      inputVersion += 1;
      creationError.value = null;
    },
    { flush: "sync" },
  );

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
      !loaded ||
      disposed ||
      navigationTarget ||
      router.currentRoute.value.path !== "/app"
    )
      return;
    const query = router.currentRoute.value.query;
    const rawId = query.conversation;
    const requestedId = typeof rawId === "string" ? rawId.toLowerCase() : null;
    const selected =
      conversations.value.find(
        (conversation) => conversation.id === requestedId,
      ) ?? conversations.value[0];
    const id = selected?.id ?? null;
    if (id !== selection.selectedConversationId.value)
      void selection.selectConversation(id);
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
        listError.value =
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
      !conversations.value.some((conversation) => conversation.id === id)
    )
      return;
    selectionIntent += 1;
    if (
      selection.selectedConversationId.value === id &&
      router.currentRoute.value.query.conversation === id &&
      !navigationTarget
    )
      return;
    await navigateToConversation(id);
  }

  function loadConversations(): Promise<boolean> {
    if (disposed) return Promise.resolve(false);
    if (refreshPromise) {
      refreshRequested = true;
      return refreshPromise;
    }
    refreshPromise = refreshConversations();
    return refreshPromise;
  }

  async function refreshConversations(): Promise<boolean> {
    isLoadingConversations.value = true;
    try {
      do {
        refreshRequested = false;
        listError.value = null;
        try {
          const result = await getConversations();
          if (disposed) return false;
          conversations.value = result;
          loaded = true;
          synchronizeSelection();
        } catch {
          if (!disposed)
            listError.value = "Unable to load conversations. Please try again.";
          return false;
        }
      } while (refreshRequested && !disposed);
      return true;
    } finally {
      if (!disposed) isLoadingConversations.value = false;
      refreshPromise = null;
    }
  }

  function discoverConversation(message: Message): void {
    if (
      disposed ||
      conversations.value.some(
        (conversation) => conversation.id === message.conversationId,
      )
    )
      return;
    void loadConversations();
  }

  async function submitConversation(): Promise<void> {
    if (disposed || isCreatingConversation.value) return;
    const email = participantEmail.value.trim().toLowerCase();
    creationError.value = null;
    if (!email) {
      creationError.value =
        "Enter the email of the person you want to message.";
      return;
    }
    if (email === session.user?.email.toLowerCase()) {
      creationError.value = "You cannot start a conversation with yourself.";
      return;
    }
    const version = inputVersion;
    const intent = selectionIntent;
    isCreatingConversation.value = true;
    try {
      const id = await createConversation(email);
      if (disposed) return;
      if (inputVersion === version) participantEmail.value = "";
      const refreshed = await loadConversations();
      if (disposed) return;
      if (!refreshed) {
        creationError.value =
          "The conversation was created, but the list could not be updated. Use Refresh to find it.";
      } else if (selectionIntent === intent) {
        await navigateToConversation(id);
      }
    } catch (error) {
      if (disposed || inputVersion !== version) return;
      creationError.value =
        error instanceof ApiError
          ? error.status === 404
            ? "No registered user was found with this email."
            : error.status === 400
              ? "Check the email address before starting a conversation."
              : error.status === 401
                ? "Your session has expired. Log in again to start a conversation."
                : error.status === 429
                  ? "Too many requests. Wait before starting another conversation."
                  : "Unable to create the conversation. Please try again."
          : "Unable to create the conversation. Check your connection and try again.";
    } finally {
      if (!disposed) isCreatingConversation.value = false;
    }
  }

  function dispose(): void {
    disposed = true;
    navigationVersion += 1;
    stopWatchingInput();
    stopWatchingRoute();
  }

  return {
    conversations,
    participantEmail,
    isLoadingConversations,
    isCreatingConversation,
    listError,
    creationError,
    loadConversations,
    openConversation,
    submitConversation,
    discoverConversation,
    dispose,
  };
}
