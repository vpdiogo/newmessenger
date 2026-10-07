<script setup lang="ts">
import { onMounted, ref } from "vue";

import { getHealthStatus } from "../api/health";

const status = ref<"checking" | "available" | "unavailable">("checking");

onMounted(async () => {
  try {
    const health = await getHealthStatus();
    status.value = health.status === "ok" ? "available" : "unavailable";
  } catch {
    status.value = "unavailable";
  }
});
</script>

<template>
  <section class="space-y-4">
    <p class="text-sm font-medium text-indigo-600">MVP foundation</p>
    <h1 class="text-4xl font-bold tracking-tight text-slate-950">
      A minimal real-time messenger.
    </h1>
    <p class="max-w-xl text-lg leading-8 text-slate-600">
      The Vue client is connected to the Fastify API and ready for the
      authentication flow.
    </p>
    <p
      class="inline-flex rounded-full px-3 py-1 text-sm font-medium"
      :class="{
        'bg-amber-100 text-amber-800': status === 'checking',
        'bg-emerald-100 text-emerald-800': status === 'available',
        'bg-rose-100 text-rose-800': status === 'unavailable',
      }"
    >
      API {{ status }}
    </p>
  </section>
</template>
