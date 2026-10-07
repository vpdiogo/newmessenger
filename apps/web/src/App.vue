<script setup lang="ts">
import { clearSession, session } from "./auth/session";
</script>

<template>
  <main class="mx-auto min-h-screen max-w-3xl px-6 py-16">
    <header class="mb-12 flex items-center justify-between">
      <RouterLink class="text-xl font-semibold text-slate-900" to="/">
        New Messenger
      </RouterLink>
      <nav>
        <template v-if="session.isAuthenticated">
          <RouterLink class="mr-4 text-sm font-medium text-slate-600" to="/app">
            {{ session.user?.email }}
          </RouterLink>
          <button
            class="text-sm font-medium text-slate-600"
            type="button"
            @click="clearSession"
          >
            Log out
          </button>
        </template>
        <template v-else>
          <RouterLink
            class="mr-4 text-sm font-medium text-slate-600"
            to="/login"
          >
            Log in
          </RouterLink>
          <RouterLink class="text-sm font-medium text-slate-600" to="/register">
            Register
          </RouterLink>
        </template>
      </nav>
    </header>
    <RouterView />
  </main>
</template>
