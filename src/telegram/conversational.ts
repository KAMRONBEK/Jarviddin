import type { Context } from "telegraf";
import { runAgentWithGate } from "./agentFlow.js";
import { classifyIntent } from "../llm/intent.js";

export async function dispatchConversationalText(ctx: Context, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    await ctx.reply("Send a message or use /agent <instructions>.");
    return;
  }

  const intent = await classifyIntent(trimmed);
  if (intent.mode === "chat") {
    await ctx.reply(intent.reply);
    return;
  }

  await runAgentWithGate(ctx, trimmed, ctx.from!.id, ctx.chat!.id);
}
