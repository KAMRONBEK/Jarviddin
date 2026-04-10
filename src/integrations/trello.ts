import { config } from "../config.js";

export function isTrelloConfigured(): boolean {
  return Boolean(config.trello.key && config.trello.token && config.trello.defaultListId);
}

export async function createCard(name: string, desc?: string): Promise<{ ok: boolean; message: string; url?: string }> {
  if (!isTrelloConfigured()) {
    return { ok: false, message: "Trello is not configured (TRELLO_KEY, TRELLO_TOKEN, TRELLO_DEFAULT_LIST_ID)" };
  }
  const params = new URLSearchParams({
    key: config.trello.key,
    token: config.trello.token,
    idList: config.trello.defaultListId,
    name,
    desc: desc ?? "",
  });
  const res = await fetch(`https://api.trello.com/1/cards?${params.toString()}`, { method: "POST" });
  const data = (await res.json()) as { shortUrl?: string; url?: string; id?: string; message?: string };
  if (!res.ok) {
    return { ok: false, message: data.message ?? JSON.stringify(data) };
  }
  return { ok: true, message: "Card created.", url: data.shortUrl ?? data.url };
}
