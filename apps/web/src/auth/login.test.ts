import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { useLoginForm } from "./login";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("login submission", () => {
  it("admits one pending request with captured credentials and allows retry after failure", async () => {
    const request = deferred();
    const login = vi
      .fn()
      .mockReturnValueOnce(request.promise)
      .mockResolvedValue(undefined);
    const state = useLoginForm(login);
    state.email.value = "user@example.test";
    state.password.value = "  original password  ";
    const pending = state.submit();
    expect(state.isSubmitting.value).toBe(true);
    await state.submit();
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith({
      email: "user@example.test",
      password: "  original password  ",
    });
    request.reject(new ApiError(401, "Unauthorized"));
    await pending;
    expect(state.isSubmitting.value).toBe(false);
    expect(state.errorMessage.value).toBe("Invalid email or password.");
    expect(state.email.value).toBe("user@example.test");
    expect(state.password.value).toBe("  original password  ");
    await state.submit();
    expect(login).toHaveBeenCalledTimes(2);
    expect(state.errorMessage.value).toBeNull();
  });

  it("keeps captured values stable and uses generic feedback for transient failures", async () => {
    const request = deferred();
    const login = vi.fn().mockReturnValue(request.promise);
    const state = useLoginForm(login);
    state.email.value = "original@example.test";
    state.password.value = "original password";
    const pending = state.submit();
    state.email.value = "changed@example.test";
    state.password.value = "changed password";
    await state.submit();
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith({
      email: "original@example.test",
      password: "original password",
    });
    request.reject(new ApiError(503, "Service unavailable"));
    await pending;
    expect(state.errorMessage.value).toBe(
      "Unable to log in. Please try again.",
    );
    expect(state.isSubmitting.value).toBe(false);
  });
});
