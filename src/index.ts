import type { Update } from "telegraf/types";
import Fastify from "fastify";
import { validateConfig, config, isCursorConfigured } from "./config.js";
import { createBot } from "./telegram/bot.js";
import { startAgentPoller } from "./jobs/poller.js";

const errors = validateConfig();
if (errors.length > 0) {
  console.error("Configuration errors:\n", errors.join("\n"));
  process.exit(1);
}

const bot = createBot();
if (isCursorConfigured()) {
  startAgentPoller(bot);
}

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true, service: "jarviddin-orchestrator" }));

if (!config.telegram.usePolling) {
  app.post("/webhook/telegram", async (request, reply) => {
    const secret = request.headers["x-telegram-bot-api-secret-token"];
    if (secret !== config.telegram.webhookSecret) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    await bot.handleUpdate(request.body as Update);
    return reply.send({ ok: true });
  });
}

const port = config.port;
const host = "0.0.0.0";

await app.listen({ port, host });

if (config.telegram.usePolling) {
  await bot.launch();
  app.log.info(
    "Telegram: long polling — no HTTPS, domain, or setWebhook. Talk to the bot in Telegram; POST /webhook/telegram is not used.",
  );
  const shutdown = async (signal: string) => {
    await bot.stop(signal);
    await app.close();
  };
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
} else if (config.publicBaseUrl) {
  app.log.info(`Telegram webhook URL (setWebhook): ${config.publicBaseUrl}/webhook/telegram`);
} else {
  app.log.warn(
    "Telegram: webhook mode but PUBLIC_BASE_URL is empty — set it to your public HTTPS base URL for setWebhook.",
  );
}
