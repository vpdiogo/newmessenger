import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { WebSocket } from "ws";

import type { Message } from "../modules/messages/types.js";

declare module "fastify" {
  interface FastifyInstance {
    realtime: {
      addConnection: (userId: string, socket: WebSocket) => (() => void) | null;
      publishMessage: (userIds: string[], message: Message) => void;
    };
  }
}

type RealtimeOptions = { connectionLimitEnabled?: boolean };

const registerRealtime: FastifyPluginAsync<RealtimeOptions> = async (
  app,
  options,
) => {
  const connections = new Map<string, Set<WebSocket>>();
  let activeConnections = 0;
  let closing = false;

  function logOccupancy(): void {
    if (!options.connectionLimitEnabled) return;
    app.log.info(
      {
        category: "occupancy",
        activeConnections,
        activeUsers: connections.size,
      },
      "WebSocket occupancy changed",
    );
  }

  app.addHook("preClose", async () => {
    closing = true;
    for (const sockets of connections.values()) {
      for (const socket of sockets) socket.terminate();
    }
  });
  app.addHook("onClose", async () => {
    for (const sockets of connections.values()) sockets.clear();
    connections.clear();
    activeConnections = 0;
  });

  app.decorate("realtime", {
    addConnection(userId, socket) {
      if (closing) throw new Error("Realtime service is closing");
      const sockets = connections.get(userId) ?? new Set<WebSocket>();
      if (options.connectionLimitEnabled && sockets.size >= 5) {
        app.log.warn(
          {
            route: "/ws",
            category: "capacity",
            keyType: "authenticated-user",
            closeCode: 4008,
            activeConnections,
          },
          "WebSocket admission rejected",
        );
        return null;
      }
      if (sockets.has(socket)) throw new Error("Socket already registered");
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        if (!sockets.delete(socket)) return;
        if (connections.get(userId) !== sockets) return;
        activeConnections -= 1;
        if (sockets.size === 0) connections.delete(userId);
        logOccupancy();
      };
      sockets.add(socket);
      connections.set(userId, sockets);
      activeConnections += 1;
      try {
        socket.once("close", release);
        socket.once("error", () => {
          release();
          socket.terminate();
        });
      } catch (error) {
        release();
        throw error;
      }
      logOccupancy();
      return release;
    },
    publishMessage(userIds, message) {
      const payload = JSON.stringify({
        type: "message.created",
        data: message,
      });
      for (const userId of userIds) {
        for (const socket of connections.get(userId) ?? []) {
          if (socket.readyState !== WebSocket.OPEN) continue;
          try {
            socket.send(payload);
          } catch {
            socket.terminate();
          }
        }
      }
    },
  });
};

export const realtimePlugin = fp(registerRealtime, { name: "realtime" });
