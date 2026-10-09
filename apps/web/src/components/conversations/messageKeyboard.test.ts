import { describe, expect, it, vi } from "vitest";

import { submitMessageOnEnter } from "./messageKeyboard";

describe("message textarea keyboard intent", () => {
  it("prevents a newline and requests one submission for Enter", () => {
    const event = {
      key: "Enter",
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    const submit = vi.fn();
    submitMessageOnEnter(event, submit);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
  });

  it.each([
    { key: "Enter", shiftKey: true },
    { key: "Enter", isComposing: true },
    { key: "Enter", keyCode: 229 },
    { key: "Process", keyCode: 229 },
    { key: "Tab" },
    { key: " " },
  ])("leaves native keyboard behavior unchanged for %o", (properties) => {
    const event = {
      ...properties,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    const submit = vi.fn();
    submitMessageOnEnter(event, submit);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("suppresses held Enter repeats without inserting newlines", () => {
    const event = {
      key: "Enter",
      repeat: true,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    const submit = vi.fn();
    submitMessageOnEnter(event, submit);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });
});
