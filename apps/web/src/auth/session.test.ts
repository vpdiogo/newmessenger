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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function authenticatedUser(email = "user@example.test"): Response {
  return new Response(JSON.stringify({ email, sub: "user-id" }), {
    status: 200,
  });
}

describe("session verification", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores a stored token only after validating the current user", async () => {
    localStorage.setItem("newmessenger.access-token", "access-token");
    vi.mocked(fetch).mockResolvedValue(authenticatedUser());
    const { restoreSession, session } = await import("./session");

    await expect(restoreSession()).resolves.toBe("authenticated");
    expect(session.isAuthenticated).toBe(true);
    expect(session.user).toEqual({
      email: "user@example.test",
      sub: "user-id",
    });
  });

  it("clears an invalid stored token after an authoritative 401", async () => {
    localStorage.setItem("newmessenger.access-token", "invalid-token");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
      }),
    );
    const { restoreSession, session } = await import("./session");

    await expect(restoreSession()).resolves.toBe("unauthenticated");
    expect(localStorage.getItem("newmessenger.access-token")).toBeNull();
    expect(session.user).toBeNull();
  });

  it("retains an unverifiable token and recovers through an explicit retry", async () => {
    localStorage.setItem("newmessenger.access-token", "access-token");
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockResolvedValueOnce(authenticatedUser());
    const { restoreSession, retrySession, session } = await import("./session");

    await expect(restoreSession()).resolves.toBe("verification-unavailable");
    expect(localStorage.getItem("newmessenger.access-token")).toBe(
      "access-token",
    );
    expect(session.isAuthenticated).toBe(false);
    expect(session.status).toBe("verification-unavailable");

    await expect(retrySession()).resolves.toBe("authenticated");
    expect(session.user?.email).toBe("user@example.test");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("treats a rate-limited verification request as recoverable", async () => {
    localStorage.setItem("newmessenger.access-token", "access-token");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "Too many requests" }), {
        status: 429,
      }),
    );
    const { restoreSession, session } = await import("./session");

    await expect(restoreSession()).resolves.toBe("verification-unavailable");
    expect(localStorage.getItem("newmessenger.access-token")).toBe(
      "access-token",
    );
    expect(session.isAuthenticated).toBe(false);
  });

  it("treats a successful response with an invalid payload as recoverable", async () => {
    localStorage.setItem("newmessenger.access-token", "access-token");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ email: "missing-sub@example.test" }), {
        status: 200,
      }),
    );
    const { restoreSession, session } = await import("./session");

    await expect(restoreSession()).resolves.toBe("verification-unavailable");
    expect(localStorage.getItem("newmessenger.access-token")).toBe(
      "access-token",
    );
    expect(session.isAuthenticated).toBe(false);
  });

  it("coalesces concurrent restoration and retry requests", async () => {
    localStorage.setItem("newmessenger.access-token", "access-token");
    const response = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(response.promise);
    const { restoreSession, retrySession } = await import("./session");

    const restoring = restoreSession();
    const retrying = retrySession();
    expect(fetch).toHaveBeenCalledOnce();
    response.resolve(authenticatedUser());

    await expect(Promise.all([restoring, retrying])).resolves.toEqual([
      "authenticated",
      "authenticated",
    ]);
  });

  it("does not restore an obsolete response after logout", async () => {
    localStorage.setItem("newmessenger.access-token", "access-token");
    const response = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(response.promise);
    const { clearSession, restoreSession, session } = await import("./session");

    const restoring = restoreSession();
    clearSession();
    response.resolve(authenticatedUser());
    await restoring;

    expect(session.status).toBe("unauthenticated");
    expect(session.user).toBeNull();
    expect(localStorage.getItem("newmessenger.access-token")).toBeNull();
  });

  it("does not let an old verification override a newer login", async () => {
    localStorage.setItem("newmessenger.access-token", "old-token");
    const oldCurrentUser = deferred<Response>();
    const newCurrentUser = deferred<Response>();
    let currentUserRequests = 0;
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: "new-token" }), {
            status: 200,
          }),
        );
      }
      currentUserRequests += 1;
      return currentUserRequests === 1
        ? oldCurrentUser.promise
        : newCurrentUser.promise;
    });
    const { loginSession, restoreSession, session } = await import("./session");

    const restoring = restoreSession();
    const loggingIn = loginSession({
      email: "new@example.test",
      password: "Messenger!2026",
    });
    await vi.waitFor(() => expect(currentUserRequests).toBe(2));
    oldCurrentUser.resolve(authenticatedUser("old@example.test"));
    newCurrentUser.resolve(authenticatedUser("new@example.test"));
    await Promise.all([restoring, loggingIn]);

    expect(session.user?.email).toBe("new@example.test");
    expect(localStorage.getItem("newmessenger.access-token")).toBe("new-token");
  });
});
