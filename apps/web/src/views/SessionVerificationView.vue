<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

import { retrySession, session } from "../auth/session";

const router = useRouter();
const isRetrying = ref(false);

async function retry(): Promise<void> {
  if (isRetrying.value) return;
  isRetrying.value = true;
  try {
    if ((await retrySession()) === "unauthenticated") {
      await router.replace({ name: "login" });
    }
  } finally {
    isRetrying.value = false;
  }
}
</script>

<template>
  <section class="mx-auto grid max-w-md place-items-center py-12 text-center">
    <div
      class="rounded-3xl border border-white bg-white/75 p-8 shadow-xl shadow-sky-950/10 backdrop-blur sm:p-10"
      role="alert"
    >
      <span
        aria-hidden="true"
        class="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-100 text-xl text-amber-700"
        >!</span
      >
      <h1 class="mt-5 text-2xl font-bold text-blue-950">
        We could not verify your session
      </h1>
      <p class="mt-3 leading-7 text-slate-600">
        Your messages remain protected. Check your connection or try again when
        the service is available.
      </p>
      <button
        class="mt-6 rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="isRetrying || session.status === 'verifying'"
        type="button"
        @click="retry"
      >
        {{
          isRetrying || session.status === "verifying" ? "Retrying..." : "Retry"
        }}
      </button>
    </div>
  </section>
</template>
