import { ref } from "vue";
import { describe, expect, it } from "vitest";

import type { MessageUpdateSource } from "./useConversationMessages";
import { useTranscriptScroll } from "./useTranscriptScroll";

function viewport() {
  let anchorTop = 120;
  const anchor = {
    dataset: { messageId: "anchor" },
    getBoundingClientRect: () => ({ top: anchorTop, bottom: anchorTop + 30 }),
  };
  const element = {
    scrollTop: 300,
    scrollHeight: 1000,
    clientHeight: 400,
    getBoundingClientRect: () => ({ top: 100 }),
    querySelectorAll: () => [anchor],
  };
  return {
    element: element as unknown as HTMLElement,
    setScrollHeight: (height: number) => {
      element.scrollHeight = height;
    },
    moveAnchor: (top: number) => {
      anchorTop = top;
    },
  };
}

describe("transcript scroll effects", () => {
  it.each(["initial", "local-send"] as MessageUpdateSource[])(
    "reveals the end for %s only after the update completes",
    async (source) => {
      const { element, setScrollHeight } = viewport();
      const state = useTranscriptScroll(ref(element));
      const afterRender = state.beforeMessagesUpdate(source, () => true);
      setScrollHeight(1200);
      expect(element.scrollTop).toBe(300);
      await afterRender();
      expect(element.scrollTop).toBe(1200);
    },
  );

  it("captures the reading anchor before earlier messages change geometry", async () => {
    const { element, moveAnchor } = viewport();
    const state = useTranscriptScroll(ref(element));
    const afterRender = state.beforeMessagesUpdate("earlier", () => true);
    moveAnchor(420);
    await afterRender();
    expect(element.scrollTop).toBe(600);
  });

  it("follows realtime/recovery only near the end and without intervening reader movement", async () => {
    const { element, setScrollHeight } = viewport();
    const state = useTranscriptScroll(ref(element));
    await state.beforeMessagesUpdate("realtime", () => true)();
    expect(element.scrollTop).toBe(300);
    element.scrollTop = 600;
    let afterRender = state.beforeMessagesUpdate("recovery", () => true);
    setScrollHeight(1200);
    await afterRender();
    expect(element.scrollTop).toBe(1200);
    element.scrollTop = 800;
    afterRender = state.beforeMessagesUpdate("realtime", () => true);
    element.scrollTop = 700;
    await afterRender();
    expect(element.scrollTop).toBe(700);
  });

  it.each(["selection", "viewport", "disposal"])(
    "ignores an effect invalidated by %s",
    async (change) => {
      const { element } = viewport();
      const transcript = ref<HTMLElement | null>(element);
      const state = useTranscriptScroll(transcript);
      let current = true;
      const afterRender = state.beforeMessagesUpdate(
        "local-send",
        () => current,
      );
      if (change === "selection") current = false;
      if (change === "viewport") transcript.value = viewport().element;
      if (change === "disposal") state.dispose();
      await afterRender();
      expect(element.scrollTop).toBe(300);
    },
  );
});
