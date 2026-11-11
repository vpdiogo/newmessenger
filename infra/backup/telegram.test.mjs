import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { notify } from "./telegram.mjs";

const env = {
  TELEGRAM_BOT_TOKEN: "123456:" + "a".repeat(35),
  TELEGRAM_CHAT_ID: "-123456",
};

test("Telegram payload targets only configured chat; API rejection fails delivery", async (t) => {
  let received;
  let ok = true;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    received = JSON.parse(body);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const request = (url, options) => {
    assert(url.startsWith("https://api.telegram.org/bot"));
    assert(options.signal);
    return fetch(`http://127.0.0.1:${server.address().port}/fixture`, options);
  };
  await notify(env, "Local transport test", request);
  assert.deepEqual(received, {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: "Local transport test",
  });
  ok = false;
  await assert.rejects(notify(env, "Rejected delivery", request));
  await assert.rejects(
    notify(env, "HTTP failure", async () => ({ ok: false })),
  );
});

test(
  "Telegram hanging transport is aborted within the configured timeout",
  { timeout: 12_000 },
  async () => {
    const start = Date.now();
    await assert.rejects(
      notify(
        env,
        "No real Telegram request",
        (url, options) =>
          new Promise((resolve, reject) => {
            options.signal.addEventListener("abort", () =>
              reject(new Error("Local simulated timeout")),
            );
            // Keep the test alive until AbortSignal.timeout fires (its timer is unref'ed).
            const timer = setTimeout(() => resolve({ ok: false }), 11_000);
            options.signal.addEventListener("abort", () => clearTimeout(timer));
          }),
      ),
    );
    assert(Date.now() - start < 11_000);
  },
);
