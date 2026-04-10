import { randomBytes } from "node:crypto";
import { Telegraf, Markup } from "telegraf";
import { config, isCursorConfigured } from "../config.js";
import { enqueueCursorAgent, formatJobStatusLine } from "../jobs/queue.js";
import { upsertUserSession, insertPendingAction, takePendingAction, getJobById } from "../store/db.js";
import {
  resolveRepoForUser,
  runAgentWithGate,
  handleAgentClarifyCallback,
  handleAgentClarifyCancel,
} from "./agentFlow.js";
import { mergePullRequest, isGitHubConfigured, resolveDefaultRepoParts } from "../integrations/github.js";
import { createCard, isTrelloConfigured } from "../integrations/trello.js";
import { notifyNullClawWorker } from "../integrations/nullclaw.js";

function allowlistMiddleware(bot: Telegraf): void {
  bot.use(async (ctx, next) => {
    const uid = ctx.from?.id;
    if (uid === undefined) return;
    if (!config.telegram.allowedUserIds.includes(uid)) {
      await ctx.reply("Access denied.");
      return;
    }
    await next();
  });
}

export function createBot(): Telegraf {
  const bot = new Telegraf(config.telegram.token);
  allowlistMiddleware(bot);

  bot.start(async (ctx) => {
    const gateLine = config.deepseek.apiKey.trim()
      ? "When DEEPSEEK_API_KEY is set, /agent may ask a quick question before starting the agent."
      : null;
    await ctx.reply(
      [
        "Jarviddin orchestrator.",
        "",
        "Commands:",
        "/agent <instructions> — run a Cursor Cloud Agent on your default repo",
        ...(gateLine ? [gateLine] : []),
        "/repo <https://github.com/owner/repo> [ref] — override default repo/ref",
        "/status <jobId> — show stored job row",
        "/trello <card title> — create a Trello card (if Trello env is set)",
        "/mergepr <number> — merge a PR on GitHub default owner/repo (if GitHub token set)",
        "/nullclaw_ping — POST a test payload to NULLCLAW_WEBHOOK_URL (if set)",
        "/help — this message",
      ].join("\n")
    );
  });

  bot.help((ctx) => ctx.reply("Use /start for commands."));

  bot.command("repo", async (ctx) => {
    const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
    const parts = text.trim().split(/\s+/).slice(1);
    if (parts.length < 1) {
      await ctx.reply("Usage: /repo https://github.com/owner/repo [ref]");
      return;
    }
    const repoUrl = parts[0];
    const ref = parts[1] ?? "main";
    if (!/^https:\/\/github\.com\//i.test(repoUrl)) {
      await ctx.reply("Repository must be a https://github.com/... URL.");
      return;
    }
    upsertUserSession(ctx.from!.id, { default_repo: repoUrl, default_ref: ref });
    await ctx.reply(`Default repo set to ${repoUrl} @ ${ref}`);
  });

  bot.command("agent", async (ctx) => {
    const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
    const prompt = text.replace(/^\/agent(@\S+)?\s*/i, "").trim();
    if (!prompt) {
      await ctx.reply("Usage: /agent <what the Cursor agent should do>");
      return;
    }
    if (config.deepseek.apiKey.trim()) {
      await runAgentWithGate(ctx, prompt, ctx.from!.id, ctx.chat!.id);
      return;
    }
    if (!isCursorConfigured()) {
      await ctx.reply("Set CURSOR_API_KEY to run /agent (and DEFAULT_GITHUB_REPO or /repo).");
      return;
    }
    const { repository, ref } = resolveRepoForUser(ctx.from!.id);
    if (!repository) {
      await ctx.reply("Set DEFAULT_GITHUB_REPO or use /repo first.");
      return;
    }
    await ctx.reply("Starting Cursor agent…");
    const res = await enqueueCursorAgent({
      telegramUserId: ctx.from!.id,
      chatId: ctx.chat!.id,
      prompt,
      repository,
      ref,
    });
    if (!res.ok) {
      await ctx.reply(`Failed: ${res.error}`);
      return;
    }
    await ctx.reply(`Queued.\nJob: ${res.jobId}\nCursor agent: ${res.cursorAgentId}`);
  });

  bot.action(/^ac:([a-f0-9]+):(\d+)$/, async (ctx) => {
    const id = ctx.match[1];
    const idx = Number.parseInt(ctx.match[2], 10);
    if (Number.isNaN(idx)) {
      await ctx.answerCbQuery("Invalid option.");
      return;
    }
    await handleAgentClarifyCallback(ctx, id, idx);
  });

  bot.action(/^ax:([a-f0-9]+)$/, async (ctx) => {
    await handleAgentClarifyCancel(ctx, ctx.match[1]);
  });

  bot.command("status", async (ctx) => {
    const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
    const id = text.replace(/^\/status(@\S+)?\s*/i, "").trim();
    if (!id) {
      await ctx.reply("Usage: /status <full job UUID>");
      return;
    }
    const job = getJobById(id);
    if (!job) {
      await ctx.reply("Job not found.");
      return;
    }
    await ctx.reply(formatJobStatusLine(job));
  });

  bot.command("trello", async (ctx) => {
    const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
    const title = text.replace(/^\/trello(@\S+)?\s*/i, "").trim();
    if (!title) {
      await ctx.reply("Usage: /trello <card title>");
      return;
    }
    if (!isTrelloConfigured()) {
      await ctx.reply("Trello is not configured. Set TRELLO_KEY, TRELLO_TOKEN, TRELLO_DEFAULT_LIST_ID.");
      return;
    }
    const r = await createCard(title);
    if (!r.ok) {
      await ctx.reply(`Trello error: ${r.message}`);
      return;
    }
    await ctx.reply(r.url ? `Created: ${r.url}` : r.message);
  });

  bot.command("mergepr", async (ctx) => {
    const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
    const numStr = text.replace(/^\/mergepr(@\S+)?\s*/i, "").trim();
    const pr = Number.parseInt(numStr, 10);
    if (Number.isNaN(pr)) {
      await ctx.reply("Usage: /mergepr <number>\nRequires GITHUB_TOKEN and GITHUB_DEFAULT_OWNER / GITHUB_DEFAULT_REPO.");
      return;
    }
    if (!isGitHubConfigured()) {
      await ctx.reply("GitHub merge not configured (GITHUB_TOKEN).");
      return;
    }
    const parts = resolveDefaultRepoParts();
    if (!parts) {
      await ctx.reply("Set GITHUB_DEFAULT_OWNER and GITHUB_DEFAULT_REPO for /mergepr.");
      return;
    }
    const id = randomBytes(4).toString("hex");
    insertPendingAction(id, ctx.from!.id, ctx.chat!.id, "merge_pr", JSON.stringify({ ...parts, pr }));
    await ctx.reply(
      `Merge PR #${pr} in ${parts.owner}/${parts.repo}?`,
      Markup.inlineKeyboard([
        Markup.button.callback("Confirm merge", `m:${id}`),
        Markup.button.callback("Cancel", `x:${id}`),
      ])
    );
  });

  bot.action(/^m:([a-f0-9]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = ctx.match[1];
    const row = takePendingAction(id);
    if (!row || row.telegram_user_id !== ctx.from?.id) {
      await ctx.editMessageText("Invalid or expired confirmation.");
      return;
    }
    if (row.action !== "merge_pr") {
      await ctx.editMessageText("Unknown action.");
      return;
    }
    const payload = JSON.parse(row.payload) as { owner: string; repo: string; pr: number };
    const result = await mergePullRequest(payload.owner, payload.repo, payload.pr);
    await ctx.editMessageText(result.ok ? result.message : `Merge failed: ${result.message}`);
  });

  bot.action(/^x:([a-f0-9]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = ctx.match[1];
    takePendingAction(id);
    await ctx.editMessageText("Cancelled.");
  });

  bot.command("nullclaw_ping", async (ctx) => {
    const r = await notifyNullClawWorker({ event: "ping", at: new Date().toISOString() });
    await ctx.reply(r.ok ? "NullClaw webhook OK." : `NullClaw: ${r.detail ?? "skipped"}`);
  });

  bot.catch((err, ctx) => {
    console.error("Telegraf error", err);
    void ctx?.reply?.("Internal error.");
  });

  return bot;
}
