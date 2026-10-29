<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";

import { languagePreference, setLanguagePreference, t } from "../i18n";

const dialog = ref<HTMLDialogElement | null>(null);
const selector = ref<HTMLSelectElement | null>(null);
let opener: HTMLElement | null = null;

function open(element: HTMLElement): void {
  if (!dialog.value || dialog.value.open) return;
  opener = element;
  dialog.value.showModal();
  selector.value?.focus();
}

function close(): void {
  dialog.value?.close();
}

function restoreFocus(): void {
  const available = (element: HTMLElement) =>
    element.isConnected && element.getClientRects().length > 0;
  const target =
    opener && available(opener)
      ? opener
      : [
          ...document.querySelectorAll<HTMLElement>("[data-settings-opener]"),
        ].find(available);
  target?.focus({ preventScroll: true });
  opener = null;
}

function changeLanguage(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (value === "auto" || value === "pt-BR" || value === "en")
    setLanguagePreference(value);
}

onBeforeUnmount(() => {
  dialog.value?.close();
});
defineExpose({ open });
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="settings-title"
    aria-describedby="settings-description"
    class="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-white/80 bg-sky-50 p-6 text-blue-950 shadow-2xl backdrop:bg-blue-950/40"
    @close="restoreFocus"
  >
    <h2 id="settings-title" class="text-xl font-bold">
      {{ t("settings.title") }}
    </h2>
    <p id="settings-description" class="mt-2 text-sm text-slate-600">
      {{ t("settings.help") }}
    </p>
    <label for="app-language" class="mt-5 block text-sm font-semibold">{{
      t("settings.language")
    }}</label>
    <select
      id="app-language"
      ref="selector"
      :value="languagePreference"
      class="mt-2 block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-slate-900"
      @change="changeLanguage"
    >
      <option value="auto">{{ t("settings.automatic") }}</option>
      <option value="pt-BR" lang="pt-BR">Português (Brasil)</option>
      <option value="en" lang="en">English</option>
    </select>
    <button
      type="button"
      class="mt-6 rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700"
      @click="close"
    >
      {{ t("common.close") }}
    </button>
  </dialog>
</template>
