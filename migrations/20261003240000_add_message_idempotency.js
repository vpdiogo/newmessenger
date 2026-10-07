export function up(pgm) {
  pgm.addColumn("messages", {
    client_message_id: { type: "uuid" },
  });
  pgm.sql(
    "UPDATE messages SET client_message_id = id WHERE client_message_id IS NULL",
  );
  pgm.alterColumn("messages", "client_message_id", { notNull: true });
  pgm.addConstraint("messages", "messages_unique_sender_client_message_id", {
    unique: ["sender_id", "client_message_id"],
  });
}

export function down(pgm) {
  pgm.dropConstraint("messages", "messages_unique_sender_client_message_id");
  pgm.dropColumn("messages", "client_message_id");
}
