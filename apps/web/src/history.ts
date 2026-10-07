export function isCurrentHistoryRequest(
  activeConversationId: string | null,
  activeCursor: string | null,
  requestConversationId: string,
  requestCursor: string | null,
): boolean {
  return (
    activeConversationId === requestConversationId &&
    activeCursor === requestCursor
  );
}
