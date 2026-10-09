import { nextTick, type Ref } from "vue";

import type { MessageUpdateSource } from "./useConversationMessages";

export function useTranscriptScroll(transcript: Ref<HTMLElement | null>) {
  let disposed = false;

  function beforeMessagesUpdate(
    source: MessageUpdateSource,
    isCurrent: () => boolean,
  ): () => Promise<void> {
    const mode =
      source === "initial" || source === "local-send"
        ? "end"
        : source === "earlier"
          ? "preserve"
          : "follow";
    const viewport = transcript.value;
    const scrollTop = viewport?.scrollTop ?? 0;
    const wasNearEnd =
      !viewport ||
      viewport.scrollHeight - viewport.clientHeight - scrollTop <= 64;
    const anchor =
      mode === "preserve" && viewport
        ? Array.from(
            viewport.querySelectorAll<HTMLElement>("[data-message-id]"),
          ).find(
            (element) =>
              element.getBoundingClientRect().bottom >
              viewport.getBoundingClientRect().top,
          )
        : undefined;
    const anchorOffset = anchor?.getBoundingClientRect().top;
    const anchorId = anchor?.dataset.messageId;

    return async () => {
      await nextTick();
      if (
        disposed ||
        !isCurrent() ||
        !viewport ||
        viewport !== transcript.value
      )
        return;
      if (mode === "end") {
        viewport.scrollTop = viewport.scrollHeight;
      } else if (
        mode === "preserve" &&
        anchorId &&
        anchorOffset !== undefined
      ) {
        const currentAnchor = Array.from(
          viewport.querySelectorAll<HTMLElement>("[data-message-id]"),
        ).find((element) => element.dataset.messageId === anchorId);
        if (currentAnchor)
          viewport.scrollTop +=
            currentAnchor.getBoundingClientRect().top - anchorOffset;
      } else if (
        mode === "follow" &&
        wasNearEnd &&
        viewport.scrollTop === scrollTop
      ) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    };
  }

  function dispose(): void {
    disposed = true;
  }

  return { beforeMessagesUpdate, dispose };
}
