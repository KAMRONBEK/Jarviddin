import type { Context } from "telegraf";
import { runAgentWithGate } from "./agentFlow.js";
import { answerConversationally } from "../llm/answer.js";
import { classifyIntent } from "../llm/intent.js";
import { resolveLocale } from "../i18n/resolve.js";
import { tx } from "../i18n/messages.js";

export async function dispatchConversationalText(ctx: Context, text: string): Promise<void> {
  const locale = resolveLocale(ctx);
  const trimmed = text.trim();
  if (!trimmed) {
    await ctx.reply(tx(locale, "emptyConversational"));
    return;
  }

  const intent = await classifyIntent(trimmed, locale);
  if (intent.mode === "chat") {
    await ctx.reply(intent.reply);
    return;
  }
  if (intent.mode === "answer") {
    await ctx.reply(await answerConversationally(trimmed, locale));
    return;
  }

  await runAgentWithGate(ctx, trimmed, ctx.from!.id, ctx.chat!.id);
}
