<script setup lang="ts">
defineProps<{ participantEmail?: string }>();
</script>

<template>
  <aside
    class="hidden min-h-0 flex-col overflow-hidden rounded-xl border border-white/70 bg-sky-100/30 shadow-lg shadow-sky-950/5 backdrop-blur-xl xl:flex"
  >
    <template v-if="participantEmail !== undefined">
      <div class="border-b border-white/45 bg-white/28 p-4 text-center">
        <span
          aria-hidden="true"
          class="mx-auto grid size-20 place-items-center rounded-3xl bg-linear-to-br from-cyan-400 to-blue-600 text-2xl font-bold text-white shadow-lg shadow-sky-500/25"
        >
          {{ participantEmail.slice(0, 1).toUpperCase() }}
        </span>
        <p class="mt-4 break-all text-sm font-bold text-blue-950">
          {{ participantEmail }}
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
</template>
