<script setup lang="ts">
import { inject } from "vue";
import { openSettingsKey } from "../../settings";
import { t } from "../../i18n";
import defaultUserAvatar from "../../assets/default-user-avatar.png";

const openSettings = inject(openSettingsKey);

defineProps<{ participantEmail?: string }>();
</script>

<template>
  <aside
    class="hidden min-h-0 flex-col overflow-hidden rounded-xl border border-white/70 bg-sky-100/30 shadow-lg shadow-sky-950/5 backdrop-blur-xl xl:flex"
  >
    <div class="min-h-0 flex-1 overflow-y-auto">
      <template v-if="participantEmail !== undefined">
        <div class="border-b border-white/45 bg-white/28 p-4 text-center">
          <span
            aria-hidden="true"
            class="mx-auto grid size-20 place-items-center rounded-3xl bg-emerald-100/80 shadow-lg shadow-emerald-950/10"
          >
            <img
              alt=""
              class="size-full object-contain p-2"
              :src="defaultUserAvatar"
            />
          </span>
          <p class="mt-4 break-all text-sm font-bold text-blue-950">
            {{ participantEmail }}
          </p>
        </div>
      </template>
      <div v-else class="grid h-full place-items-center p-6 text-center">
        <div class="max-w-44">
          <span
            aria-hidden="true"
            class="mx-auto grid size-14 place-items-center rounded-2xl bg-sky-100 text-2xl text-sky-700"
            >✦</span
          >
          <p class="mt-4 font-bold text-blue-950">
            {{ t("participant.emptyTitle") }}
          </p>
          <p class="mt-2 text-sm leading-6 text-slate-500">
            {{ t("participant.emptyDescription") }}
          </p>
        </div>
      </div>
    </div>
    <footer class="shrink-0 border-t border-white/50 p-3">
      <button
        type="button"
        data-settings-opener
        class="w-full rounded-xl border border-white/70 bg-white/40 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-white/60"
        @click="openSettings?.($event.currentTarget as HTMLElement)"
      >
        {{ t("settings.title") }}
      </button>
    </footer>
  </aside>
</template>
