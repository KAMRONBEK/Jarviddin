import { config } from "../config.js";

export interface GateResult {
  can_run: boolean;
  question: string | null;
  quick_replies: string[];
}

export interface GateInput {
  userPrompt: string;
  repository: string;
  ref: string;
  clarifications: string[];
}

function stripJsonFence(text: string): string {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  if (fence) return fence[1].trim();
  return t;
}

function parseGateJson(text: string): GateResult | null {
  try {
    const raw = stripJsonFence(text);
    const o = JSON.parse(raw) as Record<string, unknown>;
    const can_run = Boolean(o.can_run);
    const question = o.question == null ? null : String(o.question);
    const qr = o.quick_replies;
    const quick_replies = Array.isArray(qr)
      ? qr.map((x) => String(x).slice(0, 64)).filter(Boolean).slice(0, 4)
      : [];
    return { can_run, question, quick_replies };
  } catch {
    return null;
  }
}

/**
 * Ask DeepSeek whether we have enough context to launch a Cursor agent.
 * If DEEPSEEK_API_KEY is unset, returns can_run: true (skip gate).
 */
export async function gateAgentLaunch(input: GateInput): Promise<GateResult | { error: string }> {
  if (!config.deepseek.apiKey.trim()) {
    return { can_run: true, question: null, quick_replies: [] };
  }

  const body = {
    model: config.deepseek.model,
    messages: [
      {
        role: "system" as const,
        content: `You are a gatekeeper for a Cursor Cloud Agent that edits a GitHub repository.
Decide if the user's task has enough context to run safely.
Return ONLY a JSON object (no markdown) with this shape:
{"can_run":boolean,"question":string|null,"quick_replies":string[]}

Rules:
- If repository is missing, empty, or clearly a placeholder (e.g. your-org/your-repo), set can_run false and ask which GitHub repo to use; quick_replies 2-4 short options.
- If the task is empty or too vague for engineering work, can_run false and ask ONE clarifying question with 2-4 quick_replies.
- If information is sufficient, can_run true, question null, quick_replies [].
- quick_replies must be short button labels (under 50 chars each), max 4 items.`,
      },
      {
        role: "user" as const,
        content: JSON.stringify({
          task: input.userPrompt,
          repository: input.repository,
          ref: input.ref,
          prior_clarifications: input.clarifications,
        }),
      },
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
    const text = await res.text();
    if (!res.ok) {
      return { error: `DeepSeek HTTP ${res.status}: ${text.slice(0, 500)}` };
    }
    const data = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = parseGateJson(content);
    if (!parsed) {
      return { error: "DeepSeek returned non-JSON or invalid gate payload" };
    }
    return parsed;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
