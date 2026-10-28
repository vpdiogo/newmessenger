import { ref } from "vue";

import type { Message } from "./api/conversations";
import { isMessage } from "./api/conversations";
import { getAccessToken } from "./auth/token";

import type { ConnectionState } from "./connection";

export const connectionState = ref<ConnectionState>("disconnected");

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
  openConnection(false);
}

export function retryRealtime(): void {
  if (connectionState.value !== "limited" || socket || !onMessageCreated)
    return;
  openConnection(true);
}

function openConnection(manual: boolean): void {
  const accessToken = getAccessToken();
  if (!accessToken || socket) return;
  if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
  reconnectTimer = undefined;

  connectionState.value = manual ? "retrying-limit" : "connecting";
  if (manual) shouldReconnect = false;
  let currentSocket: WebSocket;
  try {
    currentSocket = new WebSocket(webSocketUrl(), ["bearer", accessToken]);
  } catch {
    connectionState.value = manual ? "limited" : "disconnected";
    return;
  }
  socket = currentSocket;
  currentSocket.addEventListener("open", () => {
    if (socket !== currentSocket) return;
    shouldReconnect = true;
    connectionState.value = "connected";
    onConnected?.();
  });
  currentSocket.addEventListener("message", (event) => {
    if (socket !== currentSocket) return;
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
  currentSocket.addEventListener("close", (event) => {
    if (socket !== currentSocket) return;
    socket = undefined;
    if (event?.code === 4008 || !shouldReconnect) {
      shouldReconnect = false;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      connectionState.value = "limited";
      return;
    }
    connectionState.value = "disconnected";
    if (shouldReconnect) {
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        if (shouldReconnect && !socket && onMessageCreated)
          connectRealtime(onMessageCreated, onConnected);
      }, 1000);
    }
  });
}

export function disconnectRealtime(): void {
  shouldReconnect = false;
  if (reconnectTimer) window.clearTimeout(reconnectTimer);
  reconnectTimer = undefined;
  const closingSocket = socket;
  socket = undefined;
  onMessageCreated = undefined;
  onConnected = undefined;
  connectionState.value = "disconnected";
  closingSocket?.close();
}

function webSocketUrl(): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  return url.toString();
}
