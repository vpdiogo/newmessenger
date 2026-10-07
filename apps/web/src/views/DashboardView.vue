<script setup lang="ts">
import { session } from "../auth/session";
</script>

<template>
  <section class="space-y-4">
    <p class="text-sm font-medium text-indigo-600">Authenticated area</p>
    <h1 class="text-3xl font-bold tracking-tight text-slate-950">
      Welcome, {{ session.user?.email }}.
    </h1>
    <p class="text-slate-600">
      Conversation management will be added in the next increment.
    </p>
  </section>
</template>
