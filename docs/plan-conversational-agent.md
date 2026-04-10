# Conversational text + audio (plan)

## Goals

- Plain-text messages (no `/`) and **voice messages** route through the same pipeline as `/agent` when intent is **agent**; small talk uses **DeepSeek** for short “Jarvis-style” replies.
- **Intent classification** and **persona** use **DeepSeek** (same `DEEPSEEK_API_KEY` as the existing gate).
- **Speech-to-text** uses **OpenAI Whisper** (`OPENAI_API_KEY`) — DeepSeek does not transcribe audio; keep this key separate from chat.

## Flow

1. **Text** (first character not `/`) or **voice** → optional **Whisper** → unified string.
2. **DeepSeek** `classifyIntent`: `{ "mode": "agent" | "chat", "reply": string | null }`.
   - `chat`: send `reply` (persona already in classifier).
   - `agent`: run existing `/agent` path (`buildCursorAgentPrompt`, gate, enqueue).
3. **Persona** (DeepSeek optional): wrap ack lines and poller “Done/Failed” in a concise British-butler tone; **preserve URLs, PR links, job IDs verbatim**.

## Environment

| Variable | Purpose |
|----------|---------|
| `DEEPSEEK_API_KEY` | Intent + small chat + persona + existing gate |
| `OPENAI_API_KEY` | Whisper STT only (voice messages) |
| `ASSISTANT_SYSTEM_PROMPT` | Optional override for persona system text |
| `CONVERSATIONAL_DEFAULT_AGENT` | If `true`, when DeepSeek is unset, ambiguous short messages default to **agent**; if `false`, default to **chat** heuristic |

## Security & privacy

- Do not log raw audio buffers or full transcripts in production logs.
- Voice is sent to OpenAI for transcription; text is sent to DeepSeek per your existing policies.

## Implementation status

See git history for `src/llm/intent.ts`, `src/llm/persona.ts`, `src/telegram/agentDispatch.ts`, `src/integrations/whisper.ts`, and handlers in `src/telegram/bot.ts`.
