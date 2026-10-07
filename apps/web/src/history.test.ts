import { describe, expect, it } from "vitest";

import { isCurrentHistoryRequest } from "./history";

describe("isCurrentHistoryRequest", () => {
  it("rejects a response after another conversation is selected", () => {
    expect(
      isCurrentHistoryRequest("conversation-b", null, "conversation-a", null),
    ).toBe(false);
  });
});
