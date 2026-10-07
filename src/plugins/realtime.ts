import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { WebSocket } from "ws";

import type { Message } from "../modules/messages/types.js";

declare module "fastify" {
  interface FastifyInstance {
    realtime: {
      addConnection: (userId: string, socket: WebSocket) => void;
      publishMessage: (userIds: string[], message: Message) => void;
    };
  }
}

const registerRealtime: FastifyPluginAsync = async (app) => {
  const connections = new Map<string, Set<WebSocket>>();

  app.decorate("realtime", {
    addConnection(userId, socket) {
      const sockets = connections.get(userId) ?? new Set<WebSocket>();
      sockets.add(socket);
      connections.set(userId, sockets);

      socket.on("close", () => {
        sockets.delete(socket);
        if (sockets.size === 0) connections.delete(userId);
      });
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
