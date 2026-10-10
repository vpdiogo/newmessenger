<script setup lang="ts">
import type { Conversation } from "../../api/conversations";

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
</script>

<template>
  <aside
    class="flex min-h-0 flex-col overflow-y-auto rounded-xl border border-white/70 bg-sky-100/30 p-3 shadow-lg shadow-sky-950/5 backdrop-blur-xl sm:p-4"
  >
    <section class="mb-2 shrink-0 border-b border-sky-100 pb-2">
      <div class="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          class="grid size-11 shrink-0 place-items-center rounded-full bg-linear-to-br from-sky-400 to-blue-600 text-sm font-bold text-white shadow-md shadow-sky-500/25"
        >
          {{ userEmail?.slice(0, 1).toUpperCase() }}
        </span>
        <div class="min-w-0">
          <p class="truncate text-sm font-bold text-blue-950">
            {{ userEmail }}
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

    <p
      v-if="listError"
      class="mt-2 shrink-0 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
      role="alert"
    >
      {{ listError }}
    </p>

    <form
      class="mt-3 shrink-0 border-t border-sky-100 pt-3"
      @submit.prevent="emit('create')"
    >
      <label class="sr-only" for="participant-email">Email address</label>
      <input
        id="participant-email"
        v-model="participantEmail"
        class="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500"
        placeholder="person@example.com"
        required
        type="email"
      />
      <button
        class="mt-2 w-full rounded-2xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="isCreatingConversation"
        type="submit"
      >
        {{ isCreatingConversation ? "Creating..." : "Start a conversation" }}
      </button>
      <p
        v-if="creationError"
        class="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
        role="alert"
      >
        {{ creationError }}
      </p>
    </form>
  </aside>
</template>
