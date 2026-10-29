<script setup lang="ts">
import { t } from "../i18n";
import { useRouter } from "vue-router";

import { loginSession } from "../auth/session";
import { useLoginForm } from "../auth/login";

const router = useRouter();
const { email, password, errorMessage, isSubmitting, submit } = useLoginForm(
  async (credentials) => {
    await loginSession(credentials);
    await router.push({ name: "dashboard" });
  },
);
</script>

<template>
  <section class="mx-auto max-w-md py-4 sm:py-10">
    <div
      class="rounded-3xl border border-white bg-white/75 p-6 shadow-xl shadow-sky-950/10 backdrop-blur sm:p-8"
    >
      <div class="mb-7">
        <p class="text-sm font-bold text-sky-700">{{ t("login.welcome") }}</p>
        <h1 class="mt-2 text-3xl font-bold tracking-tight text-blue-950">
          {{ t("nav.login") }}
        </h1>
        <p class="mt-2 text-slate-600">
          {{ t("login.description") }}
        </p>
      </div>
      <form
        :aria-busy="isSubmitting"
        class="space-y-4"
        @submit.prevent="submit"
      >
        <label class="block space-y-1.5 text-sm font-semibold text-slate-700">
          {{ t("common.email") }}
          <input
            v-model="email"
            :disabled="isSubmitting"
            autocomplete="email"
            class="block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500"
            required
            type="email"
          />
        </label>
        <label class="block space-y-1.5 text-sm font-semibold text-slate-700">
          {{ t("common.password") }}
          <input
            v-model="password"
            :disabled="isSubmitting"
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
          {{ isSubmitting ? t("login.pending") : t("nav.login") }}
        </button>
      </form>
      <p class="mt-6 text-sm text-slate-600">
        {{ t("login.needAccount") }}
        <RouterLink
          class="font-semibold text-blue-700 hover:text-blue-800"
          to="/register"
        >
          {{ t("nav.register") }}
        </RouterLink>
      </p>
    </div>
  </section>
</template>
