import { useFeedback } from "./i18n";
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
  const { key: listError, message: listErrorText } = useFeedback();
  const { key: creationError, message: creationErrorText } = useFeedback();
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
          if (!disposed) listError.value = "conversation.listFailed";
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
      creationError.value = "conversation.emailRequired";
      return null;
    }
    if (email === session.user?.email.toLowerCase()) {
      creationError.value = "conversation.self";
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
        creationError.value = "conversation.createdRefreshFailed";
      }
      return refreshed ? id : null;
    } catch (error) {
      if (disposed || inputVersion !== version) return null;
      creationError.value =
        error instanceof ApiError
          ? error.status === 404
            ? "conversation.notFound"
            : error.status === 400
              ? "conversation.invalidEmail"
              : error.status === 401
                ? "conversation.sessionExpired"
                : error.status === 429
                  ? "conversation.rateLimited"
                  : "conversation.createFailed"
          : "conversation.networkFailed";
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
    listError: listErrorText,
    creationError: creationErrorText,
    loadConversations,
    submitConversation,
    discoverConversation,
    dispose,
  };
}
