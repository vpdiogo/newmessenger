import { randomUUID } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { Message } from "./types.js";

const conversationParamsSchema = z.object({ conversationId: z.uuid() });
const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

type MessageRow = {
  content: string;
  conversation_id: string;
  created_at: Date;
  id: string;
  sender_id: string;
};

function messageResponse(message: MessageRow): Message {
  return {
    id: message.id,
    conversationId: message.conversation_id,
    senderId: message.sender_id,
    content: message.content,
    createdAt: message.created_at.toISOString(),
  };
}

async function isConversationMember(
  app: Parameters<FastifyPluginAsync>[0],
  conversationId: string,
  userId: string,
) {
  const result = await app.postgres.query(
    "SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2",
    [conversationId, userId],
  );
  return result.rowCount === 1;
}

export const messageRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/conversations/:conversationId/messages",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = conversationParamsSchema.safeParse(request.params);
      const input = createMessageSchema.safeParse(request.body);
      if (!params.success || !input.success) {
        return reply.code(400).send({ message: "Invalid request" });
      }

      const conversationId = params.data.conversationId.toLowerCase();
      const senderId = request.user.sub.toLowerCase();
      const result = await app.postgres.query<MessageRow>(
        `INSERT INTO messages (id, conversation_id, sender_id, content)
         SELECT $1, $2, $3, $4
         WHERE EXISTS (
           SELECT 1 FROM conversation_members
           WHERE conversation_id = $2 AND user_id = $3
         )
         RETURNING id, conversation_id, sender_id, content, created_at`,
        [randomUUID(), conversationId, senderId, input.data.content],
      );
      const message = result.rows[0];
      if (!message) {
        return reply.code(404).send({ message: "Conversation not found" });
      }
      const response = messageResponse(message);
      try {
        const members = await app.postgres.query<{ user_id: string }>(
          "SELECT user_id FROM conversation_members WHERE conversation_id = $1",
          [conversationId],
        );
        app.realtime.publishMessage(
          members.rows.map((member) => member.user_id),
          response,
        );
      } catch (error) {
        app.log.error(
          { err: error, conversationId, messageId: response.id },
          "Unable to publish message.created",
        );
      }
      return reply.code(201).send(response);
    },
  );

  app.get(
    "/conversations/:conversationId/messages",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = conversationParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ message: "Invalid request" });
      }

      const conversationId = params.data.conversationId.toLowerCase();
      const userId = request.user.sub.toLowerCase();
      if (!(await isConversationMember(app, conversationId, userId))) {
        return reply.code(404).send({ message: "Conversation not found" });
      }

      const result = await app.postgres.query<MessageRow>(
        `SELECT id, conversation_id, sender_id, content, created_at
         FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC, id ASC`,
        [conversationId],
      );
      return result.rows.map(messageResponse);
    },
  );
};
