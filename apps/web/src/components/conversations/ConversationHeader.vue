<script setup lang="ts">
defineProps<{ participantEmail: string }>();
</script>

<template>
  <header
    class="flex items-center gap-2.5 rounded-2xl border border-white/60 bg-sky-100/20 px-4 py-3 shadow-lg shadow-sky-950/5 backdrop-blur-xl sm:px-5"
  >
    <span
      aria-hidden="true"
      class="grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-br from-cyan-400 to-blue-600 font-bold text-white shadow-md shadow-sky-500/25"
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
