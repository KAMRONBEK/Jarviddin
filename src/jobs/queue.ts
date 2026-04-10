import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { CursorAgentsClient } from "../cursor/client.js";
import { insertJob, updateJob, countRunningJobs, type AgentJobRow } from "../store/db.js";
import type { AppLocale } from "../i18n/types.js";
import { normalizeAppLocale } from "../i18n/types.js";
import { strings, tx } from "../i18n/messages.js";

const client = new CursorAgentsClient();

export interface EnqueueParams {
  telegramUserId: number;
  chatId: number;
  prompt: string;
  repository: string;
  ref: string;
  locale: AppLocale;
}

export interface EnqueueResult {
  ok: boolean;
  jobId?: string;
  cursorAgentId?: string;
  error?: string;
}

export async function enqueueCursorAgent(params: EnqueueParams): Promise<EnqueueResult> {
  const running = countRunningJobs();
  if (running >= config.cursor.maxConcurrentAgents) {
    return {
      ok: false,
      error: tx(params.locale, "tooManyAgents", {
        running,
        max: config.cursor.maxConcurrentAgents,
      }),
    };
  }

  const jobId = randomUUID();
  try {
    const launched = await client.launchAgent({
      prompt: { text: params.prompt },
      source: {
        repository: params.repository,
        ref: params.ref,
      },
    });

    const agentId = launched.id;
    if (!agentId) {
      return { ok: false, error: strings(params.locale).cursorApiNoAgentId };
    }

    insertJob({
      id: jobId,
      telegram_user_id: params.telegramUserId,
      chat_id: params.chatId,
      cursor_agent_id: agentId,
      status: "running",
      prompt: params.prompt,
      repository: params.repository,
      ref: params.ref,
      last_error: null,
      pr_url: launched.target?.prUrl ?? null,
      branch_name: launched.target?.branchName ?? null,
      summary: launched.summary ?? null,
      locale: params.locale,
    });

    return { ok: true, jobId, cursorAgentId: agentId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export function formatJobStatusLine(job: AgentJobRow): string {
  const loc = normalizeAppLocale(job.locale);
  const m = strings(loc);
  const lines = [
    `${m.jobLabel} ${job.id}`,
    `${m.cursorAgentLabel} ${job.cursor_agent_id}`,
    `${m.statusLabel} ${job.status}`,
    `${m.repoLabel} ${job.repository} @ ${job.ref}`,
  ];
  if (job.branch_name) lines.push(`${m.branchLabel} ${job.branch_name}`);
  if (job.pr_url) lines.push(`${m.prLabel} ${job.pr_url}`);
  if (job.summary) lines.push(`${m.summaryLabel} ${job.summary}`);
  if (job.last_error) lines.push(`${m.errorLabel} ${job.last_error}`);
  return lines.join("\n");
}
