import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());

vi.mock("vue-router", () => ({
  createRouter: () => ({ beforeEach: vi.fn(), push }),
  createWebHistory: vi.fn(),
}));

import { getAccessToken, setAccessToken } from "./auth/token";
import { logout } from "./router";

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

describe("logout", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("clears the session and navigates to login", async () => {
    setAccessToken("access-token");
    push.mockResolvedValue(undefined);

    await logout();

    expect(getAccessToken()).toBeNull();
    expect(push).toHaveBeenCalledWith({ name: "login" });
  });
});
