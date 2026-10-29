<script setup lang="ts">
import { t, type PlainKey } from "../i18n";
import { onMounted, ref } from "vue";

import { getHealthStatus } from "../api/health";
import newMessengerLogo from "../assets/new-messenger-logo.png";

const statusLabels = {
  checking: "home.checking",
  available: "home.available",
  unavailable: "home.unavailable",
} satisfies Record<string, PlainKey>;
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
  <section
    class="grid items-center gap-10 py-8 lg:grid-cols-[1.15fr_.85fr] lg:py-16"
  >
    <div class="space-y-6">
      <p
        class="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700"
      >
        {{ t("home.tagline") }}
      </p>
      <div class="space-y-4">
        <h1
          class="max-w-2xl text-4xl font-bold tracking-tight text-blue-950 sm:text-5xl"
        >
          {{ t("home.title") }}
        </h1>
        <p class="max-w-xl text-lg leading-8 text-slate-600">
          {{ t("home.description") }}
        </p>
      </div>
      <div class="flex flex-wrap gap-3">
        <RouterLink
          class="rounded-full bg-blue-600 px-5 py-3 font-semibold text-white shadow-lg shadow-blue-600/25 hover:-translate-y-0.5 hover:bg-blue-700"
          to="/register"
        >
          {{ t("home.start") }}
        </RouterLink>
        <RouterLink
          class="rounded-full border border-sky-200 bg-white/80 px-5 py-3 font-semibold text-blue-800 hover:border-sky-300 hover:bg-sky-50"
          to="/login"
        >
          {{ t("nav.login") }}
        </RouterLink>
      </div>
    </div>
    <div
      class="rounded-xl border border-white/70 bg-sky-100/25 p-3 shadow-xl shadow-sky-950/10 backdrop-blur-2xl"
    >
      <div
        class="overflow-hidden rounded-xl border border-white/75 bg-white/80 shadow-sm"
      >
        <div
          class="flex items-center gap-3 border-b border-sky-100/80 bg-sky-100/20 p-4"
        >
          <span
            aria-hidden="true"
            class="grid size-10 shrink-0 place-items-center"
          >
            <img
              :src="newMessengerLogo"
              alt=""
              class="size-full object-contain"
            />
          </span>
          <div>
            <p class="font-bold text-blue-950">New Messenger</p>
            <p class="text-sm text-slate-500">{{ t("home.ready") }}</p>
          </div>
        </div>
        <div class="space-y-4 p-4 text-sm leading-6">
          <div>
            <p class="font-bold text-blue-700">{{ t("message.youSay") }}</p>
            <p class="text-slate-700">{{ t("home.exampleYou") }}</p>
          </div>
          <div>
            <p class="font-bold text-cyan-700">{{ t("home.contact") }}</p>
            <p class="text-slate-700">{{ t("home.exampleContact") }}</p>
          </div>
        </div>
      </div>
      <p
        class="mt-4 inline-flex rounded-full px-3 py-1 text-sm font-semibold"
        :class="{
          'bg-amber-100 text-amber-800': status === 'checking',
          'bg-emerald-100 text-emerald-800': status === 'available',
          'bg-rose-100 text-rose-800': status === 'unavailable',
        }"
      >
        {{ t(statusLabels[status]) }}
      </p>
    </div>
  </section>
</template>
