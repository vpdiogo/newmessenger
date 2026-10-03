import type { FastifyPluginAsync } from "fastify";

export const realtimeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/ws", { websocket: true }, (socket) => {
    socket.send(JSON.stringify({ type: "connection.accepted" }));
  });
};
