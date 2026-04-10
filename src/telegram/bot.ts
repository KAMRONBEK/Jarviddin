import { randomBytes } from "node:crypto";
import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import { config, isCursorConfigured } from "../config.js";
import { buildCursorAgentPrompt } from "./agentPrompt.js";
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
import { transcribeAudio } from "../integrations/whisper.js";
import { dispatchConversationalText } from "./conversational.js";
import { resolveLocale } from "../i18n/resolve.js";
import { tx } from "../i18n/messages.js";
import { whisperLanguageForLocale } from "../i18n/whisperLang.js";
import { normalizeAppLocale } from "../i18n/types.js";

function allowlistMiddleware(bot: Telegraf): void {
  bot.use(async (ctx, next) => {
    const uid = ctx.from?.id;
    if (uid === undefined) return;
    if (!config.telegram.allowedUserIds.includes(uid)) {
      await ctx.reply(tx(resolveLocale(ctx), "accessDenied"));
      return;
    }
    await next();
  });
}

export function createBot(): Telegraf {
  const bot = new Telegraf(config.telegram.token);
  allowlistMiddleware(bot);

  bot.start(async (ctx) => {
    const loc = resolveLocale(ctx);
    const gateLine = config.deepseek.apiKey.trim()
      ? tx(loc, "cmdGateDeepSeek")
      : null;
    const voiceLine = config.openai.apiKey.trim()
      ? tx(loc, "voiceLineOpenAI")
      : tx(loc, "voiceLineSetOpenAI");
    const convLine = config.deepseek.apiKey.trim()
      ? tx(loc, "convLineDeepSeek")
      : tx(loc, "convLineNoDeepSeek");
    await ctx.reply(
      [
        tx(loc, "startOrchestrator"),
        "",
        convLine,
        voiceLine,
        "",
        tx(loc, "commandsHeader"),
        tx(loc, "cmdAgentDesc"),
        tx(loc, "cmdMergeMergeMain"),
        ...(gateLine ? [gateLine] : []),
        tx(loc, "cmdRepoDesc"),
        tx(loc, "cmdStatusDesc"),
        tx(loc, "cmdTrelloDesc"),
        tx(loc, "cmdMergeprDesc"),
        tx(loc, "cmdNullclawDesc"),
        tx(loc, "cmdHelpDesc"),
      ].join("\n")
    );
  });

  bot.help((ctx) => ctx.reply(tx(resolveLocale(ctx), "helpStart")));

  bot.command("repo", async (ctx) => {
    const loc = resolveLocale(ctx);
    const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
    const parts = text.trim().split(/\s+/).slice(1);
    if (parts.length < 1) {
      await ctx.reply(tx(loc, "repoUsage"));
      return;
    }
    const repoUrl = parts[0];
    const ref = parts[1] ?? "main";
    if (!/^https:\/\/github\.com\//i.test(repoUrl)) {
      await ctx.reply(tx(loc, "repoMustBeGithub"));
      return;
    }
    upsertUserSession(ctx.from!.id, { default_repo: repoUrl, default_ref: ref });
    await ctx.reply(tx(loc, "repoDefaultSet", { repo: repoUrl, ref }));
  });

  bot.command("agent", async (ctx) => {
    const loc = resolveLocale(ctx);
    const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
    const prompt = text.replace(/^\/agent(@\S+)?\s*/i, "").trim();
    if (!prompt) {
      await ctx.reply(tx(loc, "agentUsage"));
      return;
    }
    if (config.deepseek.apiKey.trim()) {
      await runAgentWithGate(ctx, prompt, ctx.from!.id, ctx.chat!.id);
      return;
    }
    if (!isCursorConfigured()) {
      await ctx.reply(tx(loc, "agentNeedCursorKey"));
      return;
    }
    const { repository, ref } = resolveRepoForUser(ctx.from!.id);
    if (!repository) {
      await ctx.reply(tx(loc, "agentNeedRepo"));
      return;
    }
    await ctx.reply(tx(loc, "startingAgent"));
    const res = await enqueueCursorAgent({
      telegramUserId: ctx.from!.id,
      chatId: ctx.chat!.id,
      prompt: buildCursorAgentPrompt(prompt),
      repository,
      ref,
      locale: loc,
    });
    if (!res.ok) {
      await ctx.reply(`${tx(loc, "failedPrefix")} ${res.error}`);
      return;
    }
    await ctx.reply(tx(loc, "queuedJob", { jobId: res.jobId!, cursorAgentId: res.cursorAgentId! }));
  });

  bot.action(/^ac:([a-f0-9]+):(\d+)$/, async (ctx) => {
    const id = ctx.match[1];
    const idx = Number.parseInt(ctx.match[2], 10);
    if (Number.isNaN(idx)) {
      await ctx.answerCbQuery(tx(resolveLocale(ctx), "invalidOption"));
      return;
    }
    await handleAgentClarifyCallback(ctx, id, idx);
  });

  bot.action(/^ax:([a-f0-9]+)$/, async (ctx) => {
    await handleAgentClarifyCancel(ctx, ctx.match[1]);
  });

  bot.command("status", async (ctx) => {
    const loc = resolveLocale(ctx);
    const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
    const id = text.replace(/^\/status(@\S+)?\s*/i, "").trim();
    if (!id) {
      await ctx.reply(tx(loc, "statusUsage"));
      return;
    }
    const job = getJobById(id);
    if (!job) {
      await ctx.reply(tx(loc, "jobNotFound"));
      return;
    }
    await ctx.reply(formatJobStatusLine(job));
  });

  bot.command("trello", async (ctx) => {
    const loc = resolveLocale(ctx);
    const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
    const title = text.replace(/^\/trello(@\S+)?\s*/i, "").trim();
    if (!title) {
      await ctx.reply(tx(loc, "trelloUsage"));
      return;
    }
    if (!isTrelloConfigured()) {
      await ctx.reply(tx(loc, "trelloNotConfigured"));
      return;
    }
    const r = await createCard(title);
    if (!r.ok) {
      await ctx.reply(`${tx(loc, "trelloErrorPrefix")} ${r.message}`);
      return;
    }
    await ctx.reply(r.url ? `${tx(loc, "createdPrefix")} ${r.url}` : r.message);
  });

  bot.command("mergepr", async (ctx) => {
    const loc = resolveLocale(ctx);
    const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
    const numStr = text.replace(/^\/mergepr(@\S+)?\s*/i, "").trim();
    const pr = Number.parseInt(numStr, 10);
    if (Number.isNaN(pr)) {
      await ctx.reply(tx(loc, "mergeprUsage"));
      return;
    }
    if (!isGitHubConfigured()) {
      await ctx.reply(tx(loc, "mergeprGithubNotConfigured"));
      return;
    }
    const parts = resolveDefaultRepoParts();
    if (!parts) {
      await ctx.reply(tx(loc, "mergeprOwnerRepo"));
      return;
    }
    const id = randomBytes(4).toString("hex");
    insertPendingAction(id, ctx.from!.id, ctx.chat!.id, "merge_pr", JSON.stringify({ ...parts, pr, locale: loc }));
    await ctx.reply(
      tx(loc, "mergeConfirm", { pr: String(pr), owner: parts.owner, repo: parts.repo }),
      Markup.inlineKeyboard([
        Markup.button.callback(tx(loc, "confirmMerge"), `m:${id}`),
        Markup.button.callback(tx(loc, "cancel"), `x:${id}`),
      ])
    );
  });

  bot.action(/^m:([a-f0-9]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = ctx.match[1];
    const row = takePendingAction(id);
    const loc = resolveLocale(ctx);
    if (!row || row.telegram_user_id !== ctx.from?.id) {
      await ctx.editMessageText(tx(loc, "mergeInvalidExpired"));
      return;
    }
    if (row.action !== "merge_pr") {
      await ctx.editMessageText(tx(loc, "mergeUnknownAction"));
      return;
    }
    const payload = JSON.parse(row.payload) as { owner: string; repo: string; pr: number; locale?: string };
    const mloc = normalizeAppLocale(payload.locale);
    const result = await mergePullRequest(payload.owner, payload.repo, payload.pr);
    await ctx.editMessageText(
      result.ok ? result.message : `${tx(mloc, "mergeFailedPrefix")} ${result.message}`
    );
  });

  bot.action(/^x:([a-f0-9]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = ctx.match[1];
    const row = takePendingAction(id);
    const loc = row
      ? normalizeAppLocale((JSON.parse(row.payload) as { locale?: string }).locale)
      : resolveLocale(ctx);
    await ctx.editMessageText(tx(loc, "mergeCancelled"));
  });

  bot.command("nullclaw_ping", async (ctx) => {
    const loc = resolveLocale(ctx);
    const r = await notifyNullClawWorker({ event: "ping", at: new Date().toISOString() });
    await ctx.reply(r.ok ? tx(loc, "nullclawOk") : tx(loc, "nullclawSkipped", { detail: r.detail ?? "skipped" }));
  });

  bot.on("text", async (ctx) => {
    const text = ctx.message.text ?? "";
    if (text.trimStart().startsWith("/")) return;
    await dispatchConversationalText(ctx, text);
  });

  bot.on("voice", async (ctx) => {
    const loc = resolveLocale(ctx);
    if (!config.openai.apiKey.trim()) {
      await ctx.reply(tx(loc, "voiceNeedsOpenai"));
      return;
    }
    const fileId = ctx.message.voice.file_id;
    const fileUrl = await ctx.telegram.getFileLink(fileId);
    const res = await fetch(fileUrl);
    if (!res.ok) {
      await ctx.reply(tx(loc, "voiceDownloadFailed"));
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const tr = await transcribeAudio(buf, "voice.ogg", whisperLanguageForLocale(loc));
    if ("error" in tr) {
      await ctx.reply(`${tx(loc, "transcriptionFailedPrefix")} ${tr.error}`);
      return;
    }
    await dispatchConversationalText(ctx, tr.text);
  });

  bot.catch((err, ctx) => {
    console.error("Telegraf error", err);
    if (ctx) void ctx.reply(tx(resolveLocale(ctx as Context), "internalError"));
  });

  return bot;
}
