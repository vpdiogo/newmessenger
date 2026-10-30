import type { InjectionKey } from "vue";

export type OpenSettings = (opener: HTMLElement) => void;
export const openSettingsKey: InjectionKey<OpenSettings> =
  Symbol("openSettings");
