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
import { session } from "../auth/session";

const conversations = ref<Conversation[]>([]);
const selectedConversationId = ref<string | null>(null);
const messages = ref<Message[]>([]);
const nextCursor = ref<string | null>(null);
const participantEmail = ref("");
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
const conversationErrorMessage = ref<string | null>(null);
const messageErrorMessage = ref<string | null>(null);

function isOwnMessage(message: Message): boolean {
  return message.senderId === session.user?.sub;
}

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
  conversationErrorMessage.value = null;

  try {
    conversations.value = await getConversations();
    if (selectedConversationId.value) return;
    const firstConversation = conversations.value[0];
    if (firstConversation) await selectConversation(firstConversation.id);
  } catch {
    conversationErrorMessage.value =
      "Unable to load conversations. Please try again.";
  } finally {
    isLoadingConversations.value = false;
  }
}

async function submitConversation(): Promise<void> {
  conversationErrorMessage.value = null;
  isCreatingConversation.value = true;

  try {
    const conversationId = await createConversation(participantEmail.value);
    participantEmail.value = "";
    conversations.value = await getConversations();
    await selectConversation(conversationId);
  } catch {
    conversationErrorMessage.value =
      "Unable to create the conversation. Check that the email belongs to a registered user.";
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
  messageErrorMessage.value = null;
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
    messageErrorMessage.value = "Unable to send the message. Please retry.";
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
    messageErrorMessage.value = "Unable to recover messages. Please refresh.";
  }
}

