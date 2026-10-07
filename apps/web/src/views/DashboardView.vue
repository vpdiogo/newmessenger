<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import {
  type Conversation,
  type Message,
  createConversation,
  getConversations,
  getMessageHistory,
} from "../api/conversations";

const conversations = ref<Conversation[]>([]);
const selectedConversationId = ref<string | null>(null);
const messages = ref<Message[]>([]);
const nextCursor = ref<string | null>(null);
const participantId = ref("");
const isLoadingConversations = ref(true);
const isLoadingMessages = ref(false);
const isCreatingConversation = ref(false);
const errorMessage = ref<string | null>(null);

const selectedConversation = computed(() =>
  conversations.value.find(
    (conversation) => conversation.id === selectedConversationId.value,
  ),
);

onMounted(loadConversations);

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
  await loadMessages();
}

async function loadMessages(): Promise<void> {
  if (!selectedConversationId.value) return;

  isLoadingMessages.value = true;
  errorMessage.value = null;
  try {
    const history = await getMessageHistory(
      selectedConversationId.value,
      nextCursor.value ?? undefined,
    );
    const knownMessageIds = new Set(
      messages.value.map((message) => message.id),
    );
    messages.value = [
      ...messages.value,
      ...history.messages.filter((message) => !knownMessageIds.has(message.id)),
    ];
    nextCursor.value = history.nextCursor;
  } catch {
    errorMessage.value = "Unable to load messages. Please try again.";
  } finally {
    isLoadingMessages.value = false;
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
      </template>
      <p v-else class="text-slate-500">Select or create a conversation.</p>
      <p v-if="errorMessage" class="text-sm text-rose-700">
        {{ errorMessage }}
      </p>
    </div>
  </section>
</template>
