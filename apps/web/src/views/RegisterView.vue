<script setup lang="ts">
import { useRouter } from "vue-router";

import { registerSession } from "../auth/session";
import { useRegistrationForm } from "../auth/registration";

const router = useRouter();
const {
  email,
  password,
  emailError,
  passwordError,
  errorMessage,
  isSubmitting,
  submit,
} = useRegistrationForm(async (credentials) => {
  await registerSession(credentials);
  await router.push({ name: "dashboard" });
});
</script>

<template>
  <section class="mx-auto max-w-md py-4 sm:py-10">
    <div
      class="rounded-3xl border border-white bg-white/75 p-6 shadow-xl shadow-sky-950/10 backdrop-blur sm:p-8"
    >
      <div class="mb-7">
        <p class="text-sm font-bold text-sky-700">Start messaging</p>
        <h1 class="mt-2 text-3xl font-bold tracking-tight text-blue-950">
          Create an account
        </h1>
        <p class="mt-2 text-slate-600">
          Set up your address and join the conversation.
        </p>
      </div>
      <form
        :aria-busy="isSubmitting"
        class="space-y-4"
        novalidate
        @submit.prevent="submit"
      >
        <label class="block space-y-1.5 text-sm font-semibold text-slate-700">
          Email
          <input
            v-model="email"
            :disabled="isSubmitting"
            id="registration-email"
            :aria-invalid="emailError ? 'true' : undefined"
            :aria-describedby="
              emailError ? 'registration-email-error' : undefined
            "
            autocomplete="email"
            class="block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500"
            required
            type="email"
          />
        </label>
        <p
          v-if="emailError"
          id="registration-email-error"
          class="text-sm font-medium text-rose-700"
          role="alert"
        >
          {{ emailError }}
        </p>
        <label class="block space-y-1.5 text-sm font-semibold text-slate-700">
          Password
          <input
            v-model="password"
            :disabled="isSubmitting"
            id="registration-password"
            :aria-invalid="passwordError ? 'true' : undefined"
            :aria-describedby="
              passwordError
                ? 'registration-password-guidance registration-password-error'
                : 'registration-password-guidance'
            "
            autocomplete="new-password"
            class="block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500"
            minlength="15"
            required
            type="password"
          />
        </label>
        <p id="registration-password-guidance" class="text-sm text-slate-600">
          Use 15–256 characters: a unique, long password or several unrelated
          words. Spaces, accents and symbols are welcome; character categories
          are not required. Avoid only whitespace or your complete email
          address.
        </p>
        <p
          v-if="passwordError"
          id="registration-password-error"
          class="text-sm font-medium text-rose-700"
          role="alert"
        >
          {{ passwordError }}
        </p>
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
          {{ isSubmitting ? "Creating account..." : "Create account" }}
        </button>
      </form>
      <p class="mt-6 text-sm text-slate-600">
        Already have an account?
        <RouterLink
          class="font-semibold text-blue-700 hover:text-blue-800"
          to="/login"
        >
          Log in
        </RouterLink>
      </p>
    </div>
  </section>
</template>

<style scoped>
@media (min-width: 640px) and (max-height: 760px) {
  section {
    padding-block: 1rem;
  }
}
</style>
