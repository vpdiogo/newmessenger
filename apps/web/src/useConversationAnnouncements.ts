import { ref, watch, type Ref } from "vue";

import type { Message } from "./api/conversations";

type ConnectionState = "connecting" | "connected" | "disconnected";

export function useConversationAnnouncements(
  conversationId: Ref<string | null>,
  currentUserId: () => string | undefined,
  participantEmail: () => string | undefined,
  connectionState: Ref<ConnectionState>,
) {
  const messageAnnouncement = ref("");
  const connectionAnnouncement = ref("");
  const announcedIds = new Set<string>();
  let pendingMessages: string[] = [];
  let messageTimer: ReturnType<typeof setTimeout> | undefined;
  let connectionTimer: ReturnType<typeof setTimeout> | undefined;
  let lastConnection: "connected" | "disconnected" | undefined;
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
      pendingMessages.push(
        `${participantEmail() ?? "Participant"} says: ${message.content}`,
      );
    }
    if (!pendingMessages.length || messageTimer !== undefined) return;
    messageTimer = setTimeout(() => {
      // Render an empty region before publishing, including repeated text.
      messageAnnouncement.value = "";
      messageTimer = setTimeout(() => {
        messageTimer = undefined;
        if (disposed) return;
        messageAnnouncement.value = pendingMessages.join("\n");
        pendingMessages = [];
      }, 100);
    }, 150);
  }

  const stopWatchingConnection = watch(
    connectionState,
    (state) => {
      clearTimeout(connectionTimer);
      connectionTimer = undefined;
      if (disposed || state === "connecting" || state === lastConnection)
        return;
      if (state === "connected") {
        lastConnection = state;
        connectionAnnouncement.value = "Connection established.";
      } else {
        connectionTimer = setTimeout(() => {
          connectionTimer = undefined;
          if (disposed || connectionState.value !== "disconnected") return;
          lastConnection = "disconnected";
          connectionAnnouncement.value = "Connection lost. Reconnecting.";
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
