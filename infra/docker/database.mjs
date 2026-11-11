export function databaseUrl(input = process.env) {
  const password = input.APP_DB_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error("APP_DB_PASSWORD must contain at least 32 characters");
  }
  const url = new URL("postgresql://postgres:5432/newmessenger");
  url.username = encodeURIComponent(input.APP_DB_USER || "newmessenger");
  url.password = encodeURIComponent(password);
  url.pathname = `/${encodeURIComponent(input.POSTGRES_DB || "newmessenger")}`;
  return url.href;
}
