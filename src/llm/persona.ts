import { config } from "../config.js";
import { strings } from "../i18n/messages.js";
import type { AppLocale } from "../i18n/types.js";
import { PERSONA_OUTPUT_LANGUAGE_POLICY, replyUsesDisallowedScript } from "./languagePolicy.js";

function personaLocaleLine(locale: AppLocale): string {
  if (locale === "uz") {
    return "Rephrase in Uzbek (Latin or Cyrillic) when appropriate; concise, professional, calm.";
  }
  if (locale === "ru") {
    return "Rephrase in Russian; concise, professional, calm.";
  }
  return "Rephrase in English; concise, professional, calm—not theatrical unless the user asked for that.";
}

/**
 * Optional tone pass for terminal notices (Jarviddin — work assistant). Preserves URLs, PR links, and IDs verbatim on success.
 */
export async function wrapTerminalNotice(
  kind: "completed" | "failed",
  body: string,
  locale: AppLocale
): Promise<string> {
  const m = strings(locale);
  const prefix = kind === "completed" ? m.terminalDone : m.terminalFailed;
  const plain = `${prefix}\n${body}`;
  if (!config.deepseek.apiKey.trim()) return plain;

  const override = config.conversational.assistantSystemPrompt.trim();
  const system = [
    override ||
      [
        "You rephrase short status messages for Jarviddin, the user's assistant for work.",
        personaLocaleLine(locale),
      ].join(" "),
    "Return ONLY the final message text. No markdown fences.",
    PERSONA_OUTPUT_LANGUAGE_POLICY,
    "Preserve every URL, PR link, UUID, job id, and path exactly as given — do not shorten or reformat them.",
  ].join("\n");

  const bodyText = {
    model: config.deepseek.model,
    messages: [
      { role: "system" as const, content: system },
      {
        role: "user" as const,
        content: `Rewrite this status for the user. Keep all links and identifiers verbatim:\n\n${plain}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 600,
  };

  try {
    const res = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.deepseek.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyText),
    });
    const raw = await res.text();
    if (!res.ok) return plain;
    const data = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const out = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!out) return plain;
    if (replyUsesDisallowedScript(out)) return plain;
    return out;
  } catch {
    return plain;
  }
}
