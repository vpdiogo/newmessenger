export function up(pgm) {
  pgm.createTable("conversations", {
    id: { type: "uuid", primaryKey: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.createTable("direct_conversations", {
    conversation_id: {
      type: "uuid",
      primaryKey: true,
      references: "conversations(id)",
      onDelete: "cascade",
    },
    first_user_id: {
      type: "uuid",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade",
    },
    second_user_id: {
      type: "uuid",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade",
    },
  });
  pgm.addConstraint(
    "direct_conversations",
    "direct_conversations_unique_pair",
    {
      unique: ["first_user_id", "second_user_id"],
    },
  );
  pgm.addConstraint(
    "direct_conversations",
    "direct_conversations_ordered_pair",
    { check: "first_user_id < second_user_id" },
  );

  pgm.createTable("conversation_members", {
    conversation_id: {
      type: "uuid",
      notNull: true,
      references: "conversations(id)",
      onDelete: "cascade",
    },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade",
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.addConstraint(
    "conversation_members",
    "conversation_members_primary_key",
    {
      primaryKey: ["conversation_id", "user_id"],
    },
  );
  pgm.createIndex("conversation_members", "user_id");
}

export function down(pgm) {
  pgm.dropTable("conversation_members");
  pgm.dropTable("direct_conversations");
  pgm.dropTable("conversations");
}
