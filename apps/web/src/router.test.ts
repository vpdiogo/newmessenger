import { beforeEach, describe, expect, it, vi } from "vitest";

const routerState = vi.hoisted(() => ({
  guard: undefined as
    | ((to: {
        meta: { requiresAuth: boolean };
        fullPath?: string;
      }) => Promise<unknown>)
    | undefined,
}));
const push = vi.hoisted(() => vi.fn());
const sessionApi = vi.hoisted(() => ({
  clearSession: vi.fn(),
  restoreSession: vi.fn(),
}));

vi.mock("vue-router", () => ({
  createRouter: () => ({
    beforeEach: (guard: typeof routerState.guard) => {
      routerState.guard = guard;
    },
    push,
  }),
  createWebHistory: vi.fn(),
}));
vi.mock("./auth/session", () => sessionApi);

import { logout } from "./router";

describe("protected-route verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    push.mockResolvedValue(undefined);
  });

  it("keeps the intended protected URL when verification is unavailable", async () => {
    sessionApi.restoreSession.mockResolvedValue("verification-unavailable");
    const guard = routerState.guard! as (to: {
      meta: { requiresAuth: boolean };
      fullPath: string;
    }) => Promise<unknown>;
    const to = {
      fullPath: "/app?conversation=second&keep=yes#anchor",
      meta: { requiresAuth: true },
    };

    await expect(guard(to)).resolves.toBeUndefined();
    expect(to.fullPath).toBe("/app?conversation=second&keep=yes#anchor");
  });

  it("redirects to login only when verification proves the session is invalid", async () => {
    sessionApi.restoreSession.mockResolvedValue("unauthenticated");
    const guard = routerState.guard! as (to: {
      meta: { requiresAuth: boolean };
    }) => Promise<unknown>;

    await expect(guard({ meta: { requiresAuth: true } })).resolves.toEqual({
      name: "login",
    });
  });

  it("clears the session and navigates to login on explicit logout", async () => {
    await logout();

    expect(sessionApi.clearSession).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith({ name: "login" });
  });
});
