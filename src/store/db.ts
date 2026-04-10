import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../config.js";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AgentJobRow {
  id: string;
  telegram_user_id: number;
  chat_id: number;
  cursor_agent_id: string;
  status: JobStatus;
  prompt: string;
  repository: string;
  ref: string;
  last_error: string | null;
  pr_url: string | null;
  branch_name: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

let dbSingleton: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbSingleton) return dbSingleton;
  const dir = path.dirname(path.resolve(config.sqlitePath));
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(config.sqlitePath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      telegram_user_id INTEGER PRIMARY KEY,
      default_repo TEXT,
      default_ref TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_jobs (
      id TEXT PRIMARY KEY,
      telegram_user_id INTEGER NOT NULL,
      chat_id INTEGER NOT NULL,
      cursor_agent_id TEXT NOT NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      repository TEXT NOT NULL,
      ref TEXT NOT NULL,
      last_error TEXT,
      pr_url TEXT,
      branch_name TEXT,
      summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON agent_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_cursor ON agent_jobs(cursor_agent_id);
    CREATE TABLE IF NOT EXISTS pending_actions (
      id TEXT PRIMARY KEY,
      telegram_user_id INTEGER NOT NULL,
      chat_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  dbSingleton = db;
  return db;
}

export function insertJob(row: Omit<AgentJobRow, "created_at" | "updated_at">): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO agent_jobs (
      id, telegram_user_id, chat_id, cursor_agent_id, status, prompt, repository, ref,
      last_error, pr_url, branch_name, summary, created_at, updated_at
    ) VALUES (
      @id, @telegram_user_id, @chat_id, @cursor_agent_id, @status, @prompt, @repository, @ref,
      @last_error, @pr_url, @branch_name, @summary, @created_at, @updated_at
    )`
  ).run({
    ...row,
    created_at: now,
    updated_at: now,
  });
}

export function updateJob(
  id: string,
  patch: Partial<Pick<AgentJobRow, "status" | "last_error" | "pr_url" | "branch_name" | "summary">>
): void {
  const db = getDb();
  const keys = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined);
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE agent_jobs SET ${setClause}, updated_at = @updated_at WHERE id = @id`).run({
    ...patch,
    id,
    updated_at: new Date().toISOString(),
  });
}

export function getJobById(id: string): AgentJobRow | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM agent_jobs WHERE id = ?").get(id) as AgentJobRow | undefined;
}

export function listActiveJobs(): AgentJobRow[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM agent_jobs WHERE status IN ('queued', 'running') ORDER BY created_at ASC")
    .all() as AgentJobRow[];
}

export function countRunningJobs(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as c FROM agent_jobs WHERE status = 'running'").get() as { c: number };
  return row.c;
}

export interface UserSessionRow {
  telegram_user_id: number;
  default_repo: string | null;
  default_ref: string | null;
}

export function getUserSession(telegramUserId: number): UserSessionRow | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM user_sessions WHERE telegram_user_id = ?").get(telegramUserId) as
    | UserSessionRow
    | undefined;
}

export function insertPendingAction(
  id: string,
  telegramUserId: number,
  chatId: number,
  action: string,
  payload: string
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO pending_actions (id, telegram_user_id, chat_id, action, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, telegramUserId, chatId, action, payload, new Date().toISOString());
}

export function getPendingAction(
  id: string
):
  | { action: string; payload: string; telegram_user_id: number; chat_id: number }
  | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM pending_actions WHERE id = ?").get(id) as
    | {
        action: string;
        payload: string;
        telegram_user_id: number;
        chat_id: number;
      }
    | undefined;
}

export function deletePendingAction(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM pending_actions WHERE id = ?").run(id);
}

export function takePendingAction(id: string): { action: string; payload: string; telegram_user_id: number; chat_id: number } | undefined {
  const row = getPendingAction(id);
  if (row) deletePendingAction(id);
  return row;
}

export function upsertUserSession(
  telegramUserId: number,
  patch: Partial<Pick<UserSessionRow, "default_repo" | "default_ref">>
): void {
  const db = getDb();
  const existing = getUserSession(telegramUserId);
  const row: UserSessionRow = {
    telegram_user_id: telegramUserId,
    default_repo: patch.default_repo ?? existing?.default_repo ?? null,
    default_ref: patch.default_ref ?? existing?.default_ref ?? null,
  };
  db.prepare(
    `INSERT INTO user_sessions (telegram_user_id, default_repo, default_ref)
     VALUES (@telegram_user_id, @default_repo, @default_ref)
     ON CONFLICT(telegram_user_id) DO UPDATE SET
       default_repo = excluded.default_repo,
       default_ref = excluded.default_ref`
  ).run(row);
}
