import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { test } from "node:test";
import { WebSocket } from "ws";

import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/env.js";

const options = {
  databaseUrl: "postgresql://example.invalid/test",
  jwtSecret: "test-secret-that-is-at-least-32-characters",
};

class Socket extends EventEmitter {
  readyState = WebSocket.OPEN;
  terminate() {
    this.emit("close");
  }
  send() {}
}
const websocket = (socket: Socket) => socket as unknown as WebSocket;

test("occupancy shares the socket registry and releases exactly once without deleting replacements", async () => {
  const app = await buildApp({
    ...options,
    websocketConnectionLimitEnabled: true,
  });
  try {
    const first = new Socket();
    const release = app.realtime.addConnection("a", websocket(first));
    assert.ok(release);
    release();
    const replacements = Array.from({ length: 5 }, () => new Socket());
    for (const socket of replacements)
      assert.ok(app.realtime.addConnection("a", websocket(socket)));
    first.emit("error", new Error("old error"));
    first.emit("close");
    release();
    assert.equal(
      app.realtime.addConnection("a", websocket(new Socket())),
      null,
    );
    replacements[0]!.emit("error", new Error("connection failed"));
    replacements[0]!.emit("close");
    assert.ok(app.realtime.addConnection("a", websocket(new Socket())));
    assert.equal(
      app.realtime.addConnection("a", websocket(new Socket())),
      null,
    );
    assert.ok(app.realtime.addConnection("b", websocket(new Socket())));
  } finally {
    await app.close();
  }
  assert.throws(
    () => app.realtime.addConnection("a", websocket(new Socket())),
    /closing/,
  );
});

test("registration failure releases the reservation", async () => {
  const app = await buildApp({
    ...options,
    websocketConnectionLimitEnabled: true,
  });
  const broken = new Socket();
  broken.once = () => {
    throw new Error("listener registration failed");
  };
  try {
    assert.throws(
      () => app.realtime.addConnection("a", websocket(broken)),
      /registration failed/,
    );
    for (let i = 0; i < 5; i++)
      assert.ok(app.realtime.addConnection("a", websocket(new Socket())));
    assert.equal(
      app.realtime.addConnection("a", websocket(new Socket())),
      null,
    );
  } finally {
    await app.close();
  }
});

test(
  "TCP admission is atomic, JWT-first, user/instance scoped, and recovers after replacement",
  { timeout: 5000 },
  async () => {
    const app = await buildApp({
      ...options,
      websocketConnectionLimitEnabled: true,
    });
    const sockets: WebSocket[] = [];
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    assert.ok(address && typeof address !== "string");
    const port = address.port;
    const token = app.jwt.sign({ sub: "user-a", email: "a@example.test" });
    async function connect(accessToken = token) {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, [
        "bearer",
        accessToken,
      ]);
      sockets.push(socket);
      const events: unknown[] = [];
      socket.on("message", (data) => events.push(JSON.parse(String(data))));
      const outcome = new Promise<boolean>((resolve) => {
        socket.once("message", () => resolve(true));
        socket.once("close", () => resolve(false));
      });
      const closed = new Promise<{ code: number; reason: string }>((resolve) =>
        socket.once("close", (code, reason) =>
          resolve({ code, reason: String(reason) }),
        ),
      );
      await once(socket, "open");
      return { socket, events, closed, accepted: await outcome };
    }
    try {
      const invalid = await connect("invalid");
      assert.equal((await invalid.closed).code, 1008);
      const connections = await Promise.all(
        Array.from({ length: 6 }, () => connect()),
      );
      const accepted = connections.filter(
        (connection) => connection.events.length === 1,
      );
      assert.equal(accepted.length, 5);
      for (const connection of accepted)
        assert.deepEqual(connection.events, [{ type: "connection.accepted" }]);
      const rejected = connections.find(
        (connection) => connection.events.length === 0,
      )!;
      assert.deepEqual(await rejected.closed, {
        code: 4008,
        reason: "Connection limit reached",
      });
      const other = await connect(
        app.jwt.sign({ sub: "user-b", email: "b@example.test" }),
      );
      assert.deepEqual(other.events, [{ type: "connection.accepted" }]);
      accepted[0]!.socket.close();
      await accepted[0]!.closed;
      const replacement = await connect();
      assert.deepEqual(replacement.events, [{ type: "connection.accepted" }]);
      const stillFull = await connect();
      assert.equal((await stillFull.closed).code, 4008);
    } finally {
      const serverClosed = once(app.websocketServer, "close");
      await app.close();
      for (const socket of sockets) socket.terminate();
      await serverClosed;
    }
    assert.equal(app.websocketServer.clients.size, 0);
  },
);

