import { randomUUID } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";

const createConversationSchema = z
  .object({
    participantEmail: z.email().optional(),
    participantId: z.uuid().optional(),
  })
  .refine(
    ({ participantEmail, participantId }) =>
      (participantEmail === undefined) !== (participantId === undefined),
  );

type ConversationRow = {
  created_at: Date;
  id: string;
  participant_email: string;
  participant_id: string;
};

async function createDirectConversation(
  client: PoolClient,
  userId: string,
  participantId: string,
) {
  const [firstUserId, secondUserId] = [userId, participantId].sort();
  const createdConversationId = randomUUID();

  await client.query("BEGIN");
  try {
    await client.query("INSERT INTO conversations (id) VALUES ($1)", [
      createdConversationId,
    ]);
    const result = await client.query<{
      conversation_id: string;
      created: boolean;
    }>(
      `INSERT INTO direct_conversations (conversation_id, first_user_id, second_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (first_user_id, second_user_id)
       DO UPDATE SET conversation_id = direct_conversations.conversation_id
       RETURNING conversation_id, (xmax = 0) AS created`,
      [createdConversationId, firstUserId, secondUserId],
    );
    const directConversation = result.rows[0];
    if (!directConversation) throw new Error("Conversation creation failed");

    if (directConversation.created) {
      await client.query(
        "INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)",
        [directConversation.conversation_id, userId, participantId],
      );
    } else {
      await client.query("DELETE FROM conversations WHERE id = $1", [
        createdConversationId,
      ]);
    }

    await client.query("COMMIT");
    return directConversation;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export const conversationRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/conversations",
    { preHandler: [app.authenticate, app.limitHttpWrite] },
    async (request, reply) => {
      const input = createConversationSchema.safeParse(request.body);
      if (!input.success) {
        return reply.code(400).send({ message: "Invalid request" });
      }

      const userId = request.user.sub.toLowerCase();
      let participantId = input.data.participantId?.toLowerCase();
      if (input.data.participantEmail) {
        const participant = await app.postgres.query<{ id: string }>(
          "SELECT id FROM users WHERE email = $1",
          [input.data.participantEmail.toLowerCase()],
        );
        participantId = participant.rows[0]?.id;
      }

      if (!participantId) {
        return reply.code(404).send({ message: "Participant not found" });
      }

      if (participantId === userId) {
        return reply.code(400).send({ message: "Invalid request" });
      }

      const client = await app.postgres.connect();
      try {
        const conversation = await createDirectConversation(
          client,
          userId,
          participantId,
        );
        return reply.code(conversation.created ? 201 : 200).send({
          id: conversation.conversation_id,
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23503"
        ) {
          return reply.code(404).send({ message: "Participant not found" });
        }
        throw error;
      } finally {
        client.release();
      }
    },
  );

  app.get(
    "/conversations",
    { preHandler: app.authenticate },
    async (request) => {
      const result = await app.postgres.query<ConversationRow>(
        `SELECT conversations.id, conversations.created_at, users.id AS participant_id,
                users.email AS participant_email
         FROM conversation_members AS memberships
         JOIN conversations ON conversations.id = memberships.conversation_id
         JOIN conversation_members AS participants
           ON participants.conversation_id = conversations.id
           AND participants.user_id <> memberships.user_id
         JOIN users ON users.id = participants.user_id
         WHERE memberships.user_id = $1
         ORDER BY conversations.created_at DESC`,
        [request.user.sub.toLowerCase()],
      );
      return result.rows.map((conversation) => ({
        id: conversation.id,
        createdAt: conversation.created_at.toISOString(),
        participant: {
          id: conversation.participant_id,
          email: conversation.participant_email,
        },
      }));
    },
  );
};
