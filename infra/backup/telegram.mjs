export function validateTelegram(env) {
  if (
    !/^\d+:[A-Za-z0-9_-]{20,}$/.test(env.TELEGRAM_BOT_TOKEN || "") ||
    !/^-?\d+$/.test(env.TELEGRAM_CHAT_ID || "")
  ) {
    throw new Error("Configure Telegram bot and numeric chat ID");
  }
}

export async function notify(env, text, request = fetch) {
  validateTelegram(env);
  const response = await request(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok || (await response.json()).ok !== true) {
    throw new Error("Telegram did not confirm delivery");
  }
}
