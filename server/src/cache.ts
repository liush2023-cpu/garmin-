/**
 * SQLite 缓存层 —— 避免频繁调用 Garmin API。
 *
 * 表结构：cache(key TEXT PK, data TEXT, fetched_at INTEGER)
 * 过期策略：set 时传入 TTL（毫秒），get 时检查是否过期。
 */

import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../cache.db");

const db = new Database(DB_PATH);

// WAL 模式 —— 并发读性能更好
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS cache (
    key        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  )
`);

const stmtGet = db.prepare("SELECT data, fetched_at FROM cache WHERE key = ?");
const stmtSet = db.prepare("INSERT OR REPLACE INTO cache (key, data, fetched_at) VALUES (?, ?, ?)");
const stmtDel = db.prepare("DELETE FROM cache WHERE key = ?");
const stmtCleanup = db.prepare("DELETE FROM cache WHERE fetched_at < ?");

/** 获取缓存数据，过期返回 null */
export function cacheGet<T>(key: string, ttlMs: number): T | null {
  const row = stmtGet.get(key) as { data: string; fetched_at: number } | undefined;
  if (!row) return null;
  if (Date.now() - row.fetched_at > ttlMs) return null;
  try {
    return JSON.parse(row.data) as T;
  } catch {
    return null;
  }
}

/** 写入缓存 */
export function cacheSet(key: string, data: unknown): void {
  stmtSet.run(key, JSON.stringify(data), Date.now());
}

/** 删除缓存 */
export function cacheDel(key: string): void {
  stmtDel.run(key);
}

/** 清理所有过期条目 */
export function cacheCleanup(): number {
  // 清理超过 7 天的所有条目
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const result = stmtCleanup.run(cutoff);
  return result.changes;
}

// ── 缓存 TTL 常量（毫秒）────────────────────────────────────────────────────

export const TTL = {
  /** HRV、睡眠、静息心率：24 小时 */
  DAILY: 24 * 60 * 60 * 1000,
  /** 身体电量：1 小时 */
  BODY_BATTERY: 60 * 60 * 1000,
  /** 活动列表：2 小时 */
  ACTIVITIES: 2 * 60 * 60 * 1000,
  /** 活动详情：永久（7 天） */
  ACTIVITY_DETAIL: 7 * 24 * 60 * 60 * 1000,
  /** 训练负荷：24 小时 */
  TRAINING_LOAD: 24 * 60 * 60 * 1000,
} as const;
