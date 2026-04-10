import type { AppLocale } from "./types.js";

/** Whisper `language` param; omit for auto-detect. */
export function whisperLanguageForLocale(locale: AppLocale): string | undefined {
  if (locale === "uz") return "uz";
  if (locale === "ru") return "ru";
  return undefined;
}
