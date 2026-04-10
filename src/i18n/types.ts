export type AppLocale = "en" | "uz" | "ru";

export function isAppLocale(s: string): s is AppLocale {
  return s === "en" || s === "uz" || s === "ru";
}

export function normalizeAppLocale(raw: string | null | undefined): AppLocale {
  if (!raw) return "en";
  const lower = raw.toLowerCase();
  if (lower.startsWith("uz")) return "uz";
  if (lower.startsWith("ru")) return "ru";
  if (isAppLocale(lower)) return lower;
  return "en";
}