test("disabled limits and separate application instances preserve independent admission", async () => {
  for (const enabled of [false, true]) {
    const app = await buildApp({
      ...options,
      websocketConnectionLimitEnabled: enabled,
    });
    try {
      for (let i = 0; i < (enabled ? 5 : 7); i++)
        assert.ok(app.realtime.addConnection("a", websocket(new Socket())));
    } finally {
      await app.close();
    }
  }
  const base = {
    DATABASE_URL: "postgres://localhost/test",
    JWT_SECRET: options.jwtSecret,
  };
  assert.equal(loadEnvironment(base).WEBSOCKET_CONNECTION_LIMIT_ENABLED, false);
  assert.equal(
    loadEnvironment({
      ...base,
      HTTP_WRITE_RATE_LIMIT_ENABLED: "false",
      WEBSOCKET_CONNECTION_LIMIT_ENABLED: "true",
    }).WEBSOCKET_CONNECTION_LIMIT_ENABLED,
    true,
  );
  assert.throws(() =>
    loadEnvironment({ ...base, WEBSOCKET_CONNECTION_LIMIT_ENABLED: "yes" }),
  );
});

test("two enabled instances do not share occupied user slots", async () => {
  const first = await buildApp({
    ...options,
    websocketConnectionLimitEnabled: true,
  });
  const second = await buildApp({
    ...options,
    websocketConnectionLimitEnabled: true,
  });
  try {
    for (let i = 0; i < 5; i++)
      assert.ok(first.realtime.addConnection("a", websocket(new Socket())));
    assert.equal(
      first.realtime.addConnection("a", websocket(new Socket())),
      null,
    );
    for (let i = 0; i < 5; i++)
      assert.ok(second.realtime.addConnection("a", websocket(new Socket())));
  } finally {
    await first.close();
    await second.close();
  }
});

test(
  "internal registration and accepted-event send failures use1011 and free all slots",
  { timeout: 5000 },
  async () => {
    for (const failure of ["registration", "send-sync", "send-callback"]) {
      const app = await buildApp({
        ...options,
        websocketConnectionLimitEnabled: true,
      });
      await app.ready();
      const token = app.jwt.sign({ sub: "a", email: "a@example.test" });
      const add = app.realtime.addConnection;
      if (failure === "registration")
        app.realtime.addConnection = () => {
          throw new Error("Injected registration failure");
        };
      else
        app.websocketServer.once("connection", (socket) => {
          Object.defineProperty(socket, "send", {
            value: (_data: unknown, callback: (error: Error) => void) => {
              if (failure === "send-sync")
                throw new Error("Injected send failure");
              callback(new Error("Injected send failure"));
            },
          });
        });
      let code = 0;
      const socket = await app.injectWS(
        "/ws",
        { headers: { "sec-websocket-protocol": `bearer, ${token}` } },
        {
          onInit(socket) {
            socket.once("close", (value) => {
              code = value;
            });
          },
        },
      );
      try {
        if (socket.readyState !== WebSocket.CLOSED) await once(socket, "close");
        assert.equal(code, 1011);
        app.realtime.addConnection = add;
        for (let i = 0; i < 5; i++)
          assert.ok(app.realtime.addConnection("a", websocket(new Socket())));
        assert.equal(
          app.realtime.addConnection("a", websocket(new Socket())),
          null,
        );
      } finally {
        socket.terminate();
        await app.close();
      }
    }
  },
);
