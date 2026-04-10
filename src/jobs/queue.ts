import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { CursorAgentsClient } from "../cursor/client.js";
import { insertJob, updateJob, countRunningJobs, type AgentJobRow } from "../store/db.js";

const client = new CursorAgentsClient();

export interface EnqueueParams {
  telegramUserId: number;
  chatId: number;
  prompt: string;
  repository: string;
  ref: string;
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
      error: `Too many active agents (${running}/${config.cursor.maxConcurrentAgents}). Wait for one to finish.`,
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
      return { ok: false, error: "Cursor API returned no agent id" };
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
    });

    return { ok: true, jobId, cursorAgentId: agentId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export function formatJobStatusLine(job: AgentJobRow): string {
  const lines = [
    `Job: ${job.id}`,
    `Cursor agent: ${job.cursor_agent_id}`,
    `Status: ${job.status}`,
    `Repo: ${job.repository} @ ${job.ref}`,
  ];
  if (job.branch_name) lines.push(`Branch: ${job.branch_name}`);
  if (job.pr_url) lines.push(`PR: ${job.pr_url}`);
  if (job.summary) lines.push(`Summary: ${job.summary}`);
  if (job.last_error) lines.push(`Error: ${job.last_error}`);
  return lines.join("\n");
}
