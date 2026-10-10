<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import ConversationSidebar from "../components/conversations/ConversationSidebar.vue";
import ConversationHeader from "../components/conversations/ConversationHeader.vue";
import ConversationTranscript from "../components/conversations/ConversationTranscript.vue";
import MessageComposer from "../components/conversations/MessageComposer.vue";
import ParticipantPane from "../components/conversations/ParticipantPane.vue";
import {
  connectRealtime,
  connectionState,
  disconnectRealtime,
} from "../realtime";
import { session } from "../auth/session";
import { groupTranscriptMessages } from "../transcript";
import {
  MESSAGE_CONTENT_LIMIT,
  useConversationMessages,
} from "../useConversationMessages";
import { useConversations } from "../useConversations";
import { useConversationRoute } from "../useConversationRoute";
import { useTranscriptScroll } from "../useTranscriptScroll";
import { useConversationAnnouncements } from "../useConversationAnnouncements";
import type { MessageSubmissionResult } from "../useConversationMessages";

const router = useRouter();
const transcript = ref<HTMLElement | null>(null);
type MessageComposerInstance = {
  completeSubmission(
    result: MessageSubmissionResult,
    attemptId: number | null,
  ): Promise<void>;
};
const composer = ref<MessageComposerInstance | null>(null);
const conversationData = useConversations();
const {
  conversations,
  participantEmail,
  isLoadingConversations,
  listError: conversationListError,
  creationError,
  loadConversations,
  submitConversation: createConversation,
  discoverConversation,
  dispose: disposeConversations,
} = conversationData;
const {
  selectedConversationId,
  navigationError,
  openConversation,
  captureSelectionIntent,
  selectCreatedConversation,
  dispose: disposeRoute,
} = useConversationRoute(router, conversationData);
const { beforeMessagesUpdate, dispose: disposeScroll } =
  useTranscriptScroll(transcript);
const {
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
  submitMessage: submitMessageRequest,
  loadEarlierMessages,
  recoverMessages,
  retryHistory,
  handleMessageCreated,
  dispose,
} = useConversationMessages(selectedConversationId, {
  beforeMessagesUpdate,
  onIncomingMessages: (incoming) => announceIncomingMessages(incoming),
});
const listError = computed(
  () => navigationError.value ?? conversationListError.value,
);
const isNavigatingCreation = ref(false);
const isCreatingConversation = computed(
  () =>
    conversationData.isCreatingConversation.value || isNavigatingCreation.value,
);

async function submitConversation(): Promise<void> {
  if (isNavigatingCreation.value) return;
  const intent = captureSelectionIntent();
  const id = await createConversation();
  if (!id) return;
  isNavigatingCreation.value = true;
  try {
    await selectCreatedConversation(id, intent);
  } finally {
    isNavigatingCreation.value = false;
  }
}

async function submitMessage(attemptId: number | null): Promise<void> {
  const result = await submitMessageRequest();
  await composer.value?.completeSubmission(result, attemptId);
}

function setTranscriptViewport(element: HTMLElement | null): void {
  transcript.value = element;
}

const selectedConversation = computed(() =>
  conversations.value.find(
    (conversation) => conversation.id === selectedConversationId.value,
  ),
);

const messageGroups = computed(() => groupTranscriptMessages(messages.value));

const {
  messageAnnouncement,
  connectionAnnouncement,
  announceIncomingMessages,
  dispose: disposeAnnouncements,
} = useConversationAnnouncements(
  selectedConversationId,
  () => session.user?.sub,
  () => selectedConversation.value?.participant.email,
  connectionState,
);

onMounted(() => {
  void loadConversations();
  connectRealtime(
    (message) => {
      handleMessageCreated(message);
      discoverConversation(message);
    },
    () => {
      void loadConversations();
      void recoverMessages();
    },
  );
});

onBeforeUnmount(() => {
  disconnectRealtime();
  dispose();
  disposeConversations();
  disposeRoute();
  disposeScroll();
  disposeAnnouncements();
});
</script>

<template>
  <section
    class="grid min-h-0 gap-2 lg:h-full lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_17rem]"
  >
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ messageAnnouncement }}
    </div>
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ connectionAnnouncement }}
    </div>
    <ConversationSidebar
      v-model:participant-email="participantEmail"
      :conversations="conversations"
      :selected-conversation-id="selectedConversationId"
      :user-email="session.user?.email"
      :connection-state="connectionState"
      :is-loading-conversations="isLoadingConversations"
      :is-creating-conversation="isCreatingConversation"
      :list-error="listError"
      :creation-error="creationError"
      @select="openConversation"
      @refresh="loadConversations"
      @create="submitConversation"
    />

    <div
      role="region"
      :aria-labelledby="selectedConversation ? 'conversation-title' : undefined"
      :aria-label="selectedConversation ? undefined : 'Conversation'"
      class="flex min-h-[32rem] min-w-0 flex-col gap-1.5 lg:h-full lg:min-h-0"
    >
      <template v-if="selectedConversation">
        <ConversationHeader
          :participant-email="selectedConversation.participant.email"
        />
        <ConversationTranscript
          :groups="messageGroups"
          :current-user-id="session.user?.sub"
          :participant-email="selectedConversation.participant.email"
          :earlier-cursor="earlierCursor"
          :is-loading-messages="isLoadingMessages"
          :is-loading-earlier="isLoadingEarlier"
          @load-earlier="loadEarlierMessages"
          @viewport="setTranscriptViewport"
        />
        <MessageComposer
          ref="composer"
          v-model="messageContent"
          :conversation-id="selectedConversation.id"
          :is-sending-message="isSendingMessage"
          :is-loading-messages="isLoadingMessages"
          :content-length="contentLength"
          :content-limit="MESSAGE_CONTENT_LIMIT"
          :content-error="contentError"
          :is-retrying="Boolean(pendingMessage)"
          @send="submitMessage"
        />
      </template>
      <div
        v-else
        class="grid flex-1 place-items-center rounded-xl border border-white/70 bg-white/40 p-8 text-center shadow-lg shadow-sky-950/5 backdrop-blur-xl"
      >
        <div class="max-w-sm">
          <span
            aria-hidden="true"
            class="mx-auto grid size-14 place-items-center rounded-2xl bg-sky-100 text-2xl text-sky-700"
            >✦</span
          >
          <p class="mt-5 text-xl font-bold text-blue-950">
            Your conversations live here
          </p>
          <p class="mt-2 leading-7 text-slate-500">
            Choose a conversation or start a new one to begin messaging.
          </p>
        </div>
      </div>
      <p
        v-if="messageErrorMessage"
        class="mx-4 mb-4 max-h-28 shrink-0 overflow-y-auto rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 sm:mx-5"
        role="alert"
      >
        {{ messageErrorMessage }}
        <button
          v-if="historyError"
          class="ml-2 underline"
          :disabled="isLoadingMessages || isLoadingEarlier"
          type="button"
          @click="retryHistory"
        >
          Retry loading history
        </button>
      </p>
    </div>

    <ParticipantPane
      :participant-email="selectedConversation?.participant.email"
    />
  </section>
</template>
