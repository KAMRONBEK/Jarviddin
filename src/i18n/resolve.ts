import type { Context } from "telegraf";
import { config } from "../config.js";
import type { AppLocale } from "./types.js";
import { normalizeAppLocale } from "./types.js";

/**
 * Telegram `language_code` (e.g. ru, ru-RU, uz) → AppLocale, else BOT_DEFAULT_LOCALE, else en.
 */
export function resolveLocale(ctx: Context): AppLocale {
  const code = ctx.from?.language_code;
  if (code) return normalizeAppLocale(code);
  return config.bot.defaultLocale;
}
