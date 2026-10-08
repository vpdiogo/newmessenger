<script setup lang="ts">
import { session } from "./auth/session";
import { logout } from "./router";
</script>

<template>
  <main class="h-dvh overflow-hidden px-4 py-4 sm:px-6 sm:py-8">
    <div
      class="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/80 bg-white/65 shadow-2xl shadow-sky-950/10 backdrop-blur-xl"
    >
      <header
        class="shrink-0 flex flex-wrap items-center justify-between gap-4 border-b border-sky-100/90 px-5 py-4 sm:px-8"
      >
        <RouterLink
          class="flex items-center gap-3 text-lg font-bold tracking-tight text-blue-950"
          to="/"
        >
          <span
            aria-hidden="true"
            class="grid size-9 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 text-lg shadow-md shadow-sky-500/25"
          >
            ✦
          </span>
          <span>New Messenger</span>
        </RouterLink>
        <nav class="flex items-center gap-4">
          <template v-if="session.isAuthenticated">
            <RouterLink
              class="max-w-40 truncate text-sm font-medium text-slate-600 hover:text-blue-700 sm:max-w-64"
              to="/app"
            >
              {{ session.user?.email }}
            </RouterLink>
            <button
              class="text-sm font-semibold text-slate-600 hover:text-blue-700"
              type="button"
              @click="logout"
            >
              Log out
            </button>
          </template>
          <template v-else>
            <RouterLink
              class="text-sm font-semibold text-slate-600 hover:text-blue-700"
              to="/login"
            >
              Log in
            </RouterLink>
            <RouterLink
              class="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700"
              to="/register"
            >
              Register
            </RouterLink>
          </template>
        </nav>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
        <RouterView />
      </div>
    </div>
  </main>
</template>
