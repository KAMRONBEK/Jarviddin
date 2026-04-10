import { config } from "../config.js";

export interface LaunchAgentBody {
  prompt: { text: string };
  source: { repository: string; ref: string };
}

export interface CursorAgentTarget {
  branchName?: string;
  url?: string;
  prUrl?: string;
  autoCreatePr?: boolean;
}

export interface CursorAgentResponse {
  id: string;
  name?: string;
  status?: string;
  source?: { repository?: string; ref?: string };
  target?: CursorAgentTarget;
  summary?: string;
  createdAt?: string;
}

export class CursorAgentsClient {
  private readonly base: string;
  private readonly key: string;

  constructor() {
    this.base = config.cursor.apiBase;
    this.key = config.cursor.apiKey;
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async launchAgent(body: LaunchAgentBody): Promise<CursorAgentResponse> {
    const res = await fetch(`${this.base}/v0/agents`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Cursor API POST /v0/agents ${res.status}: ${text}`);
    }
    return JSON.parse(text) as CursorAgentResponse;
  }

  async getAgent(agentId: string): Promise<CursorAgentResponse> {
    const res = await fetch(`${this.base}/v0/agents/${encodeURIComponent(agentId)}`, {
      method: "GET",
      headers: this.headers(),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Cursor API GET /v0/agents/${agentId} ${res.status}: ${text}`);
    }
    return JSON.parse(text) as CursorAgentResponse;
  }
}

/** Cursor API status strings vary; map to coarse lifecycle. */
export function classifyAgentStatus(status: string | undefined): "running" | "success" | "failed" {
  if (!status) return "running";
  const s = status.toUpperCase();
  if (/(FAIL|ERROR|CANCEL)/.test(s)) return "failed";
  if (/(RUN|CREAT|PEND|QUEUE|START|WORK)/.test(s)) return "running";
  if (/(FINISH|COMPLETE|SUCCESS|DONE)/.test(s)) return "success";
  return "running";
}

export function isTerminalAgentStatus(status: string | undefined): boolean {
  const c = classifyAgentStatus(status);
  return c === "success" || c === "failed";
}
