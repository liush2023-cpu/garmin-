/**
 * 内存缓存层（替代 better-sqlite3，避免 native 模块编译问题）。
 * 进程重启后缓存清空，但对 Garmin API 速率限制已足够。
 */

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const store = new Map<string, CacheEntry>();

/** 获取缓存数据，过期返回 null */
export function cacheGet<T>(key: string, ttlMs: number): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ttlMs) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

/** 写入缓存 */
export function cacheSet(key: string, data: unknown): void {
  store.set(key, { data, fetchedAt: Date.now() });
}

/** 删除缓存 */
export function cacheDel(key: string): void {
  store.delete(key);
}

/** 清理所有过期条目（超过 7 天） */
export function cacheCleanup(): number {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let count = 0;
  for (const [key, entry] of store) {
    if (entry.fetchedAt < cutoff) {
      store.delete(key);
      count++;
    }
  }
  return count;
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
