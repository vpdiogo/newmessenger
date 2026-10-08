import { randomUUID } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { Message } from "./types.js";

const conversationParamsSchema = z.object({ conversationId: z.uuid() });
const createMessageSchema = z.object({
  clientMessageId: z.uuid(),
  content: z.string().trim().min(1).max(2000),
});
const messageHistorySchema = z.object({
  cursor: z.uuid().optional(),
  direction: z.enum(["forward", "backward"]).default("forward"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

type MessageRow = {
  client_message_id: string;
  content: string;
  conversation_id: string;
  created_at: Date;
  id: string;
  sender_id: string;
};

function messageResponse(message: MessageRow): Message {
  return {
    clientMessageId: message.client_message_id,
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
      if (!(await isConversationMember(app, conversationId, senderId))) {
        return reply.code(404).send({ message: "Conversation not found" });
      }

      const result = await app.postgres.query<MessageRow>(
        `INSERT INTO messages (id, conversation_id, sender_id, client_message_id, content)
         SELECT $1, $2, $3, $4, $5
         ON CONFLICT (sender_id, client_message_id) DO NOTHING
         RETURNING id, conversation_id, sender_id, client_message_id, content, created_at`,
        [
          randomUUID(),
          conversationId,
          senderId,
          input.data.clientMessageId.toLowerCase(),
          input.data.content,
        ],
      );
      let message = result.rows[0];
      const isNewMessage = Boolean(message);
      if (!message) {
        const existingMessage = await app.postgres.query<MessageRow>(
          `SELECT id, conversation_id, sender_id, client_message_id, content, created_at
           FROM messages
           WHERE sender_id = $1 AND client_message_id = $2`,
          [senderId, input.data.clientMessageId.toLowerCase()],
        );
        message = existingMessage.rows[0];
      }
      if (!message) {
        return reply.code(404).send({ message: "Conversation not found" });
      }
      const response = messageResponse(message);
      if (isNewMessage) {
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
      }
      return reply.code(isNewMessage ? 201 : 200).send(response);
    },
  );

  app.get(
    "/conversations/:conversationId/messages",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = conversationParamsSchema.safeParse(request.params);
      const query = messageHistorySchema.safeParse(request.query);
      if (!params.success || !query.success) {
        return reply.code(400).send({ message: "Invalid request" });
      }

      const conversationId = params.data.conversationId.toLowerCase();
      const userId = request.user.sub.toLowerCase();
      if (!(await isConversationMember(app, conversationId, userId))) {
        return reply.code(404).send({ message: "Conversation not found" });
      }

      let cursor: Pick<MessageRow, "id"> | undefined;
      if (query.data.cursor) {
        const cursorResult = await app.postgres.query<Pick<MessageRow, "id">>(
          "SELECT id FROM messages WHERE id = $1 AND conversation_id = $2",
          [query.data.cursor.toLowerCase(), conversationId],
        );
        cursor = cursorResult.rows[0];
        if (!cursor) {
          return reply.code(400).send({ message: "Invalid request" });
        }
      }

      const backward = query.data.direction === "backward";
      const comparison = backward ? "<" : ">";
      const order = backward ? "DESC" : "ASC";
      const result = await app.postgres.query<MessageRow>(
        `SELECT id, conversation_id, sender_id, client_message_id, content, created_at
         FROM messages
         WHERE conversation_id = $1
           AND ($2::uuid IS NULL OR (created_at, id) ${comparison} (
             SELECT created_at, id FROM messages
             WHERE id = $2 AND conversation_id = $1
           ))
         ORDER BY created_at ${order}, id ${order}
         LIMIT $3`,
        [conversationId, cursor?.id ?? null, query.data.limit + 1],
      );
      const messages = result.rows.slice(0, query.data.limit);
      const nextCursor =
        result.rows.length > query.data.limit ? messages.at(-1)?.id : null;
      if (backward) messages.reverse();
      return {
        messages: messages.map(messageResponse),
        nextCursor,
      };
    },
  );
};
