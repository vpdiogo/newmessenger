<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import type { Conversation } from "../../api/conversations";
import defaultUserAvatar from "../../assets/default-user-avatar.png";

defineProps<{
  conversations: Conversation[];
  selectedConversationId: string | null;
  userEmail?: string;
  connectionState: "connecting" | "connected" | "disconnected";
  isLoadingConversations: boolean;
  isCreatingConversation: boolean;
  listError: string | null;
  creationError: string | null;
}>();

const participantEmail = defineModel<string>("participantEmail", {
  required: true,
});
const emit = defineEmits<{
  select: [conversationId: string];
  refresh: [];
  create: [];
}>();

const isStartFormOpen = ref(false);
const participantEmailInput = ref<HTMLInputElement | null>(null);
const startConversationControl = ref<HTMLElement | null>(null);

async function openStartForm() {
  isStartFormOpen.value = true;
  await nextTick();
  participantEmailInput.value?.focus();
}

function closeStartForm() {
  isStartFormOpen.value = false;
}

function closeStartFormOnOutsideClick(event: PointerEvent) {
  if (
    isStartFormOpen.value &&
    event.target instanceof Node &&
    !startConversationControl.value?.contains(event.target)
  ) {
    closeStartForm();
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", closeStartFormOnOutsideClick);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeStartFormOnOutsideClick);
});
</script>

<template>
  <aside
    class="flex min-h-0 flex-col overflow-y-auto rounded-xl border border-white/70 bg-sky-100/30 p-3 shadow-lg shadow-sky-950/5 backdrop-blur-xl sm:p-4"
  >
    <section class="mb-2 shrink-0 border-b border-sky-100 pb-2">
      <div class="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          class="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-100/80 shadow-md shadow-emerald-950/10"
        >
          <img
            alt=""
            class="size-full object-contain p-1.5"
            :src="defaultUserAvatar"
          />
        </span>
        <div class="min-w-0">
          <p class="truncate text-sm font-bold text-blue-950">
            {{ userEmail }}
          </p>
        </div>
      </div>
      <p class="mt-1 flex items-center gap-2 text-sm text-slate-500">
        <span
          aria-hidden="true"
          class="size-2 shrink-0 rounded-full"
          :class="
            connectionState === 'connected' ? 'bg-emerald-500' : 'bg-amber-400'
          "
        ></span>
        Connection: {{ connectionState }}
      </p>
      <p class="mt-2 text-xs leading-5 text-slate-500">
        Share this email so someone can start a conversation with you.
      </p>
    </section>

    <section class="flex min-h-36 flex-1 flex-col">
      <div class="mb-2 flex shrink-0 items-center justify-between">
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
          @click="emit('refresh')"
        >
          {{ isLoadingConversations ? "Refreshing..." : "Refresh" }}
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto pr-1">
        <p
          v-if="isLoadingConversations && conversations.length === 0"
          class="text-sm text-slate-500"
        >
          Loading...
        </p>
        <p
          v-else-if="conversations.length === 0"
          class="rounded-2xl border border-dashed border-sky-200 bg-white/50 p-4 text-sm leading-6 text-slate-500"
        >
          No conversations yet. Start one using a contact email.
        </p>
        <ul v-else class="space-y-1">
          <li v-for="conversation in conversations" :key="conversation.id">
            <button
              class="group flex w-full items-center gap-2.5 rounded-2xl border px-3 py-2 text-left text-sm font-semibold"
              :class="
                conversation.id === selectedConversationId
                  ? 'border-sky-300/55 bg-sky-200/45 text-blue-950 shadow-sm shadow-sky-950/10'
                  : 'border-transparent bg-transparent text-slate-700 hover:bg-white/25'
              "
              type="button"
              :aria-current="
                conversation.id === selectedConversationId ? 'true' : undefined
              "
              @click="emit('select', conversation.id)"
            >
              <span
                aria-hidden="true"
                class="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100/80"
              >
                <img
                  alt=""
                  class="size-full object-contain p-1"
                  :src="defaultUserAvatar"
                />
              </span>
              <span class="min-w-0 truncate">{{
                conversation.participant.email
              }}</span>
            </button>
          </li>
        </ul>
      </div>
    </section>

    <p
      v-if="listError"
      class="mt-2 shrink-0 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
      role="alert"
    >
      {{ listError }}
    </p>

    <div ref="startConversationControl" class="mt-3 shrink-0 pt-3">
      <form
        v-show="isStartFormOpen"
        id="start-conversation-form"
        class="mb-2 flex gap-2"
        @submit.prevent="emit('create')"
      >
        <label class="sr-only" for="participant-email">Email address</label>
        <input
          id="participant-email"
          ref="participantEmailInput"
          v-model="participantEmail"
          class="min-w-0 flex-1 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500"
          placeholder="person@example.com"
          required
          type="email"
        />
        <button
          class="rounded-xl border border-white/75 bg-white/35 px-3 py-2 text-sm font-semibold text-blue-800 shadow-sm shadow-sky-950/5 hover:bg-white/55 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="isCreatingConversation"
          type="submit"
        >
          {{ isCreatingConversation ? "Creating..." : "Start" }}
        </button>
      </form>
      <p
        v-if="creationError"
        class="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
        role="alert"
      >
        {{ creationError }}
      </p>
      <button
        class="flex w-full items-center gap-2 rounded-xl border border-white/60 bg-white/20 px-2 py-1.5 text-left text-sm font-medium text-slate-600 shadow-sm shadow-sky-950/5 backdrop-blur-sm hover:bg-white/35 hover:text-blue-800"
        type="button"
        :aria-expanded="isStartFormOpen"
        aria-controls="start-conversation-form"
        @click="isStartFormOpen ? closeStartForm() : openStartForm()"
      >
        <span
          aria-hidden="true"
          class="grid size-6 shrink-0 place-items-center rounded-full border border-sky-500 text-base leading-none text-sky-700"
        >
          {{ isStartFormOpen ? "×" : "+" }}
        </span>
        <span>{{ isStartFormOpen ? "Close" : "Start a conversation" }}</span>
      </button>
    </div>
  </aside>
</template>
