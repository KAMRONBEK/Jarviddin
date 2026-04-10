import { config } from "../config.js";
import { CursorAgentsClient, classifyAgentStatus, isTerminalAgentStatus } from "../cursor/client.js";
import { listActiveJobs, updateJob, type AgentJobRow } from "../store/db.js";
import type { Telegraf } from "telegraf";

const client = new CursorAgentsClient();


export function startAgentPoller(bot: Telegraf): NodeJS.Timeout {
  const interval = config.cursor.pollIntervalMs;
  const maxMs = config.cursor.pollMaxMinutes * 60 * 1000;

  return setInterval(async () => {
    const jobs = listActiveJobs();
    const now = Date.now();
    for (const job of jobs) {
      try {
        const created = new Date(job.created_at).getTime();
        if (now - created > maxMs) {
          updateJob(job.id, { status: "failed", last_error: "Polling timeout exceeded" });
          await notifyUser(bot, job, "failed", "Timed out waiting for Cursor agent.");
          continue;
        }

        const agent = await client.getAgent(job.cursor_agent_id);
        const status = agent.status ?? "";
        const prUrl = agent.target?.prUrl ?? job.pr_url ?? null;
        const branch = agent.target?.branchName ?? job.branch_name ?? null;
        const summary = agent.summary ?? job.summary ?? null;

        updateJob(job.id, {
          pr_url: prUrl,
          branch_name: branch,
          summary: summary ?? undefined,
        });

        if (isTerminalAgentStatus(status)) {
          const outcome = classifyAgentStatus(status);
          const success = outcome === "success";
          updateJob(job.id, {
            status: success ? "completed" : "failed",
            last_error: success ? null : `Agent status: ${status}`,
            pr_url: prUrl,
            branch_name: branch,
            summary: summary ?? undefined,
          });
          await notifyUser(
            bot,
            job,
            success ? "completed" : "failed",
            success ? formatSuccessMessage(agent) : `Agent ended with status: ${status}`
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        updateJob(job.id, { status: "failed", last_error: msg });
          await notifyUser(bot, job, "failed", `Poll error: ${msg}`);
      }
    }
  }, interval);
}

async function notifyUser(
  bot: Telegraf,
  job: AgentJobRow,
  kind: "completed" | "failed",
  body: string
): Promise<void> {
  const prefix = kind === "completed" ? "Done" : "Failed";
  const text = `${prefix}\n${body}`;
  await bot.telegram.sendMessage(job.chat_id, text);
}

function formatSuccessMessage(agent: { target?: { prUrl?: string; branchName?: string; url?: string }; summary?: string }): string {
  const parts: string[] = [];
  if (agent.summary) parts.push(agent.summary);
  if (agent.target?.prUrl) parts.push(`PR: ${agent.target.prUrl}`);
  else if (agent.target?.url) parts.push(`Agent: ${agent.target.url}`);
  if (agent.target?.branchName) parts.push(`Branch: ${agent.target.branchName}`);
  return parts.join("\n\n") || "Agent finished.";
}
