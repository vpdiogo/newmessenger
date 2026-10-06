export function up(pgm) {
  pgm.createTable("users", {
    id: { type: "uuid", primaryKey: true },
    email: { type: "varchar(320)", notNull: true, unique: true },
    password_hash: { type: "text", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
}

export function down(pgm) {
  pgm.dropTable("users");
}
