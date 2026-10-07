<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import {
  type Conversation,
  type Message,
  createConversation,
  getConversations,
  getMessageHistory,
  sendMessage,
} from "../api/conversations";
import { isCurrentHistoryRequest } from "../history";
import { appendMessages } from "../messages";
import {
  connectRealtime,
  connectionState,
  disconnectRealtime,
} from "../realtime";

const conversations = ref<Conversation[]>([]);
const selectedConversationId = ref<string | null>(null);
const messages = ref<Message[]>([]);
const nextCursor = ref<string | null>(null);
const participantId = ref("");
const messageContent = ref("");
const pendingMessage = ref<{
  clientMessageId: string;
  content: string;
  conversationId: string;
} | null>(null);
const isLoadingConversations = ref(true);
const isLoadingMessages = ref(false);
const isCreatingConversation = ref(false);
const isSendingMessage = ref(false);
const errorMessage = ref<string | null>(null);

const selectedConversation = computed(() =>
  conversations.value.find(
    (conversation) => conversation.id === selectedConversationId.value,
  ),
);

onMounted(() => {
  void loadConversations();
  connectRealtime(handleMessageCreated, () => {
    void recoverMessages();
  });
});

onBeforeUnmount(disconnectRealtime);

async function loadConversations(): Promise<void> {
  isLoadingConversations.value = true;
  errorMessage.value = null;

  try {
    conversations.value = await getConversations();
    if (selectedConversationId.value) return;
    const firstConversation = conversations.value[0];
    if (firstConversation) await selectConversation(firstConversation.id);
  } catch {
    errorMessage.value = "Unable to load conversations. Please try again.";
  } finally {
    isLoadingConversations.value = false;
  }
}

async function submitConversation(): Promise<void> {
  errorMessage.value = null;
  isCreatingConversation.value = true;

  try {
    const conversationId = await createConversation(participantId.value);
    participantId.value = "";
    conversations.value = await getConversations();
    await selectConversation(conversationId);
  } catch {
    errorMessage.value =
      "Unable to create the conversation. Check the participant ID.";
  } finally {
    isCreatingConversation.value = false;
  }
}

async function selectConversation(conversationId: string): Promise<void> {
  selectedConversationId.value = conversationId;
  messages.value = [];
  nextCursor.value = null;
  pendingMessage.value = null;
  messageContent.value = "";
  await loadMessages();
}

async function submitMessage(): Promise<void> {
  if (!selectedConversationId.value) return;

  const conversationId = selectedConversationId.value;
  const content = messageContent.value.trim();
  const retry = pendingMessage.value;
  if (!content || (retry && retry.conversationId !== conversationId)) return;

  const request =
    retry ??
    ({
      clientMessageId: crypto.randomUUID(),
      content,
      conversationId,
    } as const);

  isSendingMessage.value = true;
  errorMessage.value = null;
  try {
    const message = await sendMessage(
      request.conversationId,
      request.clientMessageId,
      request.content,
    );
    if (selectedConversationId.value !== request.conversationId) return;
    messages.value = appendMessages(messages.value, [message]);
    messageContent.value = "";
    pendingMessage.value = null;
  } catch {
    if (selectedConversationId.value !== request.conversationId) return;
    pendingMessage.value = request;
    errorMessage.value = "Unable to send the message. Please retry.";
  } finally {
    isSendingMessage.value = false;
  }
}

function handleMessageCreated(message: Message): void {
  if (message.conversationId !== selectedConversationId.value) return;
  messages.value = appendMessages(messages.value, [message]);
}

async function recoverMessages(): Promise<void> {
  if (!selectedConversationId.value || messages.value.length === 0) return;

  const conversationId = selectedConversationId.value;
  const lastMessage = messages.value.at(-1);
  if (!lastMessage) return;

  try {
    const history = await getMessageHistory(conversationId, lastMessage.id);
    if (selectedConversationId.value !== conversationId) return;
    messages.value = appendMessages(messages.value, history.messages);
    nextCursor.value = history.nextCursor;
  } catch {
    errorMessage.value = "Unable to recover messages. Please refresh.";
  }
}

