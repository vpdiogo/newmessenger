<script setup lang="ts">
import { submitMessageOnEnter } from "./messageKeyboard";

defineProps<{
  isSendingMessage: boolean;
  isLoadingMessages: boolean;
  contentLength: number;
  contentLimit: number;
  contentError: string | null;
  isRetrying: boolean;
}>();

const messageContent = defineModel<string>({ required: true });
const emit = defineEmits<{ send: [] }>();
</script>

<template>
  <form
    class="shrink-0 border-t border-sky-100 bg-sky-50/55 p-4 sm:p-5"
    @submit.prevent="emit('send')"
  >
    <label class="sr-only" for="message">Message</label>
    <div class="flex items-end gap-3">
      <textarea
        id="message"
        v-model="messageContent"
        @keydown="submitMessageOnEnter($event, () => emit('send'))"
        aria-describedby="message-limit"
        :aria-invalid="Boolean(contentError)"
        class="min-h-11 max-h-32 min-w-0 flex-1 resize-y rounded-2xl border border-sky-100 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500"
        placeholder="Type a message..."
        required
        rows="1"
      />
      <button
        class="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="
          isSendingMessage ||
          isLoadingMessages ||
          !messageContent.trim() ||
          Boolean(contentError)
        "
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
            : isRetrying
              ? "Retry message"
              : "Send"
        }}
      </button>
    </div>
    <p id="message-limit" class="mt-2 text-right text-xs text-slate-500">
      {{ contentLength.toLocaleString("en-US") }} /
      {{ contentLimit.toLocaleString("en-US") }} characters
    </p>
  </form>
</template>
