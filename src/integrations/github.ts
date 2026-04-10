import { config } from "../config.js";

export function isGitHubConfigured(): boolean {
  return Boolean(config.github.token);
}

export async function mergePullRequest(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<{ ok: boolean; message: string }> {
  if (!config.github.token) {
    return { ok: false, message: "GITHUB_TOKEN is not configured" };
  }
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/merge`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${config.github.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ merge_method: "merge" }),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, message: `GitHub ${res.status}: ${text}` };
  }
  return { ok: true, message: "Pull request merged." };
}

export function resolveDefaultRepoParts(): { owner: string; repo: string } | null {
  const o = config.github.defaultOwner;
  const r = config.github.defaultRepo;
  if (!o || !r) return null;
  return { owner: o, repo: r };
}
