import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("restoreSession", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores a stored token after validating the current user", async () => {
    localStorage.setItem("newmessenger.access-token", "access-token");
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ email: "user@example.test", sub: "user-id" }),
        { status: 200 },
      ),
    );
    const { restoreSession, session } = await import("./session");

    await expect(restoreSession()).resolves.toBe(true);
    expect(session.isAuthenticated).toBe(true);
    expect(session.user).toEqual({
      email: "user@example.test",
      sub: "user-id",
    });
  });
});
