import type { Locale } from "./i18n";
import type { Message } from "./api/conversations";

export type TranscriptGroup = {
  dateKey: string;
  dateLabel: string;
  messages: Message[];
  senderId: string;
};

function dateKey(createdAt: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(createdAt));
}

function dateLabel(createdAt: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(
    new Date(createdAt),
  );
}

export function formatMessageTime(
  createdAt: string,
  locale: Locale = "en",
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

export function groupTranscriptMessages(
  messages: Message[],
  locale: Locale = "en",
): TranscriptGroup[] {
  const groups: TranscriptGroup[] = [];

  for (const message of messages) {
    const currentDateKey = dateKey(message.createdAt);
    const previousGroup = groups.at(-1);

    if (
      previousGroup &&
      previousGroup.senderId === message.senderId &&
      previousGroup.dateKey === currentDateKey
    ) {
      previousGroup.messages.push(message);
      continue;
    }

    groups.push({
      dateKey: currentDateKey,
      dateLabel: dateLabel(message.createdAt, locale),
      messages: [message],
      senderId: message.senderId,
    });
  }

  return groups;
}
