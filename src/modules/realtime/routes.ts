import type { FastifyPluginAsync } from "fastify";

function websocketToken(protocol: string | undefined) {
  const [scheme, token] =
    protocol?.split(",").map((value) => value.trim()) ?? [];
  return scheme === "bearer" && token ? token : null;
}

export const realtimeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/ws", { websocket: true }, (socket, request) => {
    const token = websocketToken(request.headers["sec-websocket-protocol"]);
    if (!token) {
      socket.close(1008, "Unauthorized");
      return;
    }

    try {
      const user = app.jwt.verify<{ sub: string }>(token);
      app.realtime.addConnection(user.sub.toLowerCase(), socket);
      socket.send(JSON.stringify({ type: "connection.accepted" }));
    } catch {
      socket.close(1008, "Unauthorized");
    }
  });
};
