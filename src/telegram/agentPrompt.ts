import { config } from "../config.js";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * If any configured phrase appears anywhere in the message (case-insensitive), strip those phrases
 * and return mergeMain so we can append Cursor merge instructions. Works for future voice transcripts too.
 */
export function parseMergeMainKeyword(
  raw: string,
  phrases: readonly string[] = config.agent.mergeMainPhrases,
): { prompt: string; mergeMain: boolean } {
  const list = [...phrases].filter((p) => p.length > 0).sort((a, b) => b.length - a.length);
  if (list.length === 0) return { prompt: raw.trim(), mergeMain: false };

  let mergeMain = false;
  let prompt = raw;

  for (const phrase of list) {
    const re = new RegExp(escapeRegex(phrase), "gi");
    const next = prompt.replace(re, " ");
    if (next !== prompt) {
      mergeMain = true;
      prompt = next;
    }
  }

  prompt = prompt.replace(/\s+/g, " ").trim();
  return { prompt, mergeMain };
}

export function appendMergeMainInstruction(prompt: string): string {
  return `${prompt}\n\n---\n[Jarviddin] After you open a pull request for this work, merge it into the default branch (main) on GitHub. Use GitHub's merge action on that PR. Do not leave the PR open only unless merge is blocked (conflicts, permissions, or branch protection)—then explain what blocked you.`;
}

/** Full pipeline for text sent to Cursor API. */
export function buildCursorAgentPrompt(raw: string): string {
  const { prompt, mergeMain } = parseMergeMainKeyword(raw);
  return mergeMain ? appendMergeMainInstruction(prompt) : prompt;
}
