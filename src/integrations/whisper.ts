import { config } from "../config.js";

export type TranscribeResult = { text: string } | { error: string };

/**
 * OpenAI Whisper transcription. Does not log raw audio; errors avoid echoing full response bodies.
 */
export async function transcribeAudio(buffer: Buffer, filename: string): Promise<TranscribeResult> {
  if (!config.openai.apiKey.trim()) {
    return { error: "OPENAI_API_KEY is not set" };
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), filename);
  form.append("model", "whisper-1");

  try {
    const res = await fetch(`${config.openai.apiBase}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: form,
    });
    const raw = await res.text();
    if (!res.ok) {
      return { error: `OpenAI HTTP ${res.status}: ${raw.slice(0, 200)}` };
    }
    const data = JSON.parse(raw) as { text?: string };
    const out = (data.text ?? "").trim();
    if (!out) return { error: "Empty transcript" };
    return { text: out };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
