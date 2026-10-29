import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAccessToken = vi.hoisted(() => vi.fn());

vi.mock("./auth/token", () => ({ getAccessToken }));

type Listener = (event?: { data?: string; code?: number }) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readonly listeners = new Map<string, Listener[]>();
  readonly protocols: string[];
  readonly url: string;

  constructor(url: string, protocols: string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
  }

  addEventListener(event: string, listener: Listener): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  }

  close(): void {
    this.emit("close");
  }

  emit(event: string, payload?: { data?: string; code?: number }): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}

describe("realtime connection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    MockWebSocket.instances = [];
    getAccessToken.mockReturnValue("access-token");
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("window", globalThis);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("recovers the connected callback after a reconnect", async () => {
    const { connectRealtime, disconnectRealtime } = await import("./realtime");
    const onConnected = vi.fn();

    connectRealtime(vi.fn(), onConnected);
    MockWebSocket.instances[0]?.emit("open");
    MockWebSocket.instances[0]?.emit("close");
    vi.advanceTimersByTime(1000);
    MockWebSocket.instances[1]?.emit("open");

    expect(onConnected).toHaveBeenCalledTimes(2);
    expect(MockWebSocket.instances[1]?.protocols).toEqual([
      "bearer",
      "access-token",
    ]);

    disconnectRealtime();
  });

  it("stops after4008 and permits one manual attempt while preserving callbacks", async () => {
    const {
      connectRealtime,
      retryRealtime,
      disconnectRealtime,
      connectionState,
    } = await import("./realtime");
    const onConnected = vi.fn();
    const onMessage = vi.fn();
    try {
      connectRealtime(onMessage, onConnected);
      const first = MockWebSocket.instances[0]!;
      first.emit("open");
      first.emit("close", { code: 4008 });
      expect(connectionState.value).toBe("limited");
      vi.advanceTimersByTime(5000);
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
      retryRealtime();
      retryRealtime();
      expect(connectionState.value).toBe("retrying-limit");
      expect(MockWebSocket.instances).toHaveLength(2);
      const second = MockWebSocket.instances[1]!;
      second.emit("close", { code: 1006 });
      expect(connectionState.value).toBe("limited");
      expect(vi.getTimerCount()).toBe(0);
      retryRealtime();
      const third = MockWebSocket.instances[2]!;
      third.emit("open");
      expect(connectionState.value).toBe("connected");
      expect(onConnected).toHaveBeenCalledTimes(2);
      third.emit("close", { code: 4008 });
      expect(connectionState.value).toBe("limited");
      expect(vi.getTimerCount()).toBe(0);
      retryRealtime();
      MockWebSocket.instances[3]!.emit("open");
      MockWebSocket.instances[3]!.emit("close", { code: 1006 });
      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances).toHaveLength(5);
    } finally {
      disconnectRealtime();
    }
    expect(connectionState.value).toBe("disconnected");
    retryRealtime();
    expect(MockWebSocket.instances).toHaveLength(5);
  });
});
