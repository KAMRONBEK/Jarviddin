import { config } from "../config.js";

/**
 * Optional tone pass for terminal notices (Jarviddin — work assistant). Preserves URLs, PR links, and IDs verbatim on success.
 */
export async function wrapTerminalNotice(prefix: "Done" | "Failed", body: string): Promise<string> {
  const plain = `${prefix}\n${body}`;
  if (!config.deepseek.apiKey.trim()) return plain;

  const override = config.conversational.assistantSystemPrompt.trim();
  const system = [
    override ||
      "You rephrase short status messages for Jarviddin, the user's assistant for work: concise, professional, and calm—not theatrical or British-butler unless the user asked for that.",
    "Return ONLY the final message text. No markdown fences.",
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
    return out;
  } catch {
    return plain;
  }
}
