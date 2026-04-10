import { randomBytes } from "node:crypto";
import { Markup } from "telegraf";
import type { Context } from "telegraf";
import { config, isCursorConfigured } from "../config.js";
import { buildCursorAgentPrompt, parseMergeMainKeyword } from "./agentPrompt.js";
import { gateAgentLaunch } from "../llm/deepseek.js";
import { enqueueCursorAgent } from "../jobs/queue.js";
import { resolveLocale } from "../i18n/resolve.js";
import { tx } from "../i18n/messages.js";
import type { AppLocale } from "../i18n/types.js";
import {
  insertPendingAction,
  getPendingAction,
  deletePendingAction,
  getUserSession,
} from "../store/db.js";

export interface ClarifyPayload {
  draftPrompt: string;
  repository: string;
  ref: string;
  clarifications: string[];
  depth: number;
  /** Present on new pending actions; older payloads fall back to ctx locale. */
  locale?: AppLocale;
}

export function resolveRepoForUser(telegramUserId: number): { repository: string; ref: string } {
  const s = getUserSession(telegramUserId);
  const repo = s?.default_repo || config.cursor.defaultRepo;
  const ref = s?.default_ref || config.cursor.defaultRef;
  return { repository: repo, ref };
}

function buildFinalPrompt(draft: string, clarifications: string[]): string {
  if (clarifications.length === 0) return draft;
  return `${draft}\n\n--- Clarifications ---\n${clarifications.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;
}

async function enqueueAndReply(
  ctx: Context,
  draftPrompt: string,
  telegramUserId: number,
  chatId: number,
  repository: string,
  ref: string,
  clarifications: string[],
  locale: AppLocale
): Promise<void> {
  if (!isCursorConfigured()) {
    await ctx.reply(tx(locale, "needCursorKey"));
    return;
  }
  const finalPrompt = buildCursorAgentPrompt(buildFinalPrompt(draftPrompt, clarifications));
  await ctx.reply(tx(locale, "startingAgent"));
  const res = await enqueueCursorAgent({
    telegramUserId,
    chatId,
    prompt: finalPrompt,
    repository,
    ref,
    locale,
  });
  if (!res.ok) {
    await ctx.reply(`${tx(locale, "failedPrefix")} ${res.error}`);
    return;
  }
  await ctx.reply(
    tx(locale, "queuedJob", { jobId: res.jobId!, cursorAgentId: res.cursorAgentId! })
  );
}

/**
 * Run DeepSeek gate then either enqueue or show blocking question + quick-reply.
 * Pass `lockedRepo` when continuing a clarify flow so repo/ref stay stable.
 */
export async function runAgentWithGate(
  ctx: Context,
  draftPrompt: string,
  telegramUserId: number,
  chatId: number,
  clarifications: string[] = [],
  depth = 0,
  lockedRepo?: { repository: string; ref: string },
  fixedLocale?: AppLocale
): Promise<void> {
  const locale = fixedLocale ?? resolveLocale(ctx);
  if (!isCursorConfigured()) {
    await ctx.reply(tx(locale, "agentNeedCursorKey"));
    return;
  }
  const { repository, ref } = lockedRepo ?? resolveRepoForUser(telegramUserId);
  if (!repository) {
    await ctx.reply(tx(locale, "agentNeedRepo"));
    return;
  }

  const { prompt: gatePrompt } = parseMergeMainKeyword(draftPrompt);
  const gate = await gateAgentLaunch({
    userPrompt: gatePrompt,
    repository,
    ref,
    clarifications,
    locale,
  });

  if ("error" in gate) {
    await ctx.reply(
      `${tx(locale, "gateWarningPrefix")} ${gate.error}\n${tx(locale, "gateWarningStarting")}`
    );
    await enqueueAndReply(ctx, draftPrompt, telegramUserId, chatId, repository, ref, clarifications, locale);
    return;
  }

  if (gate.can_run) {
    await enqueueAndReply(ctx, draftPrompt, telegramUserId, chatId, repository, ref, clarifications, locale);
    return;
  }

  if (depth >= config.deepseek.maxClarifyRounds) {
    await ctx.reply(tx(locale, "maxClarifyRounds", { n: config.deepseek.maxClarifyRounds }));
    await enqueueAndReply(ctx, draftPrompt, telegramUserId, chatId, repository, ref, clarifications, locale);
    return;
  }

  if (!gate.question || gate.quick_replies.length === 0) {
    await ctx.reply(gate.question ?? tx(locale, "addMoreDetail"));
    return;
  }

  const id = randomBytes(4).toString("hex");
  const payload: ClarifyPayload & { quick_replies: string[] } = {
    draftPrompt,
    repository,
    ref,
    clarifications,
    depth,
    locale,
    quick_replies: gate.quick_replies,
  };
  insertPendingAction(id, telegramUserId, chatId, "agent_clarify", JSON.stringify(payload));

  const rows = [
    gate.quick_replies.map((label, i) => Markup.button.callback(label.slice(0, 64), `ac:${id}:${i}`)),
    [Markup.button.callback(tx(locale, "cancel"), `ax:${id}`)],
  ];

  const text = `${gate.question}\n\n${tx(locale, "clarifyFooter")}`;
  if (ctx.callbackQuery?.message && "message_id" in ctx.callbackQuery.message) {
    await ctx.editMessageText(text, Markup.inlineKeyboard(rows));
  } else {
    await ctx.reply(text, Markup.inlineKeyboard(rows));
  }
}

export async function handleAgentClarifyCallback(ctx: Context, pendingId: string, optionIndex: number): Promise<void> {
  const row = getPendingAction(pendingId);
  if (!row || row.telegram_user_id !== ctx.from?.id || row.action !== "agent_clarify") {
    const loc = resolveLocale(ctx);
    await ctx.answerCbQuery(tx(loc, "invalidOrExpiredCb"));
    try {
      await ctx.editMessageText(tx(loc, "expiredPrompt"));
    } catch {
      /* ignore */
    }
    return;
  }

  const payload = JSON.parse(row.payload) as ClarifyPayload & { quick_replies: string[] };
  const label = payload.quick_replies[optionIndex];
  if (label == null) {
    await ctx.answerCbQuery(tx(payload.locale ?? resolveLocale(ctx), "invalidOption"));
    return;
  }

  await ctx.answerCbQuery();
  deletePendingAction(pendingId);

  const nextClarifications = [...payload.clarifications, `User chose: ${label}`];
  await runAgentWithGate(
    ctx,
    payload.draftPrompt,
    row.telegram_user_id,
    row.chat_id,
    nextClarifications,
    payload.depth + 1,
    { repository: payload.repository, ref: payload.ref },
    payload.locale ?? resolveLocale(ctx)
  );
}

export async function handleAgentClarifyCancel(ctx: Context, pendingId: string): Promise<void> {
  const row = getPendingAction(pendingId);
  if (!row || row.telegram_user_id !== ctx.from?.id || row.action !== "agent_clarify") {
    const loc = resolveLocale(ctx);
    await ctx.answerCbQuery(tx(loc, "invalidOrExpiredCb"));
    try {
      await ctx.editMessageText(tx(loc, "expiredPrompt"));
    } catch {
      /* ignore */
    }
    return;
  }
  const payload = JSON.parse(row.payload) as ClarifyPayload & { quick_replies: string[] };
  const loc = payload.locale ?? resolveLocale(ctx);
  await ctx.answerCbQuery();
  deletePendingAction(pendingId);
  try {
    await ctx.editMessageText(tx(loc, "mergeCancelled"));
  } catch {
    await ctx.reply(tx(loc, "mergeCancelled"));
  }
}
