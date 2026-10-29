import { afterEach, expect, it, vi } from "vitest";

import { getAccessToken } from "./token";

afterEach(() => vi.unstubAllGlobals());

it("treats unavailable token storage as unauthenticated so public UI can start", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("Storage denied");
    },
  });
  expect(getAccessToken()).toBeNull();
});

it("preserves normal stored-token reads", () => {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn().mockReturnValue("stored-token"),
  });
  expect(getAccessToken()).toBe("stored-token");
  expect(localStorage.getItem).toHaveBeenCalledWith(
    "newmessenger.access-token",
  );
});
