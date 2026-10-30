import { t, formatNumber, useFeedback, type PlainKey } from "./i18n";
import { computed, reactive, ref, shallowReactive, watch, type Ref } from "vue";

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
  draftVersion: number;
  status: "sending" | "failed" | "rejected";
  error: PlainKey | null;
};

type ConversationDraft = {
  content: string;
  version: number;
  attempt: PendingMessage | null;
  confirmation: Message | null;
};

export type MessageRecoveryState = Pick<
  PendingMessage,
  "content" | "status" | "error"
>;

export type MessageUpdateSource =
  "initial" | "earlier" | "realtime" | "recovery" | "local-send";

export type MessageSubmissionResult = "sent" | "failed" | "ignored" | "stale";

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
  const drafts = shallowReactive(new Map<string, ConversationDraft>());
  const unselectedDraft = ref("");
  const selectedDraft = computed(() =>
    selectedConversationId.value
      ? drafts.get(selectedConversationId.value)
      : undefined,
  );
  const messageContent = computed({
    get: () => selectedDraft.value?.content ?? unselectedDraft.value,
    set: (content: string) => {
      if (disposed) return;
      const id = selectedConversationId.value;
      if (!id) {
        unselectedDraft.value = content;
        return;
      }
      const draft = getDraft(id);
      if (draft.content === content) return;
      draft.content = content;
      draft.version += 1;
      if (draft.attempt?.status === "rejected") draft.attempt = null;
      pruneDraft(id, draft);
    },
  });
  const pendingMessage = computed(() => {
    const attempt = selectedDraft.value?.attempt;
    return attempt && attempt.status !== "rejected" ? attempt : null;
  });
  const recoveryAttempt = computed(() => {
    const draft = selectedDraft.value;
    return draft?.attempt && draft.content.trim() !== draft.attempt.content
      ? draft.attempt
      : null;
  });
  const isLoadingMessages = ref(false);
  const isLoadingEarlier = ref(false);
  const isSendingMessage = computed(
    () => selectedDraft.value?.attempt?.status === "sending",
  );
  const sendErrorText = computed(() => {
    const error = selectedDraft.value?.attempt?.error;
    return error ? t(error) : null;
  });
  const { key: historyError, message: historyErrorText } = useFeedback();
  let selectionVersion = 0;
  let disposed = false;
  let recovering = false;
  let recoveryRequested = false;
  let historyLoaded = false;
  let recoveryCursor: string | undefined;
  let historyFailure: "latest" | "earlier" | "recovery" | null = null;

  const contentLength = computed(() => messageContent.value.trim().length);
  const contentError = computed(() =>
    contentLength.value > MESSAGE_CONTENT_LIMIT
      ? t("message.limit", { limit: formatNumber(MESSAGE_CONTENT_LIMIT) })
      : null,
  );
  const messageErrorMessage = computed(
    () =>
      contentError.value ??
      (recoveryAttempt.value ? null : sendErrorText.value) ??
      historyErrorText.value,
  );

  function getDraft(id: string): ConversationDraft {
    let draft = drafts.get(id);
    if (!draft) {
      draft = reactive({
        content: "",
        version: 0,
        attempt: null,
        confirmation: null,
      });
      drafts.set(id, draft);
    }
    return draft;
  }

  function pruneDraft(id: string, draft: ConversationDraft): void {
    if (!draft.content && !draft.attempt && !draft.confirmation)
      drafts.delete(id);
  }

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
      const draft = drafts.get(conversationId);
      const confirmation = draft?.confirmation;
      await applyMessages(
        confirmation ? [...history.messages, confirmation] : history.messages,
        version,
        "initial",
      );
      if (isCurrent(version) && draft && draft.confirmation === confirmation) {
        draft.confirmation = null;
        pruneDraft(conversationId, draft);
      }
    } catch {
      if (isCurrent(version)) {
        historyFailure = "latest";
        historyError.value = "message.historyFailed";
        const confirmation = drafts.get(conversationId)?.confirmation;
        if (confirmation)
          await applyMessages([confirmation], version, "initial");
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
    unselectedDraft.value = "";
    historyError.value = null;
    isLoadingEarlier.value = false;
    isLoadingMessages.value = false;
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
        historyError.value = "message.earlierFailed";
      }
    } finally {
      if (isCurrent(version)) isLoadingEarlier.value = false;
    }
  }

  async function submitMessage(
    retryOriginal = false,
  ): Promise<MessageSubmissionResult> {
    const conversationId = selectedConversationId.value;
    const content = messageContent.value.trim();
    if (
      disposed ||
      !conversationId ||
      isSendingMessage.value ||
      isLoadingMessages.value ||
      (retryOriginal
        ? selectedDraft.value?.attempt?.status !== "failed"
        : !content ||
          Boolean(contentError.value) ||
          Boolean(recoveryAttempt.value))
    )
      return "ignored";
    const draft = getDraft(conversationId);
    const version = selectionVersion;
    const request: PendingMessage =
      pendingMessage.value ??
      reactive({
        clientMessageId: crypto.randomUUID(),
        content,
        conversationId,
        draftVersion: draft.version,
        status: "sending" as const,
        error: null,
      });
    if (draft.content.trim() === request.content)
      request.draftVersion = draft.version;
    draft.attempt = request;
    request.status = "sending";
    request.error = null;
    try {
      const message = await sendMessage(
        conversationId,
        request.clientMessageId,
        request.content,
      );
      if (disposed || draft.attempt !== request) return "stale";
      if (draft.version === request.draftVersion) {
        draft.content = "";
        draft.version += 1;
      }
      draft.attempt = null;
      const active = selectedConversationId.value === conversationId;
      if (!active || isLoadingMessages.value || !historyLoaded)
        draft.confirmation = message;
      if (active)
        await applyMessages([message], selectionVersion, "local-send");
      pruneDraft(conversationId, draft);
      return isCurrent(version) ? "sent" : "stale";
    } catch (error) {
      if (disposed || draft.attempt !== request) return "stale";
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        ![408, 429].includes(error.status)
      ) {
        request.status = "rejected";
        request.error =
          error.status === 400 || error.status === 413
            ? "message.rejectedContent"
            : error.status === 401
              ? "message.sessionExpired"
              : error.status === 403 || error.status === 404
                ? "message.unavailable"
                : "message.rejected";
      } else {
        request.status = "failed";
        request.error =
          error instanceof ApiError && error.status === 429
            ? "message.rateLimited"
            : "message.unconfirmed";
      }
      return isCurrent(version) ? "failed" : "stale";
    }
  }

  function dismissRecovery(): void {
    const id = selectedConversationId.value;
    const draft = selectedDraft.value;
    if (disposed || !id || !draft || draft.attempt?.status === "sending")
      return;
    draft.attempt = null;
    pruneDraft(id, draft);
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
        historyError.value = "message.recoveryFailed";
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
    drafts.clear();
    unselectedDraft.value = "";
  }

  return {
    selectedConversationId,
    messages,
    earlierCursor,
    messageContent,
    pendingMessage,
    recoveryAttempt,
    dismissRecovery,
    retryOriginalMessage: () => submitMessage(true),
    isLoadingMessages,
    isLoadingEarlier,
    isSendingMessage,
    contentLength,
    contentError,
    messageErrorMessage,
    historyError: historyErrorText,
    submitMessage,
    loadEarlierMessages,
    recoverMessages,
    retryHistory,
    handleMessageCreated,
    dispose,
  };
}
