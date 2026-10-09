<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import type { MessageSubmissionResult } from "../../useConversationMessages";
import { submitMessageOnEnter } from "./messageKeyboard";

const props = defineProps<{
  conversationId: string;
  isSendingMessage: boolean;
  isLoadingMessages: boolean;
  contentLength: number;
  contentLimit: number;
  contentError: string | null;
  isRetrying: boolean;
}>();

const messageContent = defineModel<string>({ required: true });
const emit = defineEmits<{ send: [attemptId: number | null] }>();

const form = ref<HTMLFormElement | null>(null);
const textarea = ref<HTMLTextAreaElement | null>(null);
let focusAttempt: { id: number; conversationId: string } | null = null;
let nextFocusAttemptId = 0;
let resizeFrame: number | null = null;
let lastTextareaWidth: number | null = null;
let resizeObserver: ResizeObserver | null = null;

function clearFocusAttempt(): void {
  focusAttempt = null;
}

function isInsideComposer(target: EventTarget | null): boolean {
  return Boolean(target instanceof Node && form.value?.contains(target));
}

function requestSend(): void {
  if (props.isSendingMessage || props.isLoadingMessages) {
    emit("send", null);
    return;
  }
  focusAttempt = isInsideComposer(document.activeElement)
    ? { id: ++nextFocusAttemptId, conversationId: props.conversationId }
    : null;
  emit("send", focusAttempt?.id ?? null);
}

async function completeSubmission(
  result: MessageSubmissionResult,
  attemptId: number | null,
): Promise<void> {
  const attempt = focusAttempt;
  if (
    result !== "sent" ||
    !attempt ||
    attempt.id !== attemptId ||
    attempt.conversationId !== props.conversationId
  )
    return;
  clearFocusAttempt();

  await nextTick();
  textarea.value?.focus({ preventScroll: true });
}

function resizeTextarea(): void {
  resizeFrame = null;
  const element = textarea.value;
  if (!element) return;

  const style = window.getComputedStyle(element);
  const minimumHeight = Number.parseFloat(style.minHeight);
  const maximumHeight = Number.parseFloat(style.maxHeight);
  if (!Number.isFinite(minimumHeight) || !Number.isFinite(maximumHeight))
    return;

  element.style.height = "auto";
  const contentHeight = element.scrollHeight;
  const height = Math.max(
    minimumHeight,
    Math.min(contentHeight, maximumHeight),
  );
  element.style.height = `${height}px`;
  element.style.overflowY = contentHeight > maximumHeight ? "auto" : "hidden";
}

function scheduleResize(): void {
  if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(resizeTextarea);
}

function handleFocusIn(event: FocusEvent): void {
  if (focusAttempt && !isInsideComposer(event.target)) clearFocusAttempt();
}

function handlePointerDown(event: PointerEvent): void {
  if (focusAttempt && !isInsideComposer(event.target)) clearFocusAttempt();
}

function handleWindowBlur(): void {
  clearFocusAttempt();
}

watch(messageContent, scheduleResize, { flush: "post" });
watch(
  () => props.conversationId,
  () => {
    clearFocusAttempt();
    scheduleResize();
  },
);

onMounted(() => {
  const element = textarea.value;
  if (!element) return;
  lastTextareaWidth = element.getBoundingClientRect().width;
  resizeObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width;
    if (width === undefined || width === lastTextareaWidth) return;
    lastTextareaWidth = width;
    scheduleResize();
  });
  resizeObserver.observe(element);
  document.addEventListener("focusin", handleFocusIn, true);
  document.addEventListener("pointerdown", handlePointerDown, true);
  window.addEventListener("blur", handleWindowBlur);
  scheduleResize();
});

onBeforeUnmount(() => {
  clearFocusAttempt();
  resizeObserver?.disconnect();
  document.removeEventListener("focusin", handleFocusIn, true);
  document.removeEventListener("pointerdown", handlePointerDown, true);
  window.removeEventListener("blur", handleWindowBlur);
  if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
});

defineExpose({ completeSubmission });
</script>

<template>
  <form
    ref="form"
    class="shrink-0 border-t border-sky-100 bg-sky-50/55 p-4 sm:p-5"
    @submit.prevent="requestSend"
  >
    <label class="sr-only" for="message">Message</label>
    <div class="flex items-end gap-3">
      <textarea
        id="message"
        ref="textarea"
        v-model="messageContent"
        @keydown="submitMessageOnEnter($event, requestSend)"
        aria-describedby="message-limit"
        :aria-invalid="Boolean(contentError)"
        class="min-h-11 max-h-32 min-w-0 flex-1 resize-none overflow-y-auto rounded-2xl border border-sky-100 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500"
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
