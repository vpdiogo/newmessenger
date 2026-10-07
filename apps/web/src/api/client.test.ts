import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestJson } from "./client";
import { clearAccessToken, setAccessToken } from "../auth/token";

function memoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("requestJson", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    clearAccessToken();
    vi.unstubAllGlobals();
  });

  it("sends the stored access token with authenticated API requests", async () => {
    setAccessToken("access-token");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ email: "user@example.test" }), {
        status: 200,
      }),
    );

    await requestJson("/auth/me");

    const [, options] = vi.mocked(fetch).mock.calls[0] ?? [];
    const headers = new Headers(options?.headers);
    expect(headers.get("authorization")).toBe("Bearer access-token");
  });
});
