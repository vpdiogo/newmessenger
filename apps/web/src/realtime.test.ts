import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAccessToken = vi.hoisted(() => vi.fn());

vi.mock("./auth/token", () => ({ getAccessToken }));

type Listener = (event?: { data: string }) => void;

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

  emit(event: string, payload?: { data: string }): void {
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
});
