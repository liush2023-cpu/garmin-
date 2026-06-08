/**
 * localStorage 读写辅助 —— 统一的 try/catch 和 JSON 序列化。
 */

export function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 忽略本地存储失败（如隐私模式） */
  }
}

export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* 忽略 */
  }
}

// ── 应用级存储键 ────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  LLM_CONFIG: 'garmin-trainer:llm-config',
  GARMIN_SESSION: 'garmin-trainer:garmin-session',
  SYNC_LOG: 'garmin-trainer:sync-log',
} as const
