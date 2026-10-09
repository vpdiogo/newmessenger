import { computed, ref, watch, type Ref } from "vue";

import { ApiError } from "./api/client";
import {
  getMessageHistory,
  sendMessage,
  type Message,
} from "./api/conversations";
import { appendMessages } from "./messages";

export const MESSAGE_CONTENT_LIMIT = 2000;

type PendingMessage = {
  clientMessageId: string;
  content: string;
  conversationId: string;
};

export type MessageUpdateSource =
  "initial" | "earlier" | "realtime" | "recovery" | "local-send";

export type MessageUpdateEffects = {
  beforeMessagesUpdate?: (
    source: MessageUpdateSource,
    isCurrent: () => boolean,
  ) => () => Promise<void>;
  onIncomingMessages?: (messages: Message[]) => void;
};

export function useConversationMessages(
  selectedConversationId: Readonly<Ref<string | null>>,
  effects: MessageUpdateEffects = {},
) {
  const messages = ref<Message[]>([]);
  const earlierCursor = ref<string | null>(null);
  const messageContent = ref("");
  const pendingMessage = ref<PendingMessage | null>(null);
  const isLoadingMessages = ref(false);
  const isLoadingEarlier = ref(false);
  const isSendingMessage = ref(false);
  const sendError = ref<string | null>(null);
  const historyError = ref<string | null>(null);
  let selectionVersion = 0;
  let disposed = false;
  let draftVersion = 0;
  let recovering = false;
  let recoveryRequested = false;
  let historyLoaded = false;
  let recoveryCursor: string | undefined;
  let historyFailure: "latest" | "earlier" | "recovery" | null = null;

  const contentLength = computed(() => messageContent.value.trim().length);
  const contentError = computed(() =>
    contentLength.value > MESSAGE_CONTENT_LIMIT
      ? `Messages must contain at most ${MESSAGE_CONTENT_LIMIT.toLocaleString("en-US")} characters. Shorten your message before sending.`
      : null,
  );
  const messageErrorMessage = computed(
    () => contentError.value ?? sendError.value ?? historyError.value,
  );

  const stopWatchingDraft = watch(
    messageContent,
    () => {
      draftVersion += 1;
      sendError.value = null;
      if (pendingMessage.value?.content !== messageContent.value.trim()) {
        pendingMessage.value = null;
      }
    },
    { flush: "sync" },
  );

  function isCurrent(version: number): boolean {
    return !disposed && version === selectionVersion;
  }

  async function applyMessages(
    incoming: Message[],
    version: number,
    source: MessageUpdateSource,
  ): Promise<void> {
    if (!isCurrent(version)) return;
    const knownIds = new Set(messages.value.map((message) => message.id));
    const novelMessages =
      source === "realtime" || source === "recovery"
        ? incoming.filter((message) => {
            if (knownIds.has(message.id)) return false;
            knownIds.add(message.id);
            return true;
          })
        : [];
    const afterRender = effects.beforeMessagesUpdate?.(source, () =>
      isCurrent(version),
    );
    messages.value = appendMessages(messages.value, incoming);
    await afterRender?.();
    if (!isCurrent(version)) return;
    if (novelMessages.length) effects.onIncomingMessages?.(novelMessages);
  }

  async function loadLatestMessages(version: number): Promise<void> {
    const conversationId = selectedConversationId.value;
    if (!conversationId || !isCurrent(version)) return;
    isLoadingMessages.value = true;
    historyError.value = null;
    historyFailure = null;
    try {
      const history = await getMessageHistory(
        conversationId,
        undefined,
        "backward",
      );
      if (!isCurrent(version)) return;
      earlierCursor.value = history.nextCursor;
      recoveryCursor = history.messages.at(-1)?.id;
      historyLoaded = true;
      isLoadingMessages.value = false;
      await applyMessages(history.messages, version, "initial");
    } catch {
      if (isCurrent(version)) {
        historyFailure = "latest";
        historyError.value =
          "Unable to load messages. Please retry loading history.";
      }
    } finally {
      if (isCurrent(version)) {
        isLoadingMessages.value = false;
        if (recoveryRequested) {
          recoveryRequested = false;
          void recoverMessages();
        }
      }
    }
  }

  async function loadSelectedConversation(): Promise<void> {
    const version = ++selectionVersion;
    messages.value = [];
    earlierCursor.value = null;
    pendingMessage.value = null;
    messageContent.value = "";
    sendError.value = null;
    historyError.value = null;
    isLoadingEarlier.value = false;
    isLoadingMessages.value = false;
    isSendingMessage.value = false;
    recovering = false;
    recoveryRequested = false;
    historyLoaded = false;
    recoveryCursor = undefined;
    historyFailure = null;
    await loadLatestMessages(version);
  }

  async function loadEarlierMessages(): Promise<void> {
    const conversationId = selectedConversationId.value;
    const cursor = earlierCursor.value;
    if (
      !conversationId ||
      !cursor ||
      isLoadingEarlier.value ||
      isLoadingMessages.value
    )
      return;
    const version = selectionVersion;
    isLoadingEarlier.value = true;
    historyError.value = null;
    historyFailure = null;
    try {
      const history = await getMessageHistory(
        conversationId,
        cursor,
        "backward",
      );
      if (!isCurrent(version)) return;
      earlierCursor.value = history.nextCursor;
      await applyMessages(history.messages, version, "earlier");
    } catch {
      if (isCurrent(version)) {
        historyFailure = "earlier";
        historyError.value =
          "Unable to load earlier messages. Please try again.";
      }
    } finally {
      if (isCurrent(version)) isLoadingEarlier.value = false;
    }
  }

  async function submitMessage(): Promise<void> {
    const conversationId = selectedConversationId.value;
    const content = messageContent.value.trim();
    if (
      !conversationId ||
      !content ||
      contentError.value ||
      isSendingMessage.value ||
      isLoadingMessages.value
    )
      return;
    const version = selectionVersion;
    const submittedDraftVersion = draftVersion;
    const request: PendingMessage = pendingMessage.value ?? {
      clientMessageId: crypto.randomUUID(),
      content,
      conversationId,
    };
    isSendingMessage.value = true;
    sendError.value = null;
    try {
      const message = await sendMessage(
        conversationId,
        request.clientMessageId,
        request.content,
      );
      if (!isCurrent(version)) return;
      if (draftVersion === submittedDraftVersion) messageContent.value = "";
      pendingMessage.value = null;
      await applyMessages([message], version, "local-send");
    } catch (error) {
      if (!isCurrent(version) || draftVersion !== submittedDraftVersion) return;
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        ![408, 429].includes(error.status)
      ) {
        pendingMessage.value = null;
        sendError.value =
          error.status === 400 || error.status === 413
            ? "The message was rejected. Check its content and the 2,000-character limit before sending again."
            : error.status === 401
              ? "Your session has expired. Log in again to send this message."
              : error.status === 403 || error.status === 404
                ? "This conversation is unavailable. Refresh your conversations before sending again."
                : "The message was rejected. Review the draft before sending again.";
      } else {
        pendingMessage.value = request;
        sendError.value =
          error instanceof ApiError && error.status === 429
            ? "Too many requests. Wait before retrying this message."
            : "Unable to confirm the message was sent. Retry unchanged to avoid duplicates; editing sends a new message.";
      }
    } finally {
      if (isCurrent(version)) isSendingMessage.value = false;
    }
  }

  function handleMessageCreated(message: Message): void {
    if (message.conversationId !== selectedConversationId.value) return;
    void applyMessages([message], selectionVersion, "realtime");
  }

  async function recoverMessages(): Promise<void> {
    const conversationId = selectedConversationId.value;
    if (!conversationId) return;
    if (isLoadingMessages.value || recovering) {
      recoveryRequested = true;
      return;
    }
    const version = selectionVersion;
    let cursor = recoveryCursor;
    if (!historyLoaded) {
      await loadLatestMessages(version);
      return;
    }
    recovering = true;
    historyError.value = null;
    historyFailure = null;
    try {
      do {
        const history = await getMessageHistory(conversationId, cursor);
        if (!isCurrent(version)) return;
        await applyMessages(history.messages, version, "recovery");
        if (!isCurrent(version)) return;
        recoveryCursor = history.messages.at(-1)?.id ?? recoveryCursor;
        cursor = history.nextCursor ?? undefined;
      } while (cursor && isCurrent(version));
    } catch {
      if (isCurrent(version)) {
        historyFailure = "recovery";
        historyError.value =
          "Unable to recover messages. Please retry loading history.";
      }
    } finally {
      if (isCurrent(version)) {
        recovering = false;
        if (recoveryRequested) {
          recoveryRequested = false;
          void recoverMessages();
        }
      }
    }
  }

  async function retryHistory(): Promise<void> {
    if (historyFailure === "earlier") {
      await loadEarlierMessages();
    } else if (historyFailure === "latest") {
      if (!isLoadingMessages.value) await loadLatestMessages(selectionVersion);
    } else {
      await recoverMessages();
    }
  }

  const stopWatchingSelection = watch(
    selectedConversationId,
    () => {
      void loadSelectedConversation();
    },
    { immediate: true, flush: "sync" },
  );

  function dispose(): void {
    disposed = true;
    selectionVersion += 1;
    stopWatchingSelection();
    stopWatchingDraft();
  }

  return {
    selectedConversationId,
    messages,
    earlierCursor,
    messageContent,
    pendingMessage,
    isLoadingMessages,
    isLoadingEarlier,
    isSendingMessage,
    contentLength,
    contentError,
    messageErrorMessage,
    historyError,
    submitMessage,
    loadEarlierMessages,
    recoverMessages,
    retryHistory,
    handleMessageCreated,
    dispose,
  };
}
