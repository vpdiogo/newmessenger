import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { en } from "./en";
import { ptBR } from "./pt-BR";
import {
  initializeLanguage,
  languagePreference,
  LANGUAGE_STORAGE_KEY,
  locale,
  resolveBrowserLocale,
  setLanguagePreference,
  t,
  formatNumber,
} from "./index";
import { groupTranscriptMessages, formatMessageTime } from "../transcript";

function storage(initial: string | null = null) {
  let stored = initial;
  return {
    getItem: vi.fn(() => stored),
    setItem: vi.fn((_key: string, value: string) => {
      stored = value;
    }),
  };
}

beforeEach(() => {
  vi.stubGlobal("navigator", { languages: ["pt-BR"], language: "pt-BR" });
  vi.stubGlobal("document", { documentElement: { lang: "en" } });
  vi.stubGlobal("localStorage", storage());
});
afterEach(() => {
  setLanguagePreference("en");
  vi.unstubAllGlobals();
});

describe("language resolution and preference", () => {
  it.each([
    [["pt-BR"], "pt-BR"],
    [["pt-PT"], "pt-BR"],
    [["en-US"], "en"],
    [["es", "en", "pt"], "en"],
    [["fr", "es"], "pt-BR"],
    [["invalid_tag", "en-GB"], "en"],
    [[], "pt-BR"],
  ] as const)(
    "resolves ordered preferences %j to %s",
    (languages, expected) => {
      expect(resolveBrowserLocale(languages)).toBe(expected);
    },
  );

  it("uses navigator.language when its list is unavailable or empty", () => {
    expect(resolveBrowserLocale([], "en-GB")).toBe("en");
    expect(resolveBrowserLocale(undefined, "pt-PT")).toBe("pt-BR");
    expect(resolveBrowserLocale([], "invalid_tag")).toBe("pt-BR");
  });

  it("restores explicit choice ahead of the browser and updates document language", () => {
    vi.stubGlobal("localStorage", storage("en"));
    initializeLanguage();
    expect(languagePreference.value).toBe("en");
    expect(locale.value).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    setLanguagePreference("pt-BR");
    expect(localStorage.setItem).toHaveBeenCalledWith(
      LANGUAGE_STORAGE_KEY,
      "pt-BR",
    );
    expect(document.documentElement.lang).toBe("pt-BR");
  });

  it("persists Automatic rather than its resolved locale and does not track OS changes", () => {
    initializeLanguage();
    expect(languagePreference.value).toBe("auto");
    expect(locale.value).toBe("pt-BR");
    vi.stubGlobal("navigator", { languages: ["en-US"] });
    expect(locale.value).toBe("pt-BR");
    setLanguagePreference("auto");
    expect(locale.value).toBe("en");
    expect(localStorage.setItem).toHaveBeenLastCalledWith(
      LANGUAGE_STORAGE_KEY,
      "auto",
    );
    initializeLanguage();
    expect(languagePreference.value).toBe("auto");
    expect(locale.value).toBe("en");
  });

  it("falls back safely from corrupt preferences and unavailable storage/browser data", () => {
    vi.stubGlobal("localStorage", storage("invalid"));
    initializeLanguage();
    expect(languagePreference.value).toBe("auto");
    expect(locale.value).toBe("pt-BR");
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    initializeLanguage();
    expect(locale.value).toBe("pt-BR");
    setLanguagePreference("en");
    expect(locale.value).toBe("en");
  });
});

describe("catalog and formatting", () => {
  it("covers the same nonempty keys with identical interpolation parameters", () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(ptBR[key].trim()).not.toBe("");
      const placeholders = (text: string) =>
        [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      expect(placeholders(ptBR[key])).toEqual(placeholders(en[key]));
    }
  });

  it("interpolates user data unchanged and falls back to English for a missing resource", () => {
    setLanguagePreference("pt-BR");
    expect(
      t("announcement.incoming", {
        participant: "friend@example.test",
        content: "Olá {limit} <test>",
      }),
    ).toBe("friend@example.test diz: Olá {limit} <test>");
    const original = ptBR["message.send"];
    try {
      Reflect.deleteProperty(ptBR, "message.send");
      expect(t("message.send")).toBe(en["message.send"]);
    } finally {
      ptBR["message.send"] = original;
    }
  });

  it("changes presentation without changing grouping keys, timestamps or order", () => {
    const message = {
      id: "a",
      clientMessageId: "a",
      conversationId: "c",
      senderId: "s",
      content: "Olá",
      createdAt: "2026-10-10T12:00:00.123456Z",
    };
    const english = groupTranscriptMessages([message], "en");
    const portuguese = groupTranscriptMessages([message], "pt-BR");
    expect(english[0]?.dateKey).toBe(portuguese[0]?.dateKey);
    expect(english[0]?.dateLabel).not.toBe(portuguese[0]?.dateLabel);
    expect(portuguese[0]?.messages[0]).toBe(message);
    expect(formatMessageTime(message.createdAt, "pt-BR")).toBe(
      new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(message.createdAt)),
    );
    setLanguagePreference("pt-BR");
    expect(formatNumber(2000)).toBe("2.000");
    setLanguagePreference("en");
    expect(formatNumber(2000)).toBe("2,000");
  });
});
