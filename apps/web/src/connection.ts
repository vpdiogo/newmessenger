export type ConnectionState =
  "connecting" | "connected" | "disconnected" | "limited" | "retrying-limit";

export const CONNECTION_LIMIT_MESSAGE =
  "You have reached the connection limit. Close another tab or session and try again.";
