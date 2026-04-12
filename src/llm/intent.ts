import { config } from "../config.js";
import { stripJsonFence } from "./jsonText.js";
import type { AppLocale } from "../i18n/types.js";
import { chatCannedJarviddin } from "../i18n/messages.js";
import { CHAT_REPLY_LANGUAGE_POLICY, replyUsesDisallowedScript } from "./languagePolicy.js";

export type IntentResult = { mode: "chat"; reply: string } | { mode: "answer" } | { mode: "agent" };

function looksLikeRepoTask(text: string): boolean {
  return (
    /\b(fix|bug|implement|refactor|pr|merge|repo|branch|commit|error|test|add|remove|update|cursor|github|feature|build|deploy|workflow|code|file)\b/i.test(
      text
    ) ||
    /(исправ|ошибк|репозитор|ветк|фич|деплой|мердж|коммит|рефактор|код|файл|workflow|ci)/i.test(text) ||
    /(tuzat|xato|repozitor|tarmoq|merge|commit|refactor|deploy|kod|fayl|workflow|ci)/i.test(text)
  );
}

function hasExplicitWorkRequest(text: string): boolean {
  return (
    /^(?:please\s+|pls\s+)?(?:fix|implement|refactor|update|change|add|remove|edit|rewrite|rename|merge|deploy|build|test|debug|investigate|review|create|open|work on|clean up)\b/i.test(
      text
    ) ||
    /\b(?:can|could|would)\s+you\b[\s\S]{0,40}\b(?:fix|implement|refactor|update|change|add|remove|edit|rewrite|rename|merge|deploy|build|test|debug|investigate|review|create|open|work on|clean up)\b/i.test(
      text
    ) ||
    /\b(?:need|want)\s+you\s+to\b[\s\S]{0,40}\b(?:fix|implement|refactor|update|change|add|remove|edit|rewrite|rename|merge|deploy|build|test|debug|investigate|review|create|open|work on|clean up)\b/i.test(
      text
    ) ||
    /\blet'?s\b[\s\S]{0,20}\b(?:fix|implement|refactor|update|change|add|remove|edit|rewrite|rename|merge|deploy|build|test|debug|investigate|review|create|open|work on|clean up)\b/i.test(
      text
    ) ||
    /^(?:исправ|почини|обнови|измени|добавь|удали|отрефакторь|задеплой|смержи|мерджни|проверь|протестируй|создай|открой)\b/i.test(
      text
    ) ||
    /(нужно|надо|можешь|сможешь|пожалуйста)[\s\S]{0,40}(исправ|почин|обнов|измени|добав|удал|рефактор|задепло|смерж|мердж|проверь|протестируй|создай|открой)/i.test(
      text
    ) ||
    /^(?:tuzat|yangila|o'zgart|o‘zgart|qo'sh|qo‘sh|o'chir|o‘chir|refactor qil|deploy qil|merge qil|tekshir|test qil|yarat|och)\b/i.test(
      text
    ) ||
    /(iltimos|kerak|qila olasan|qilaolasiz|yordam ber)[\s\S]{0,40}(tuzat|yangila|o'zgart|o‘zgart|qo'sh|qo‘sh|o'chir|o‘chir|refactor|deploy|merge|tekshir|test|yarat|och)/i.test(
      text
    )
  );
}

function mentionsAgentFlow(text: string): boolean {
  return /(?:^|\s)\/agent\b|\bcursor agent\b|\b(?:start|run|launch) (?:a )?cursor\b|\bcreate (?:a )?(?:cursor )?agent\b/i.test(
    text
  );
}

