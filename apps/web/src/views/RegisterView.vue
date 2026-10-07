<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

import { ApiError } from "../api/client";
import { registerSession } from "../auth/session";

const router = useRouter();
const email = ref("");
const password = ref("");
const errorMessage = ref<string | null>(null);
const isSubmitting = ref(false);

async function submit(): Promise<void> {
  errorMessage.value = null;
  isSubmitting.value = true;

  try {
    await registerSession({ email: email.value, password: password.value });
    await router.push({ name: "dashboard" });
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError && error.status === 409
        ? "This email is already registered."
        : "Unable to create your account. Please try again.";
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <section class="mx-auto max-w-md space-y-6">
    <div>
      <p class="text-sm font-medium text-indigo-600">Start messaging</p>
      <h1 class="mt-2 text-3xl font-bold tracking-tight text-slate-950">
        Create an account
      </h1>
    </div>
    <form class="space-y-4" @submit.prevent="submit">
      <label class="block space-y-1 text-sm font-medium text-slate-700">
        Email
        <input
          v-model="email"
          autocomplete="email"
          class="block w-full rounded-md border border-slate-300 px-3 py-2"
          required
          type="email"
        />
      </label>
      <label class="block space-y-1 text-sm font-medium text-slate-700">
        Password
        <input
          v-model="password"
          autocomplete="new-password"
          class="block w-full rounded-md border border-slate-300 px-3 py-2"
          minlength="12"
          required
          type="password"
        />
      </label>
      <p class="text-sm text-slate-600">Use at least 12 characters.</p>
      <p v-if="errorMessage" class="text-sm text-rose-700">
        {{ errorMessage }}
      </p>
      <button
        class="w-full rounded-md bg-indigo-600 px-3 py-2 font-medium text-white disabled:opacity-60"
        :disabled="isSubmitting"
        type="submit"
      >
        {{ isSubmitting ? "Creating account..." : "Create account" }}
      </button>
    </form>
    <p class="text-sm text-slate-600">
      Already have an account?
      <RouterLink class="font-medium text-indigo-600" to="/login">
        Log in
      </RouterLink>
    </p>
  </section>
</template>
