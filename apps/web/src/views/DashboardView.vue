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
import { formatMessageTime, groupTranscriptMessages } from "../transcript";

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

const messageGroups = computed(() => groupTranscriptMessages(messages.value));

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
  <section
    class="grid min-h-0 gap-5 lg:h-full lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_17rem]"
  >
    <aside
      class="flex min-h-0 flex-col rounded-3xl border border-white/80 bg-sky-50/55 p-4 shadow-lg shadow-sky-950/5 backdrop-blur sm:p-5"
    >
      <section class="mb-5 border-b border-sky-100 pb-5">
        <div class="flex items-center gap-3">
          <span
            aria-hidden="true"
            class="grid size-12 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-sky-400 to-blue-600 text-sm font-bold text-white shadow-md shadow-sky-500/25"
          >
            {{ session.user?.email?.slice(0, 1).toUpperCase() }}
          </span>
          <div class="min-w-0">
            <p class="truncate text-sm font-bold text-blue-950">
              {{ session.user?.email }}
            </p>
            <p class="mt-1 flex items-center gap-2 text-sm text-slate-500">
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
          </div>
        </div>
        <p class="mt-3 text-xs leading-5 text-slate-500">
          Share this email so someone can start a conversation with you.
        </p>
      </section>

      <section class="flex min-h-0 flex-1 flex-col">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <p
              class="text-xs font-bold uppercase tracking-[0.16em] text-sky-700"
            >
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
        <div class="min-h-0 flex-1 overflow-y-auto pr-1">
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
                class="group flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm font-semibold"
                :class="
                  conversation.id === selectedConversationId
                    ? 'border-sky-200 bg-white/75 text-blue-950 shadow-sm shadow-sky-950/5'
                    : 'border-transparent text-slate-700 hover:bg-white/55'
                "
                :aria-pressed="conversation.id === selectedConversationId"
                type="button"
                @click="selectConversation(conversation.id)"
              >
                <span
                  aria-hidden="true"
                  class="grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold"
                  :class="
                    conversation.id === selectedConversationId
                      ? 'bg-blue-100 text-blue-700'
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
        </div>
      </section>

      <form
        class="mt-5 shrink-0 border-t border-sky-100 pt-4"
        @submit.prevent="submitConversation"
      >
        <label class="sr-only" for="participant-email">Email address</label>
        <input
          id="participant-email"
          v-model="participantEmail"
          class="w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500"
          placeholder="person@example.com"
          required
          type="email"
        />
        <button
          class="mt-2.5 w-full rounded-2xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="isCreatingConversation"
          type="submit"
        >
          {{ isCreatingConversation ? "Creating..." : "Start a conversation" }}
        </button>
        <p
          v-if="conversationErrorMessage"
          class="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
          role="alert"
        >
          {{ conversationErrorMessage }}
        </p>
      </form>
    </aside>

    <div
      class="flex min-h-[32rem] min-w-0 flex-col overflow-hidden rounded-3xl border border-white/80 bg-white/70 shadow-lg shadow-sky-950/5 backdrop-blur lg:h-full lg:min-h-0"
    >
      <template v-if="selectedConversation">
        <header
          class="flex items-center gap-3 border-b border-sky-100 bg-sky-50/55 px-5 py-4 sm:px-6"
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
            <li
              v-for="(group, index) in messageGroups"
              :key="`${group.dateKey}-${group.senderId}-${group.messages[0]?.id}`"
              class="min-w-0"
            >
              <div
                v-if="
                  index === 0 ||
                  messageGroups[index - 1]?.dateKey !== group.dateKey
                "
                class="mb-5 flex items-center gap-3 text-xs font-medium text-slate-400"
              >
                <span aria-hidden="true" class="h-px flex-1 bg-sky-100"></span>
                <time>{{ group.dateLabel }}</time>
                <span aria-hidden="true" class="h-px flex-1 bg-sky-100"></span>
              </div>
              <p
                class="break-all text-sm font-bold"
                :class="
                  isOwnMessage(group.messages[0]!)
                    ? 'text-blue-700'
                    : 'text-cyan-700'
                "
              >
                {{
                  isOwnMessage(group.messages[0]!)
                    ? "You say:"
                    : `${selectedConversation.participant.email} says:`
                }}
              </p>
              <div
                v-for="message in group.messages"
                :key="message.id"
                class="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4"
              >
                <p
                  class="whitespace-pre-wrap break-words text-[1.02rem] leading-7 text-slate-800"
                >
                  {{ message.content }}
                </p>
                <time
                  class="pt-1 text-xs font-medium whitespace-nowrap text-slate-400"
                  >{{ formatMessageTime(message.createdAt) }}</time
                >
              </div>
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
          <label class="sr-only" for="message">Message</label>
          <div class="flex items-end gap-3">
            <textarea
              id="message"
              v-model="messageContent"
              class="min-h-11 min-w-0 flex-1 resize-y rounded-2xl border border-sky-100 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500"
              placeholder="Type a message..."
              required
              rows="1"
            />
            <button
              class="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="isSendingMessage || !messageContent.trim()"
              type="submit"
            >
              <svg
                aria-hidden="true"
                class="size-4"
                fill="none"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="m21 3-7.5 18-3.25-7.25L3 10.5 21 3Z"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
                <path
                  d="m10.25 13.75 4.25-4.25"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
              </svg>
              {{
                isSendingMessage
                  ? "Sending..."
                  : pendingMessage
                    ? "Retry message"
                    : "Send"
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

    <aside
      class="hidden min-h-0 flex-col overflow-hidden rounded-3xl border border-white/80 bg-sky-50/55 shadow-lg shadow-sky-950/5 backdrop-blur xl:flex"
    >
      <template v-if="selectedConversation">
        <div class="border-b border-sky-100 bg-sky-50/55 p-6 text-center">
          <span
            aria-hidden="true"
            class="mx-auto grid size-20 place-items-center rounded-3xl bg-linear-to-br from-cyan-400 to-blue-600 text-2xl font-bold text-white shadow-lg shadow-sky-500/25"
          >
            {{
              selectedConversation.participant.email.slice(0, 1).toUpperCase()
            }}
          </span>
          <p class="mt-4 break-all text-sm font-bold text-blue-950">
            {{ selectedConversation.participant.email }}
          </p>
        </div>
      </template>
      <div v-else class="grid flex-1 place-items-center p-6 text-center">
        <div class="max-w-44">
          <span
            aria-hidden="true"
            class="mx-auto grid size-14 place-items-center rounded-2xl bg-sky-100 text-2xl text-sky-700"
            >✦</span
          >
          <p class="mt-4 font-bold text-blue-950">No participant selected</p>
          <p class="mt-2 text-sm leading-6 text-slate-500">
            Choose a conversation to view its participant.
          </p>
        </div>
      </div>
    </aside>
  </section>
</template>
