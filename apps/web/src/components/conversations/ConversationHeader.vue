<script setup lang="ts">
defineProps<{ participantEmail: string }>();
</script>

<template>
  <header
    class="flex items-center gap-3 border-b border-sky-100 bg-sky-50/55 px-5 py-4 sm:px-6"
  >
    <span
      aria-hidden="true"
      class="grid size-11 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-cyan-400 to-blue-600 font-bold text-white shadow-md shadow-sky-500/25"
    >
      {{ participantEmail.slice(0, 1).toUpperCase() }}
    </span>
    <div class="min-w-0">
      <h2
        id="conversation-title"
        class="truncate text-lg font-bold text-blue-950"
      >
        {{ participantEmail }}
      </h2>
    </div>
  </header>
</template>