function heuristicIntentWithoutLLM(text: string, locale: AppLocale): IntentResult {
  const t = text.trim();
  const lower = t.toLowerCase();
  const shortGreeting =
    /^(hi|hello|hey|thanks|thank you|ok|okay|bye|good morning|good night)[\s!.]*$/i.test(lower) ||
    /^(салют|привет|спасибо|пока|ок|ладно)[\s!.?]*$/i.test(lower.trim()) ||
    /^(salom|rahmat|xayr|ha|yoq)[\s!.?]*$/i.test(lower.trim()) ||
    /^\s*(assalomu?|salomu?)\s+al[ea]ykum\b/i.test(lower.trim()) ||
    /^(assalom|salom|salaam)[\s!.?]*$/i.test(lower.trim());
  if (shortGreeting) {
    return {
      mode: "chat",
      reply: chatCannedJarviddin(locale),
    };
  }
  if (mentionsAgentFlow(t) || (hasExplicitWorkRequest(t) && looksLikeRepoTask(t))) {
    return { mode: "agent" };
  }
  if (config.conversational.defaultToAgentWhenDeepSeekUnset && looksLikeRepoTask(t)) {
    return { mode: "agent" };
  }
  return { mode: "answer" };
}

function parseIntentJson(text: string): IntentResult | null {
  try {
    const raw = stripJsonFence(text);
    const o = JSON.parse(raw) as Record<string, unknown>;
    const mode =
      o.mode === "chat" ? "chat" : o.mode === "answer" ? "answer" : o.mode === "agent" ? "agent" : null;
    if (!mode) return null;
    if (mode === "chat") {
      const reply = o.reply == null ? "" : String(o.reply).trim();
      if (!reply) return null;
      return { mode: "chat", reply };
    }
    if (mode === "answer") {
      return { mode: "answer" };
    }
    return { mode: "agent" };
  } catch {
    return null;
  }
}

function localeIntentRules(locale: AppLocale): string {
  if (locale === "uz") {
    return "For chat replies, use Uzbek (Latin or Cyrillic) matching the user when possible. Never Urdu or Arabic script.";
  }
  if (locale === "ru") {
    return "For chat replies, use Russian. Never Urdu or Arabic script.";
  }
  return "If mode is chat, reply must be a short, warm, professional message (non-empty) in English, Russian, or Uzbek only—never Urdu or Arabic script.";
}

function sanitizeChatReply(reply: string, locale: AppLocale): string {
  if (!replyUsesDisallowedScript(reply)) return reply;
  return chatCannedJarviddin(locale);
}

export async function classifyIntent(userText: string, locale: AppLocale): Promise<IntentResult> {
  if (!config.deepseek.apiKey.trim()) {
    return heuristicIntentWithoutLLM(userText, locale);
  }

  const override = config.conversational.assistantSystemPrompt.trim();
  const system = [
    override ||
      [
        "You classify Telegram messages for Jarviddin, the user's assistant for work.",
        "Jarviddin helps with Cursor agents, GitHub repositories, and general work questions—not a generic assistant named Jarvis or anything else.",
      ].join(" "),
    'Return ONLY JSON (no markdown): {"mode":"chat"|"answer"|"agent","reply":string|null}',
    CHAT_REPLY_LANGUAGE_POLICY,
    localeIntentRules(locale),
    "In chat replies, the assistant is always Jarviddin. Never call yourself Jarvis or another name.",
    "If mode is chat, reply must be a short social reply. If mode is answer or agent, reply must be null.",
    "Use agent only when the user is explicitly asking Jarviddin to perform repository work or start Cursor work: fix or change code, implement or refactor something in the project, edit files, debug the repo, merge PRs, deploy, run tests, or otherwise change project state.",
    "Use answer for factual questions, explanations, brainstorming, writing help, math, advice, or general engineering questions that can be answered directly without operating on a repository.",
    "Use chat only for greetings, thanks, acknowledgements, or brief pleasantries.",
    "Examples: 'what is the 50th fibonacci number' -> answer; 'explain merge commits' -> answer; 'fix the deploy workflow in the repo' -> agent; 'hi' -> chat.",
  ].join("\n");

  const body = {
    model: config.deepseek.model,
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: userText },
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
    const raw = await res.text();
    if (!res.ok) {
      return heuristicIntentWithoutLLM(userText, locale);
    }
    const data = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = parseIntentJson(content);
    if (!parsed) return heuristicIntentWithoutLLM(userText, locale);
    if (parsed.mode === "chat") {
      return { mode: "chat", reply: sanitizeChatReply(parsed.reply, locale) };
    }
    return parsed;
  } catch {
    return heuristicIntentWithoutLLM(userText, locale);
  }
}
