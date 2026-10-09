import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./auth/token", () => ({ getAccessToken: () => "test-access-token" }));

class DelayedCloseSocket {
  static instances: DelayedCloseSocket[] = [];
  readonly listeners = new Map<
    string,
    ((event?: { data: string }) => void)[]
  >();

  constructor() {
    DelayedCloseSocket.instances.push(this);
  }

  addEventListener(
    event: string,
    listener: (event?: { data: string }) => void,
  ): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  }

  close(): void {
    // Browser close() starts an asynchronous closing handshake.
  }

  emit(event: string, payload?: { data: string }): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  DelayedCloseSocket.instances = [];
  vi.stubGlobal("WebSocket", DelayedCloseSocket);
  vi.stubGlobal("window", globalThis);
});

it("ignores obsolete open/message events after disposal and re-entry", async () => {
  const { connectRealtime, disconnectRealtime, connectionState } =
    await import("./realtime");
  const firstHandler = vi.fn();
  const secondHandler = vi.fn();
  const onConnected = vi.fn();
  try {
    connectRealtime(firstHandler);
    const first = DelayedCloseSocket.instances[0]!;
    disconnectRealtime();
    connectRealtime(secondHandler, onConnected);
    const second = DelayedCloseSocket.instances[1]!;
    first.emit("open");
    expect(connectionState.value).toBe("connecting");
    expect(onConnected).not.toHaveBeenCalled();
    first.emit("message", {
      data: JSON.stringify({
        type: "message.created",
        data: {
          id: "stale",
          clientMessageId: "stale",
          conversationId: "old",
          senderId: "old",
          content: "Old content",
          createdAt: "2026-10-09T12:00:00Z",
        },
      }),
    });
    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).not.toHaveBeenCalled();
    second.emit("open");
    expect(connectionState.value).toBe("connected");
    expect(onConnected).toHaveBeenCalledTimes(1);
    disconnectRealtime();
    second.emit("open");
    second.emit("close");
    vi.advanceTimersByTime(5000);
    expect(connectionState.value).toBe("disconnected");
    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(DelayedCloseSocket.instances).toHaveLength(2);
  } finally {
    disconnectRealtime();
  }
});

it("cancels an obsolete reconnect timer when a new owner connects", async () => {
  const { connectRealtime, disconnectRealtime } = await import("./realtime");
  try {
    connectRealtime(vi.fn());
    DelayedCloseSocket.instances[0]!.emit("close");
    expect(vi.getTimerCount()).toBe(1);
    const handler = vi.fn();
    connectRealtime(handler);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(DelayedCloseSocket.instances).toHaveLength(2);
  } finally {
    disconnectRealtime();
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("does not let an old closing socket disconnect a new dashboard connection", async () => {
  const { connectRealtime, disconnectRealtime, connectionState } =
    await import("./realtime");
  const firstHandler = vi.fn();
  const secondHandler = vi.fn();

  try {
    connectRealtime(firstHandler);
    const first = DelayedCloseSocket.instances[0]!;
    first.emit("open");

    disconnectRealtime();
    connectRealtime(secondHandler);
    const second = DelayedCloseSocket.instances[1]!;
    second.emit("open");
    expect.soft(connectionState.value).toBe("connected");

    first.emit("close");
    expect.soft(connectionState.value).toBe("connected");
    vi.advanceTimersByTime(1000);
    expect.soft(DelayedCloseSocket.instances).toHaveLength(2);
  } finally {
    disconnectRealtime();
  }
});
