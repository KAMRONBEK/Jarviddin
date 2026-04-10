import "dotenv/config";
import type { AppLocale } from "./i18n/types.js";

function parseAppLocale(raw: string | undefined): AppLocale {
  if (!raw?.trim()) return "en";
  const v = raw.toLowerCase().trim();
  if (v === "uz" || v === "ru" || v === "en") return v;
  return "en";
}

function parseBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw === "") return undefined;
  const v = raw.toLowerCase().trim();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return undefined;
}

function parseIds(raw: string | undefined): number[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
}

/** Laptop-only: skip Cursor + default repo validation; default Telegram mode is polling when TELEGRAM_USE_POLLING is unset. */
const localDev = parseBool(process.env.LOCAL_DEV) === true;
/** Long polling: no HTTPS webhook, no PUBLIC_BASE_URL. If TELEGRAM_USE_POLLING is unset, defaults to true when LOCAL_DEV. */
const telegramUsePolling =
  process.env.TELEGRAM_USE_POLLING !== undefined
    ? parseBool(process.env.TELEGRAM_USE_POLLING) === true
    : localDev;

export const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV ?? "development",
  publicBaseUrl: process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "",
  localDev,

  /** When Telegram does not send language_code, use this for UI strings (en | uz | ru). */
  bot: {
    defaultLocale: parseAppLocale(process.env.BOT_DEFAULT_LOCALE),
  },

  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN ?? "",
    allowedUserIds: parseIds(process.env.TELEGRAM_ALLOWED_USER_IDS),
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
    usePolling: telegramUsePolling,
  },

  cursor: {
    apiKey: process.env.CURSOR_API_KEY ?? "",
    apiBase: (process.env.CURSOR_API_BASE ?? "https://api.cursor.com").replace(/\/$/, ""),
    defaultRepo: process.env.DEFAULT_GITHUB_REPO ?? "",
    defaultRef: process.env.DEFAULT_GIT_REF ?? "main",
    maxConcurrentAgents: Math.max(1, Number(process.env.CURSOR_MAX_CONCURRENT_AGENTS) || 2),
    pollIntervalMs: Math.max(3000, Number(process.env.CURSOR_POLL_INTERVAL_MS) || 15_000),
    pollMaxMinutes: Math.max(1, Number(process.env.CURSOR_POLL_MAX_MINUTES) || 120),
  },

  databaseUrl: process.env.DATABASE_URL ?? "",
  sqlitePath: process.env.SQLITE_PATH ?? "./data/orchestrator.db",

  trello: {
    key: process.env.TRELLO_KEY ?? "",
    token: process.env.TRELLO_TOKEN ?? "",
    defaultListId: process.env.TRELLO_DEFAULT_LIST_ID ?? "",
  },

  github: {
    token: process.env.GITHUB_TOKEN ?? "",
    defaultOwner: process.env.GITHUB_DEFAULT_OWNER ?? "",
    defaultRepo: process.env.GITHUB_DEFAULT_REPO ?? "",
  },

  nullclaw: {
    webhookUrl: process.env.NULLCLAW_WEBHOOK_URL ?? "",
  },

  /**
   * Comma-separated phrases; if any appear anywhere in /agent text (case-insensitive), merge-to-main instructions are appended.
   */
  agent: {
    mergeMainPhrases: (process.env.AGENT_MERGE_MAIN_KEYWORD ?? "merge to main")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },

  /** Optional: DeepSeek gate before starting Cursor agent (blocking questions + quick-reply). */
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
    baseUrl: (process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com").replace(/\/$/, ""),
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    maxClarifyRounds: Math.max(1, Math.min(10, Number(process.env.DEEPSEEK_MAX_CLARIFY_ROUNDS) || 3)),
  },

  /** OpenAI: Whisper STT only (optional; voice messages disabled if unset). */
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    apiBase: (process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, ""),
  },

  /**
   * Conversational messages (non-command text / voice): intent when DEEPSEEK_API_KEY is unset.
   * If false, short/greeting-style messages use a canned chat reply; coding-like text routes to agent.
   */
  conversational: {
    defaultToAgentWhenDeepSeekUnset: parseBool(process.env.CONVERSATIONAL_DEFAULT_AGENT) ?? false,
    assistantSystemPrompt: process.env.ASSISTANT_SYSTEM_PROMPT ?? "",
  },
};

/** True when Cursor API calls can be made (poller + /agent). Default repo is validated separately for non-local. */
export function isCursorConfigured(): boolean {
  return Boolean(config.cursor.apiKey.trim());
}

export function validateConfig(): string[] {
  const errors: string[] = [];
  if (!config.telegram.token) errors.push("TELEGRAM_BOT_TOKEN is required");
  if (config.telegram.allowedUserIds.length === 0) {
    errors.push("TELEGRAM_ALLOWED_USER_IDS must list at least one Telegram user id");
  }
  if (!config.telegram.usePolling) {
    if (!config.telegram.webhookSecret || config.telegram.webhookSecret.length < 8) {
      errors.push(
        "TELEGRAM_WEBHOOK_SECRET must be set (min 8 chars) for webhook mode, or enable TELEGRAM_USE_POLLING / LOCAL_DEV for long polling",
      );
    }
  } else if (config.telegram.webhookSecret && config.telegram.webhookSecret.length < 8) {
    errors.push("TELEGRAM_WEBHOOK_SECRET must be at least 8 characters if set");
  }
  if (!config.localDev) {
    if (!config.cursor.apiKey) errors.push("CURSOR_API_KEY is required");
    if (!config.cursor.defaultRepo) errors.push("DEFAULT_GITHUB_REPO is required");
  }
  return errors;
}
