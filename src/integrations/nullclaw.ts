import { config } from "../config.js";

/**
 * Optional hook: POST a JSON payload to a NullClaw gateway or external worker.
 * Configure NULLCLAW_WEBHOOK_URL to enable; otherwise no-op.
 */
export async function notifyNullClawWorker(payload: Record<string, unknown>): Promise<{ ok: boolean; detail?: string }> {
  const url = config.nullclaw.webhookUrl;
  if (!url) {
    return { ok: false, detail: "NULLCLAW_WEBHOOK_URL not set" };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "jarviddin-orchestrator", ...payload }),
    });
    if (!res.ok) {
      return { ok: false, detail: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
