/**
 * Jarviddin must not reply in Urdu, Arabic script, Persian, Hindi, etc.
 * Uzbek may be Latin or Cyrillic; Russian uses Cyrillic; English uses Latin.
 */

export const GENERAL_REPLY_LANGUAGE_POLICY =
  "Use only English, Russian, or Uzbek (Latin or Cyrillic). Never Urdu, Arabic script, Persian, Hindi, or other scripts.";

/** Appended to intent classifier system prompt (always). */
export const CHAT_REPLY_LANGUAGE_POLICY = [
  "Language policy (mandatory for mode=chat): reply text MUST use only one of: English, Russian (Cyrillic), or Uzbek (Latin or Cyrillic).",
  "Never use Urdu, Arabic script, Persian/Farsi, Hindi, or any other language or script.",
  'Greetings such as "assalomu alaykum" / "salom" must be answered in Uzbek Latin, Russian, or English to match the user locale — never Urdu or Arabic script.',
].join(" ");

/** Gate: questions and buttons in allowed languages only. */
export const GATE_OUTPUT_LANGUAGE_POLICY =
  `${GENERAL_REPLY_LANGUAGE_POLICY} Use that policy for question and quick_replies.`;

/** Persona / terminal notice rephrasing. */
export const PERSONA_OUTPUT_LANGUAGE_POLICY = GENERAL_REPLY_LANGUAGE_POLICY;

/** Arabic / Arabic Presentation / Urdu range + Devanagari (Hindi). */
const DISALLOWED_REPLY_SCRIPTS = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0900-\u097F]/;

export function replyUsesDisallowedScript(text: string): boolean {
  return DISALLOWED_REPLY_SCRIPTS.test(text);
}
