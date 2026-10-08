<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

import { ApiError } from "../api/client";
import { loginSession } from "../auth/session";

const router = useRouter();
const email = ref("");
const password = ref("");
const errorMessage = ref<string | null>(null);
const isSubmitting = ref(false);

async function submit(): Promise<void> {
  errorMessage.value = null;
  isSubmitting.value = true;

  try {
    await loginSession({ email: email.value, password: password.value });
    await router.push({ name: "dashboard" });
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError && error.status === 401
        ? "Invalid email or password."
        : "Unable to log in. Please try again.";
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <section class="mx-auto max-w-md py-4 sm:py-10">
    <div
      class="rounded-3xl border border-white bg-white/75 p-6 shadow-xl shadow-sky-950/10 backdrop-blur sm:p-8"
    >
      <div class="mb-7">
        <p class="text-sm font-bold text-sky-700">Welcome back</p>
        <h1 class="mt-2 text-3xl font-bold tracking-tight text-blue-950">
          Log in
        </h1>
        <p class="mt-2 text-slate-600">
          Pick up where your conversations left off.
        </p>
      </div>
      <form class="space-y-4" @submit.prevent="submit">
        <label class="block space-y-1.5 text-sm font-semibold text-slate-700">
          Email
          <input
            v-model="email"
            autocomplete="email"
            class="block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500"
            required
            type="email"
          />
        </label>
        <label class="block space-y-1.5 text-sm font-semibold text-slate-700">
          Password
          <input
            v-model="password"
            autocomplete="current-password"
            class="block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500"
            minlength="12"
            required
            type="password"
          />
        </label>
        <p
          v-if="errorMessage"
          class="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
          role="alert"
        >
          {{ errorMessage }}
        </p>
        <button
          class="w-full rounded-xl bg-blue-600 px-3 py-2.5 font-semibold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="isSubmitting"
          type="submit"
        >
          {{ isSubmitting ? "Logging in..." : "Log in" }}
        </button>
      </form>
      <p class="mt-6 text-sm text-slate-600">
        Need an account?
        <RouterLink
          class="font-semibold text-blue-700 hover:text-blue-800"
          to="/register"
        >
          Register
        </RouterLink>
      </p>
    </div>
  </section>
</template>
