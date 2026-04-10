import { config } from "../config.js";
import { CursorAgentsClient, classifyAgentStatus, isTerminalAgentStatus } from "../cursor/client.js";
import { listActiveJobs, updateJob, type AgentJobRow } from "../store/db.js";
import { wrapTerminalNotice } from "../llm/persona.js";
import type { Telegraf } from "telegraf";
import type { AppLocale } from "../i18n/types.js";
import { normalizeAppLocale } from "../i18n/types.js";
import { strings, tx } from "../i18n/messages.js";

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
          const loc = normalizeAppLocale(job.locale);
          await notifyUser(bot, job, "failed", strings(loc).pollerTimedOut);
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
            success ? formatSuccessMessage(agent, normalizeAppLocale(job.locale)) : tx(normalizeAppLocale(job.locale), "pollerAgentEnded", { status })
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        updateJob(job.id, { status: "failed", last_error: msg });
        const loc = normalizeAppLocale(job.locale);
        await notifyUser(bot, job, "failed", `${strings(loc).pollerPollErrorPrefix} ${msg}`);
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
  const loc = normalizeAppLocale(job.locale);
  const text = await wrapTerminalNotice(kind, body, loc);
  await bot.telegram.sendMessage(job.chat_id, text);
}

function formatSuccessMessage(
  agent: { target?: { prUrl?: string; branchName?: string; url?: string }; summary?: string },
  locale: AppLocale
): string {
  const m = strings(locale);
  const parts: string[] = [];
  if (agent.summary) parts.push(agent.summary);
  if (agent.target?.prUrl) parts.push(tx(locale, "pollerPrLine", { url: agent.target.prUrl }));
  else if (agent.target?.url) parts.push(tx(locale, "pollerAgentLine", { url: agent.target.url }));
  if (agent.target?.branchName) parts.push(tx(locale, "pollerBranchLine", { branch: agent.target.branchName }));
  return parts.join("\n\n") || m.pollerAgentFinished;
}
