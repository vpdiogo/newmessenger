import { ref } from "vue";

import type { Message } from "./api/conversations";
import { isMessage } from "./api/conversations";
import { getAccessToken } from "./auth/token";

export const connectionState = ref<"connecting" | "connected" | "disconnected">(
  "disconnected",
);

let socket: WebSocket | undefined;
let reconnectTimer: number | undefined;
let onMessageCreated: ((message: Message) => void) | undefined;
let onConnected: (() => void) | undefined;
let shouldReconnect = false;

export function connectRealtime(
  handler: (message: Message) => void,
  connectedHandler?: () => void,
): void {
  onMessageCreated = handler;
  onConnected = connectedHandler;
  shouldReconnect = true;
  const accessToken = getAccessToken();
  if (!accessToken || socket) return;

  connectionState.value = "connecting";
  socket = new WebSocket(webSocketUrl(), ["bearer", accessToken]);
  socket.addEventListener("open", () => {
    connectionState.value = "connected";
    onConnected?.();
  });
  socket.addEventListener("message", (event) => {
    let data: unknown;
    try {
      data = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (
      typeof data === "object" &&
      data !== null &&
      "type" in data &&
      data.type === "message.created" &&
      "data" in data &&
      isMessage(data.data)
    ) {
      onMessageCreated?.(data.data);
    }
  });
  socket.addEventListener("close", () => {
    socket = undefined;
    connectionState.value = "disconnected";
    if (shouldReconnect) {
      reconnectTimer = window.setTimeout(() => connectRealtime(handler), 1000);
    }
  });
}

export function disconnectRealtime(): void {
  shouldReconnect = false;
  if (reconnectTimer) window.clearTimeout(reconnectTimer);
  reconnectTimer = undefined;
  socket?.close();
  socket = undefined;
  connectionState.value = "disconnected";
}

function webSocketUrl(): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  return url.toString();
}