async function loadMessages(): Promise<void> {
  if (!selectedConversationId.value) return;

  const conversationId = selectedConversationId.value;
  const cursor = nextCursor.value;
  let applied = false;
  isLoadingMessages.value = true;
  messageErrorMessage.value = null;
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
    messageErrorMessage.value = "Unable to load messages. Please try again.";
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
  <section class="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
    <aside
      class="rounded-3xl border border-white/80 bg-white/60 p-4 shadow-lg shadow-sky-950/5 backdrop-blur sm:p-5"
    >
      <div class="mb-5 flex items-center justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
            Messages
          </p>
          <h1 class="mt-1 text-xl font-bold text-blue-950">Conversations</h1>
        </div>
        <button
          class="rounded-full px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="isLoadingConversations"
          type="button"
          @click="loadConversations"
        >
          {{ isLoadingConversations ? "Refreshing..." : "Refresh" }}
        </button>
      </div>
      <section
        class="mb-5 space-y-1.5 rounded-2xl border border-sky-100 bg-linear-to-br from-sky-50 to-indigo-50 p-4"
      >
        <h2 class="text-sm font-bold text-blue-950">Your contact email</h2>
        <p class="break-all text-sm font-semibold text-slate-800">
          {{ session.user?.email }}
        </p>
        <p class="text-xs leading-5 text-slate-500">
          Share this email so someone can start a conversation with you.
        </p>
      </section>
      <form class="mb-5 space-y-2.5" @submit.prevent="submitConversation">
        <h2 class="text-sm font-bold text-blue-950">Start a conversation</h2>
        <label
          class="block text-sm font-semibold text-slate-700"
          for="participant-email"
        >
          Email address
        </label>
        <input
          id="participant-email"
          v-model="participantEmail"
          class="w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500"
          placeholder="person@example.com"
          required
          type="email"
        />
        <button
          class="w-full rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="isCreatingConversation"
          type="submit"
        >
          {{ isCreatingConversation ? "Creating..." : "Start conversation" }}
        </button>
      </form>
      <p
        v-if="conversationErrorMessage"
        class="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
        role="alert"
      >
        {{ conversationErrorMessage }}
      </p>
      <p v-if="isLoadingConversations" class="text-sm text-slate-500">
        Loading...
      </p>
      <p
        v-else-if="conversations.length === 0"
        class="rounded-2xl border border-dashed border-sky-200 bg-white/50 p-4 text-sm leading-6 text-slate-500"
      >
        No conversations yet. Start one using a contact email.
      </p>
      <ul v-else class="space-y-1.5">
        <li v-for="conversation in conversations" :key="conversation.id">
          <button
            class="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold"
            :class="
              conversation.id === selectedConversationId
                ? 'bg-linear-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-700 hover:bg-sky-100/80'
            "
            type="button"
            @click="selectConversation(conversation.id)"
          >
            <span
              aria-hidden="true"
              class="grid size-9 shrink-0 place-items-center rounded-xl text-xs font-bold"
              :class="
                conversation.id === selectedConversationId
                  ? 'bg-white/20 text-white'
                  : 'bg-sky-100 text-sky-700 group-hover:bg-white'
              "
              >{{
                conversation.participant.email.slice(0, 1).toUpperCase()
              }}</span
            >
            <span class="min-w-0 truncate">{{
              conversation.participant.email
            }}</span>
          </button>
        </li>
      </ul>
    </aside>

    <div
      class="flex min-h-[32rem] min-w-0 flex-col overflow-hidden rounded-3xl border border-white/80 bg-white/70 shadow-lg shadow-sky-950/5 backdrop-blur"
    >
      <template v-if="selectedConversation">
        <header
          class="flex items-center gap-3 border-b border-sky-100 bg-white/65 px-5 py-4 sm:px-6"
        >
          <span
            aria-hidden="true"
            class="grid size-11 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-cyan-400 to-blue-600 font-bold text-white shadow-md shadow-sky-500/25"
          >
            {{
              selectedConversation.participant.email.slice(0, 1).toUpperCase()
            }}
          </span>
          <div class="min-w-0">
            <p class="truncate text-lg font-bold text-blue-950">
              {{ selectedConversation.participant.email }}
            </p>
            <p class="text-sm text-slate-500">Direct conversation</p>
          </div>
        </header>
        <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-8">
          <p v-if="isLoadingMessages" class="text-sm text-slate-500">
            Loading messages...
          </p>
          <div
            v-else-if="messages.length === 0"
            class="grid min-h-52 place-items-center rounded-2xl border border-dashed border-sky-200 bg-sky-50/55 p-6 text-center"
          >
            <div class="max-w-sm">
              <p class="text-lg font-bold text-blue-950">No messages yet</p>
              <p class="mt-1 text-sm leading-6 text-slate-500">
                Send the first message to begin this conversation.
              </p>
            </div>
          </div>
          <ol v-else class="space-y-5">
            <li v-for="message in messages" :key="message.id" class="min-w-0">
              <p
                class="break-all text-sm font-bold"
                :class="
                  isOwnMessage(message) ? 'text-blue-700' : 'text-cyan-700'
                "
              >
                {{
                  isOwnMessage(message)
                    ? "You say:"
                    : `${selectedConversation.participant.email} says:`
                }}
              </p>
              <p
                class="mt-1 whitespace-pre-wrap break-words text-[1.02rem] leading-7 text-slate-800"
              >
                {{ message.content }}
              </p>
              <time class="mt-1 block text-xs font-medium text-slate-400">{{
                new Date(message.createdAt).toLocaleString()
              }}</time>
            </li>
          </ol>
          <button
            v-if="nextCursor"
            class="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="isLoadingMessages"
            type="button"
            @click="loadMessages"
          >
            Load more messages
          </button>
        </div>
        <form
          class="border-t border-sky-100 bg-sky-50/55 p-4 sm:p-5"
          @submit.prevent="submitMessage"
        >
          <label class="block text-sm font-bold text-blue-950" for="message">
            Message
          </label>
          <textarea
            id="message"
            v-model="messageContent"
            class="mt-2 w-full resize-y rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500"
            placeholder="Write a message"
            required
            rows="3"
          />
          <div
            class="mt-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"
          >
            <p class="flex items-center gap-2 text-sm text-slate-500">
              <span
                aria-hidden="true"
                class="size-2 rounded-full"
                :class="
                  connectionState === 'connected'
                    ? 'bg-emerald-500'
                    : 'bg-amber-400'
                "
              ></span>
              Connection: {{ connectionState }}
            </p>
            <button
              class="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
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
      <div
        v-else
        class="grid flex-1 place-items-center bg-linear-to-br from-white/60 to-sky-50/70 p-8 text-center"
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
        class="mx-4 mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 sm:mx-5"
        role="alert"
      >
        {{ messageErrorMessage }}
      </p>
    </div>
  </section>
</template>
