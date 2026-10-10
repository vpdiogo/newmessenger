<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";

import { formatMessageTime, type TranscriptGroup } from "../../transcript";

defineProps<{
  groups: TranscriptGroup[];
  currentUserId?: string;
  participantEmail: string;
  earlierCursor: string | null;
  isLoadingMessages: boolean;
  isLoadingEarlier: boolean;
}>();

const emit = defineEmits<{
  loadEarlier: [];
  viewport: [element: HTMLElement | null];
}>();

function setViewport(element: Element | ComponentPublicInstance | null): void {
  emit("viewport", element instanceof HTMLElement ? element : null);
}
</script>

<template>
  <div
    :ref="setViewport"
    class="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-2xl border border-white/80 bg-white/80 px-4 py-4 shadow-lg shadow-sky-950/5 backdrop-blur-xl sm:px-6 [overflow-anchor:none]"
  >
    <button
      v-if="earlierCursor"
      class="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="isLoadingEarlier"
      type="button"
      @click="emit('loadEarlier')"
    >
      {{
        isLoadingEarlier
          ? "Loading earlier messages..."
          : "Load earlier messages"
      }}
    </button>
    <p v-if="isLoadingMessages" class="text-sm text-slate-500">
      Loading messages...
    </p>
    <div
      v-else-if="groups.length === 0"
      class="grid min-h-52 place-items-center rounded-2xl border border-dashed border-sky-200 bg-sky-50/55 p-6 text-center"
    >
      <div class="max-w-sm">
        <p class="text-lg font-bold text-blue-950">No messages yet</p>
        <p class="mt-1 text-sm leading-6 text-slate-500">
          Send the first message to begin this conversation.
        </p>
      </div>
    </div>
    <ol v-else class="space-y-4">
      <li
        v-for="(group, index) in groups"
        :key="`${group.dateKey}-${group.senderId}-${group.messages[0]?.id}`"
        class="min-w-0"
      >
        <div
          v-if="index === 0 || groups[index - 1]?.dateKey !== group.dateKey"
          class="mb-4 flex items-center gap-3 text-xs font-medium text-slate-400"
        >
          <span aria-hidden="true" class="h-px flex-1 bg-sky-100"></span>
          <time>{{ group.dateLabel }}</time>
          <span aria-hidden="true" class="h-px flex-1 bg-sky-100"></span>
        </div>
        <p
          class="break-all text-sm font-bold"
          :class="
            group.senderId === currentUserId ? 'text-blue-700' : 'text-cyan-700'
          "
        >
          {{
            group.senderId === currentUserId
              ? "You say:"
              : `${participantEmail} says:`
          }}
        </p>
        <div
          v-for="message in group.messages"
          :key="message.id"
          :data-message-id="message.id"
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
  </div>
</template>
