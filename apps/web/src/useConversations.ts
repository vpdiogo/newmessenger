import { ref, watch } from "vue";

import { ApiError } from "./api/client";
import {
  createConversation,
  getConversations,
  type Conversation,
  type Message,
} from "./api/conversations";
import { session } from "./auth/session";

export function useConversations() {
  const conversations = ref<Conversation[]>([]);
  const participantEmail = ref("");
  const isLoadingConversations = ref(false);
  const isCreatingConversation = ref(false);
  const listError = ref<string | null>(null);
  const creationError = ref<string | null>(null);
  const hasLoadedConversations = ref(false);
  let disposed = false;
  let refreshPromise: Promise<boolean> | null = null;
  let refreshRequested = false;
  let inputVersion = 0;

  const stopWatchingInput = watch(
    participantEmail,
    () => {
      inputVersion += 1;
      creationError.value = null;
    },
    { flush: "sync" },
  );

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
          hasLoadedConversations.value = true;
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

  async function submitConversation(): Promise<string | null> {
    if (disposed || isCreatingConversation.value) return null;
    const email = participantEmail.value.trim().toLowerCase();
    creationError.value = null;
    if (!email) {
      creationError.value =
        "Enter the email of the person you want to message.";
      return null;
    }
    if (email === session.user?.email.toLowerCase()) {
      creationError.value = "You cannot start a conversation with yourself.";
      return null;
    }
    let version = inputVersion;
    isCreatingConversation.value = true;
    try {
      const id = await createConversation(email);
      if (disposed) return null;
      if (inputVersion === version) {
        participantEmail.value = "";
        version = inputVersion;
      }
      const refreshed = await loadConversations();
      if (disposed) return null;
      if (!refreshed && inputVersion === version) {
        creationError.value =
          "The conversation was created, but the list could not be updated. Use Refresh to find it.";
      }
      return refreshed ? id : null;
    } catch (error) {
      if (disposed || inputVersion !== version) return null;
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
      return null;
    } finally {
      if (!disposed) isCreatingConversation.value = false;
    }
  }

  function dispose(): void {
    disposed = true;
    stopWatchingInput();
  }

  return {
    conversations,
    hasLoadedConversations,
    participantEmail,
    isLoadingConversations,
    isCreatingConversation,
    listError,
    creationError,
    loadConversations,
    submitConversation,
    discoverConversation,
    dispose,
  };
}
