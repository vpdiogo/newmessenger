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
    let userId: string;
    try {
      const user = app.jwt.verify<{ sub: string }>(token);
      userId = user.sub.toLowerCase();
    } catch {
      socket.close(1008, "Unauthorized");
      return;
    }

    let release: (() => void) | null = null;
    try {
      release = app.realtime.addConnection(userId, socket);
      if (!release) {
        socket.close(4008, "Connection limit reached");
        return;
      }
      socket.send(JSON.stringify({ type: "connection.accepted" }), (error) => {
        if (!error) return;
        release?.();
        socket.close(1011, "Connection unavailable");
        request.log.error(
          { category: "acceptance-send" },
          "Unable to accept WebSocket connection",
        );
      });
    } catch {
      release?.();
      request.log.error(
        { category: "registration" },
        "Unable to register WebSocket connection",
      );
      socket.close(1011, "Connection unavailable");
    }
  });
};
