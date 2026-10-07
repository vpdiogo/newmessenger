export function up(pgm) {
  pgm.createTable("messages", {
    id: { type: "uuid", primaryKey: true },
    conversation_id: {
      type: "uuid",
      notNull: true,
      references: "conversations(id)",
      onDelete: "cascade",
    },
    sender_id: {
      type: "uuid",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade",
    },
    content: { type: "text", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.createIndex("messages", [
    "conversation_id",
    { name: "created_at", sort: "ASC" },
    "id",
  ]);
}

export function down(pgm) {
  pgm.dropTable("messages");
}
