import { ref, watch, type Ref } from "vue";

import type { Message } from "./api/conversations";

import type { ConnectionState } from "./connection";
import { t } from "./i18n";

export function useConversationAnnouncements(
  conversationId: Ref<string | null>,
  currentUserId: () => string | undefined,
  participantEmail: () => string | undefined,
  connectionState: Ref<ConnectionState>,
) {
  const messageAnnouncement = ref("");
  const connectionAnnouncement = ref("");
  const announcedIds = new Set<string>();
  let pendingMessages: { participant: string | undefined; content: string }[] =
    [];
  let messageTimer: ReturnType<typeof setTimeout> | undefined;
  let connectionTimer: ReturnType<typeof setTimeout> | undefined;
  let lastConnection: "connected" | "disconnected" | "limited" | undefined;
  let disposed = false;

  function clearMessageAnnouncements(): void {
    clearTimeout(messageTimer);
    messageTimer = undefined;
    pendingMessages = [];
    announcedIds.clear();
    messageAnnouncement.value = "";
  }

  const stopWatchingConversation = watch(
    [conversationId, currentUserId],
    clearMessageAnnouncements,
    { flush: "sync" },
  );

  function announceIncomingMessages(messages: Message[]): void {
    if (disposed || !conversationId.value || !currentUserId()) return;
    for (const message of messages) {
      if (
        message.conversationId !== conversationId.value ||
        message.senderId === currentUserId() ||
        announcedIds.has(message.id)
      )
        continue;
      announcedIds.add(message.id);
      pendingMessages.push({
        participant: participantEmail(),
        content: message.content,
      });
    }
    if (!pendingMessages.length || messageTimer !== undefined) return;
    messageTimer = setTimeout(() => {
      // Render an empty region before publishing, including repeated text.
      messageAnnouncement.value = "";
      messageTimer = setTimeout(() => {
        messageTimer = undefined;
        if (disposed) return;
        messageAnnouncement.value = pendingMessages
          .map((message) =>
            t("announcement.incoming", {
              participant: message.participant ?? t("common.participant"),
              content: message.content,
            }),
          )
          .join("\n");
        pendingMessages = [];
      }, 100);
    }, 150);
  }

  const stopWatchingConnection = watch(
    connectionState,
    (state) => {
      clearTimeout(connectionTimer);
      connectionTimer = undefined;
      if (
        disposed ||
        state === "connecting" ||
        state === "retrying-limit" ||
        state === lastConnection
      )
        return;
      if (state === "limited") {
        lastConnection = state;
        connectionAnnouncement.value = t("connection.limitHelp");
      } else if (state === "connected") {
        lastConnection = state;
        connectionAnnouncement.value = t("announcement.connected");
      } else {
        connectionTimer = setTimeout(() => {
          connectionTimer = undefined;
          if (disposed || connectionState.value !== "disconnected") return;
          lastConnection = "disconnected";
          connectionAnnouncement.value = t("announcement.disconnected");
        }, 750);
      }
    },
    { immediate: true, flush: "sync" },
  );

  function dispose(): void {
    disposed = true;
    clearMessageAnnouncements();
    clearTimeout(connectionTimer);
    stopWatchingConversation();
    stopWatchingConnection();
    connectionAnnouncement.value = "";
  }

  return {
    messageAnnouncement,
    connectionAnnouncement,
    announceIncomingMessages,
    dispose,
  };
}
