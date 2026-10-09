import { createSSRApp, h, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";

import type { Conversation, Message } from "../../api/conversations";
import type { TranscriptGroup } from "../../transcript";
import ConversationHeader from "./ConversationHeader.vue";
import ConversationSidebar from "./ConversationSidebar.vue";
import ConversationTranscript from "./ConversationTranscript.vue";
import MessageComposer from "./MessageComposer.vue";
import ParticipantPane from "./ParticipantPane.vue";

function render(
  component: Component,
  props: Record<string, unknown>,
): Promise<string> {
  return renderToString(createSSRApp(() => h(component, props)));
}

const participantEmail = "long-participant-address@example.test";
const conversations: Conversation[] = [
  {
    id: "selected",
    createdAt: "2026-10-09T12:00:00Z",
    participant: { id: "friend", email: participantEmail },
  },
  {
    id: "other",
    createdAt: "2026-10-09T12:00:00Z",
    participant: { id: "other-user", email: "other@example.test" },
  },
];

const sidebarProps = {
  conversations,
  selectedConversationId: "selected",
  userEmail: "owner@example.test",
  connectionState: "connected",
  participantEmail: "",
  isLoadingConversations: false,
  isCreatingConversation: false,
  listError: null,
  creationError: null,
};

function message(id: string, senderId: string, content: string): Message {
  return {
    id,
    senderId,
    content,
    clientMessageId: id,
    conversationId: "selected",
    createdAt: "2026-10-09T12:00:00Z",
  };
}

const groups: TranscriptGroup[] = [
  {
    dateKey: "2026-10-09",
    dateLabel: "Friday, October 9, 2026",
    senderId: "owner",
    messages: [
      message("own-1", "owner", "First line"),
      message("own-2", "owner", "Second line"),
    ],
  },
  {
    dateKey: "2026-10-09",
    dateLabel: "Friday, October 9, 2026",
    senderId: "friend",
    messages: [message("received", "friend", "<b>not markup</b>")],
  },
];

describe("conversation presentation boundaries", () => {
  it("preserves full email names, current selection, and distinct sidebar feedback", async () => {
    const html = await render(ConversationSidebar, {
      ...sidebarProps,
      isLoadingConversations: true,
      listError: "List refresh failed",
      creationError: "Conversation creation failed",
    });
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toContain(participantEmail);
    expect(html).toContain("other@example.test");
    expect(html).toContain("Connection: connected");
    expect(html).toContain("Refreshing...");
    expect(html).toContain("List refresh failed");
    expect(html).toContain("Conversation creation failed");
    expect(html.match(/role="alert"/g)).toHaveLength(2);
    expect(html).toContain('for="participant-email"');
  });

  it("does not mark an arbitrary conversation current when selection is empty", async () => {
    const html = await render(ConversationSidebar, {
      ...sidebarProps,
      selectedConversationId: null,
    });
    expect(html).not.toContain("aria-current");
    expect(html).toContain(participantEmail);
    const empty = await render(ConversationSidebar, {
      ...sidebarProps,
      conversations: [],
      selectedConversationId: null,
    });
    expect(empty).toContain("No conversations yet.");
  });

  it("retains the participant heading ID and right-pane empty state", async () => {
    const header = await render(ConversationHeader, { participantEmail });
    expect(header).toMatch(/<h2[^>]*id="conversation-title"/);
    expect(header).toContain(participantEmail);
    const pane = await render(ParticipantPane, { participantEmail });
    expect(pane).toContain(participantEmail);
    expect(pane).not.toContain("Connection:");
    const empty = await render(ParticipantPane, {});
    expect(empty).toContain("No participant selected");
  });

  it("preserves transcript anchors, grouped authors, dates, and escaped content", async () => {
    const html = await render(ConversationTranscript, {
      groups,
      currentUserId: "owner",
      participantEmail,
      earlierCursor: "earlier",
      isLoadingMessages: false,
      isLoadingEarlier: true,
    });
    expect(html.match(/You say:/g)).toHaveLength(1);
    expect(html).toContain(participantEmail + " says:");
    expect(html.match(/Friday, October 9, 2026/g)).toHaveLength(1);
    for (const id of ["own-1", "own-2", "received"]) {
      expect(html).toContain('data-message-id="' + id + '"');
    }
    expect(html).toContain("&lt;b&gt;not markup&lt;/b&gt;");
    expect(html).not.toContain("<b>not markup</b>");
    expect(html).toContain("Loading earlier messages...");
    expect(html).toMatch(/<button[^>]*\sdisabled(?:\s|=|>)/);
  });

  it("distinguishes initial loading from the transcript empty state", async () => {
    const props = {
      groups: [],
      participantEmail,
      earlierCursor: null,
      isLoadingMessages: true,
      isLoadingEarlier: false,
    };
    const loading = await render(ConversationTranscript, props);
    expect(loading).toContain("Loading messages...");
    expect(loading).not.toContain("No messages yet");
    const empty = await render(ConversationTranscript, {
      ...props,
      isLoadingMessages: false,
    });
    expect(empty).toContain("No messages yet");
    expect(empty).not.toContain("Load earlier messages");
  });
});

const composerProps = {
  conversationId: "selected",
  modelValue: "A draft",
  isSendingMessage: false,
  isLoadingMessages: false,
  contentLength: 7,
  contentLimit: 2000,
  contentError: null,
  isRetrying: false,
};

describe("message composer presentation boundary", () => {
  it("renders controlled drafts, limits, accessible labels, and retry state", async () => {
    const html = await render(MessageComposer, {
      ...composerProps,
      modelValue: "First line\nSecond line",
      isRetrying: true,
    });
    expect(html).toContain("First line\nSecond line");
    expect(html).toContain('for="message"');
    expect(html).toContain('aria-describedby="message-limit"');
    expect(html).toContain('aria-invalid="false"');
    expect(html).toContain("resize-none");
    expect(html).toContain("max-h-32");
    expect(html).toContain("2,000 characters");
    expect(html).toContain("Retry message");
    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:\s|=|>)/);
  });

  it.each([
    { modelValue: "   " },
    { isSendingMessage: true },
    { isLoadingMessages: true },
    { contentError: "Message is too long" },
  ])("preserves the combined submission guard for %o", async (overrides) => {
    const html = await render(MessageComposer, {
      ...composerProps,
      ...overrides,
    });
    expect(html).toMatch(/<button[^>]*\sdisabled(?:\s|=|>)/);
    if ("isSendingMessage" in overrides) expect(html).toContain("Sending...");
    if ("contentError" in overrides)
      expect(html).toContain('aria-invalid="true"');
  });
});
