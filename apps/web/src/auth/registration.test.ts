import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { passwordError, useRegistrationForm } from "./registration";

function form() {
  const register = vi
    .fn<(credentials: { email: string; password: string }) => Promise<void>>()
    .mockResolvedValue(undefined);
  const state = useRegistrationForm(register);
  state.email.value = "user@example.test";
  state.password.value = "river lantern mango orbit";
  return { ...state, register };
}

describe("registration policy and feedback", () => {
  it("validates boundaries, Unicode, passphrases and complete email without modifying input", () => {
    for (const password of [
      "a".repeat(14),
      "a".repeat(257),
      " ".repeat(15),
      "\t\n".repeat(8),
      "😀".repeat(14),
      "😀".repeat(257),
      "prefix USER@EXAMPLE.TEST",
    ])
      expect(passwordError("user@example.test", password)).toBeDefined();
    for (const password of [
      "a".repeat(15),
      "a".repeat(256),
      "😀".repeat(15),
      "😀".repeat(256),
      "  café nuvem órbita!  ",
      "  e\u0301 nuvens e café!  ",
      "river lantern mango orbit",
      "prefix user@example suffix",
    ])
      expect(passwordError("user@example.test", password)).toBeUndefined();
  });

  it("blocks invalid fields and submits exact credentials after correction", async () => {
    const state = form();
    state.email.value = "invalid";
    state.password.value = "short";
    expect(await state.submit()).toBe(false);
    expect(state.register).not.toHaveBeenCalled();
    expect(state.emailError.value).toBeDefined();
    expect(state.passwordError.value).toBeDefined();
    state.email.value = "user@example.test";
    state.password.value = "  café nuvem órbita!  ";
    expect(await state.submit()).toBe(true);
    expect(state.register).toHaveBeenCalledWith({
      email: "user@example.test",
      password: "  café nuvem órbita!  ",
    });
  });

  it("reevaluates email-in-password when either field changes", async () => {
    const state = form();
    state.password.value = "prefix USER@EXAMPLE.TEST suffix";
    await state.submit();
    expect(state.passwordError.value).toContain("complete email");
    state.email.value = "other@example.test";
    expect(state.passwordError.value).toBeUndefined();
    state.email.value = "user@example.test";
    expect(state.passwordError.value).toContain("complete email");
    state.password.value = "river lantern mango orbit";
    expect(state.passwordError.value).toBeUndefined();
  });

  it("keeps duplicate email feedback on password edits and clears it on email edits", async () => {
    const state = form();
    state.register.mockRejectedValueOnce(
      new ApiError(409, "Email already registered"),
    );
    await state.submit();
    expect(state.emailError.value).toContain("already registered");
    state.password.value = "another long unique passphrase";
    expect(state.emailError.value).toContain("already registered");
    state.email.value = "other@example.test";
    expect(state.emailError.value).toBeUndefined();
    expect(await state.submit()).toBe(true);
  });

  it("uses recognized field codes and safely falls back for unknown or legacy errors", async () => {
    const state = form();
    state.register.mockRejectedValueOnce(
      new ApiError(400, "raw validator internal", {
        password: "password_length",
      }),
    );
    await state.submit();
    expect(state.passwordError.value).toBe(
      "Use between 15 and 256 characters.",
    );
    state.password.value = "another long unique passphrase";
    expect(state.passwordError.value).toBeUndefined();
    for (const error of [
      new ApiError(400, "raw validator internal"),
      new ApiError(400, "raw validator internal", {
        password: "secret details",
        email: { internal: true },
      }),
      new ApiError(503, "unavailable"),
      new Error("network"),
    ]) {
      state.register.mockRejectedValueOnce(error);
      expect(await state.submit()).toBe(false);
      expect(state.errorMessage.value).toBe(
        "Unable to create your account. Please try again.",
      );
      expect(state.passwordError.value).toBeUndefined();
      expect(state.emailError.value).toBeUndefined();
      expect(state.isSubmitting.value).toBe(false);
    }
  });

  it("does not attach a late field error to changed credentials", async () => {
    const state = form();
    let reject!: (error: Error) => void;
    state.register.mockImplementationOnce(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const pending = state.submit();
    state.email.value = "other@example.test";
    reject(new ApiError(409, "Email already registered"));
    await pending;
    expect(state.emailError.value).toBeUndefined();
  });
});
