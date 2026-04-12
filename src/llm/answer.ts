import { config } from "../config.js";
import { tx } from "../i18n/messages.js";
import type { AppLocale } from "../i18n/types.js";
import { GENERAL_REPLY_LANGUAGE_POLICY, replyUsesDisallowedScript } from "./languagePolicy.js";

function answerLocaleLine(locale: AppLocale): string {
  if (locale === "uz") {
    return "Answer in Uzbek (Latin or Cyrillic) when appropriate. Keep the tone concise, helpful, and professional.";
  }
  if (locale === "ru") {
    return "Answer in Russian. Keep the tone concise, helpful, and professional.";
  }
  return "Answer in English. Keep the tone concise, helpful, and professional.";
}

export async function answerConversationally(userText: string, locale: AppLocale): Promise<string> {
  if (!config.deepseek.apiKey.trim()) {
    return tx(locale, "inlineAnswerNeedsLlm");
  }

  const override = config.conversational.assistantSystemPrompt.trim();
  const system = [
    override ||
      [
        "You are Jarviddin, the user's assistant for work.",
        "Answer the user's message directly in chat.",
        "For factual or general questions, answer inline instead of suggesting repository actions.",
        "Do not claim you changed code, inspected the repo, or ran tools unless that actually happened in this chat.",
      ].join(" "),
    answerLocaleLine(locale),
    GENERAL_REPLY_LANGUAGE_POLICY,
    "Return ONLY the final answer text. No markdown fences.",
  ].join("\n");

  const body = {
    model: config.deepseek.model,
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: userText },
    ],
    temperature: 0.2,
    max_tokens: 800,
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
    if (!res.ok) return tx(locale, "inlineAnswerFailed");
    const data = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const out = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!out || replyUsesDisallowedScript(out)) {
      return tx(locale, "inlineAnswerFailed");
    }
    return out;
  } catch {
    return tx(locale, "inlineAnswerFailed");
  }
}
