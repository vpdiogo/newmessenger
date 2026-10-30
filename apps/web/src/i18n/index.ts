import { computed, readonly, ref } from "vue";

import { en, type TranslationKey } from "./en";
import { ptBR } from "./pt-BR";

export type { TranslationKey } from "./en";
export type Locale = "en" | "pt-BR";
export type LanguagePreference = Locale | "auto";
type Placeholders<S extends string> =
  S extends `${string}{${infer P}}${infer R}` ? P | Placeholders<R> : never;
export type PlainKey = {
  [K in TranslationKey]: Placeholders<(typeof en)[K]> extends never ? K : never;
}[TranslationKey];
type Arguments<K extends TranslationKey> = [
  Placeholders<(typeof en)[K]>,
] extends [never]
  ? []
  : [parameters: Record<Placeholders<(typeof en)[K]>, string | number>];

export const LANGUAGE_STORAGE_KEY = "newmessenger.language";
const currentPreference = ref<LanguagePreference>("auto");
const currentLocale = ref<Locale>("en");
export const languagePreference = readonly(currentPreference);
export const locale = readonly(currentLocale);

function isPreference(value: unknown): value is LanguagePreference {
  return value === "auto" || value === "en" || value === "pt-BR";
}

export function resolveBrowserLocale(
  languages: readonly string[] = [],
  language?: string,
): Locale {
  const candidates = languages.length ? languages : language ? [language] : [];
  for (const candidate of candidates) {
    try {
      const tag = Intl.getCanonicalLocales(candidate)[0]?.split("-")[0];
      if (tag === "pt") return "pt-BR";
      if (tag === "en") return "en";
    } catch {
      /* Ignore malformed browser language tags. */
    }
  }
  return "pt-BR";
}

function browserLocale(): Locale {
  if (typeof navigator === "undefined") return "pt-BR";
  return resolveBrowserLocale(navigator.languages, navigator.language);
}

function applyPreference(preference: LanguagePreference): void {
  currentPreference.value = preference;
  currentLocale.value = preference === "auto" ? browserLocale() : preference;
  if (typeof document !== "undefined")
    document.documentElement.lang = currentLocale.value;
}

export function initializeLanguage(): void {
  let preference: LanguagePreference = "auto";
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isPreference(stored)) preference = stored;
  } catch {
    /* Preference storage is optional. */
  }
  applyPreference(preference);
}

export function setLanguagePreference(value: LanguagePreference): void {
  if (!isPreference(value)) return;
  applyPreference(value);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
  } catch {
    /* Keep the in-memory preference. */
  }
}

export function t<K extends TranslationKey>(
  key: K,
  ...args: Arguments<K>
): string {
  const template =
    (currentLocale.value === "pt-BR" ? ptBR[key] : en[key]) ?? en[key];
  const parameters = (args[0] ?? {}) as Record<string, string | number>;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    String(parameters[name] ?? placeholder),
  );
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(currentLocale.value).format(value);
}

// Keep semantic feedback reactive without storing a translated snapshot.
export function useFeedback() {
  const key = ref<PlainKey | null>(null);
  const message = computed(() => (key.value ? t(key.value) : null));
  return { key, message };
}
