<script setup lang="ts">
import { t, type PlainKey } from "../../i18n";

defineProps<{
  content: string;
  status: "sending" | "failed" | "rejected";
  error: PlainKey | null;
  isLoadingMessages: boolean;
}>();
defineEmits<{ retry: []; dismiss: [] }>();
</script>

<template>
  <section
    class="max-h-52 shrink-0 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
    :aria-label="t('message.previous')"
  >
    <p class="font-semibold">{{ t("message.previous") }}</p>
    <p class="mt-1 whitespace-pre-wrap break-words">{{ content }}</p>
    <p class="mt-2" role="status">
      {{ status === "sending" ? t("message.sending") : error ? t(error) : "" }}
    </p>
    <p v-if="status === 'failed'" class="mt-1">
      {{ t("message.dismissHelp") }}
    </p>
    <div class="mt-2 flex flex-wrap gap-2">
      <button
        v-if="status !== 'rejected'"
        type="button"
        :disabled="isLoadingMessages || status === 'sending'"
        class="rounded-lg border border-amber-400 px-2 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        @click="$emit('retry')"
      >
        {{ t("message.retryOriginal") }}
      </button>
      <button
        type="button"
        :disabled="status === 'sending'"
        class="rounded-lg border border-amber-400 px-2 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        @click="$emit('dismiss')"
      >
        {{ t("message.continueDraft") }}
      </button>
    </div>
  </section>
</template>
