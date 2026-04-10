import { config } from "../config.js";
import { stripJsonFence } from "./jsonText.js";

export type IntentResult = { mode: "chat"; reply: string } | { mode: "agent" };

function heuristicIntentWithoutLLM(text: string): IntentResult {
  if (config.conversational.defaultToAgentWhenDeepSeekUnset) {
    return { mode: "agent" };
  }
  const t = text.trim();
  const codingLike = /\b(fix|bug|implement|refactor|pr|merge|repo|branch|commit|error|test|add|remove|update|cursor|github|feature|build|deploy)\b/i.test(
    t
  );
  if (codingLike || t.length > 120) {
    return { mode: "agent" };
  }
  const lower = t.toLowerCase();
  const shortGreeting = /^(hi|hello|hey|thanks|thank you|ok|okay|bye|good morning|good night)[\s!.]*$/i.test(
    lower
  );
  if (shortGreeting || (t.length < 48 && !codingLike)) {
    return {
      mode: "chat",
      reply:
        "I'm Jarviddin, your assistant for work. How may I help? For repo or Cursor tasks, say what you need or use /agent.",
    };
  }
  return { mode: "agent" };
}

function parseIntentJson(text: string): IntentResult | null {
  try {
    const raw = stripJsonFence(text);
    const o = JSON.parse(raw) as Record<string, unknown>;
    const mode = o.mode === "chat" ? "chat" : o.mode === "agent" ? "agent" : null;
    if (!mode) return null;
    if (mode === "chat") {
      const reply = o.reply == null ? "" : String(o.reply).trim();
      if (!reply) return null;
      return { mode: "chat", reply };
    }
    return { mode: "agent" };
  } catch {
    return null;
  }
}

export async function classifyIntent(userText: string): Promise<IntentResult> {
  if (!config.deepseek.apiKey.trim()) {
    return heuristicIntentWithoutLLM(userText);
  }

  const override = config.conversational.assistantSystemPrompt.trim();
  const system = [
    override ||
      [
        "You classify Telegram messages for Jarviddin, the user's assistant for work.",
        "Jarviddin helps with Cursor agents, GitHub repositories, and general work questions—not a generic assistant named Jarvis or anything else.",
      ].join(" "),
    'Return ONLY JSON (no markdown): {"mode":"chat"|"agent","reply":string|null}',
    "If mode is chat, reply must be a short, warm, professional message (non-empty) in the same language as the user when possible.",
    "In chat replies, the assistant is always Jarviddin. Never call yourself Jarvis or another name.",
    "If mode is agent, reply must be null.",
    "Use agent for engineering tasks, repo changes, bugs, features, refactors, merges; chat for greetings and small talk only.",
  ].join("\n");

  const body = {
    model: config.deepseek.model,
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: userText },
    ],
    temperature: 0.2,
    max_tokens: 400,
  };

  try {
    const res = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.deepseek.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    if (!res.ok) {
      return heuristicIntentWithoutLLM(userText);
    }
    const data = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = parseIntentJson(content);
    if (!parsed) return heuristicIntentWithoutLLM(userText);
    return parsed;
  } catch {
    return heuristicIntentWithoutLLM(userText);
  }
}