async function loadMessages(): Promise<void> {
  if (!selectedConversationId.value) return;

  const conversationId = selectedConversationId.value;
  const cursor = nextCursor.value;
  let applied = false;
  isLoadingMessages.value = true;
  errorMessage.value = null;
  try {
    const history = await getMessageHistory(
      conversationId,
      cursor ?? undefined,
    );
    if (
      !isCurrentHistoryRequest(
        selectedConversationId.value,
        nextCursor.value,
        conversationId,
        cursor,
      )
    ) {
      return;
    }
    messages.value = appendMessages(messages.value, history.messages);
    nextCursor.value = history.nextCursor;
    applied = true;
  } catch {
    errorMessage.value = "Unable to load messages. Please try again.";
  } finally {
    if (
      applied ||
      isCurrentHistoryRequest(
        selectedConversationId.value,
        nextCursor.value,
        conversationId,
        cursor,
      )
    ) {
      isLoadingMessages.value = false;
    }
  }
}
</script>

<template>
  <section class="grid gap-8 md:grid-cols-[16rem_1fr]">
    <aside class="space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-slate-950">Conversations</h1>
        <button
          class="text-sm text-indigo-600"
          type="button"
          @click="loadConversations"
        >
          Refresh
        </button>
      </div>
      <form class="space-y-2" @submit.prevent="submitConversation">
        <label
          class="block text-sm font-medium text-slate-700"
          for="participant-id"
        >
          Participant ID
        </label>
        <input
          id="participant-id"
          v-model="participantId"
          class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="UUID"
          required
          type="text"
        />
        <button
          class="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          :disabled="isCreatingConversation"
          type="submit"
        >
          {{ isCreatingConversation ? "Creating..." : "New conversation" }}
        </button>
      </form>
      <p v-if="isLoadingConversations" class="text-sm text-slate-500">
        Loading...
      </p>
      <p v-else-if="conversations.length === 0" class="text-sm text-slate-500">
        No conversations yet.
      </p>
      <ul v-else class="space-y-1">
        <li v-for="conversation in conversations" :key="conversation.id">
          <button
            class="w-full rounded-md px-3 py-2 text-left text-sm"
            :class="
              conversation.id === selectedConversationId
                ? 'bg-indigo-100 text-indigo-900'
                : 'text-slate-700 hover:bg-slate-100'
            "
            type="button"
            @click="selectConversation(conversation.id)"
          >
            {{ conversation.participant.email }}
          </button>
        </li>
      </ul>
    </aside>

    <div
      class="min-h-80 space-y-4 rounded-lg border border-slate-200 bg-white p-6"
    >
      <template v-if="selectedConversation">
        <h2 class="text-xl font-bold text-slate-950">
          {{ selectedConversation.participant.email }}
        </h2>
        <p v-if="isLoadingMessages" class="text-sm text-slate-500">
          Loading messages...
        </p>
        <p v-else-if="messages.length === 0" class="text-sm text-slate-500">
          No messages yet.
        </p>
        <ol v-else class="space-y-3">
          <li
            v-for="message in messages"
            :key="message.id"
            class="rounded-md bg-slate-50 p-3"
          >
            <p class="text-slate-900">{{ message.content }}</p>
            <time class="text-xs text-slate-500">{{
              new Date(message.createdAt).toLocaleString()
            }}</time>
          </li>
        </ol>
        <button
          v-if="nextCursor"
          class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
          :disabled="isLoadingMessages"
          type="button"
          @click="loadMessages"
        >
          Load more messages
        </button>
        <form class="space-y-2" @submit.prevent="submitMessage">
          <label class="block text-sm font-medium text-slate-700" for="message">
            Message
          </label>
          <textarea
            id="message"
            v-model="messageContent"
            class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Write a message"
            required
            rows="3"
          />
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm text-slate-500">
              Connection: {{ connectionState }}
            </p>
            <button
              class="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              :disabled="isSendingMessage || !messageContent.trim()"
              type="submit"
            >
              {{
                isSendingMessage
                  ? "Sending..."
                  : pendingMessage
                    ? "Retry message"
                    : "Send message"
              }}
            </button>
          </div>
        </form>
      </template>
      <p v-else class="text-slate-500">Select or create a conversation.</p>
      <p v-if="errorMessage" class="text-sm text-rose-700">
        {{ errorMessage }}
      </p>
    </div>
  </section>
</template>
