import { useCallback } from 'react'
import { loadJson, saveJson, STORAGE_KEYS } from '../lib/storage'
import type { SyncResult } from '../types'

export interface SyncLogEntry {
  workoutId: string
  date: string
  title: string
  planName?: string
  syncedAt: string
}

function loadSyncLog(): SyncLogEntry[] {
  const parsed = loadJson<unknown>(STORAGE_KEYS.SYNC_LOG)
  return Array.isArray(parsed) ? (parsed as SyncLogEntry[]) : []
}

export function useSyncLog() {
  /** 同步成功后追加记录（按 workoutId 去重） */
  const appendSyncLog = useCallback((results: SyncResult[], planName?: string) => {
    const newEntries = results
      .filter((r): r is SyncResult & { workoutId: string } => r.ok && !!r.workoutId)
      .map((r) => ({
        workoutId: r.workoutId,
        date: r.date,
        title: r.title,
        planName,
        syncedAt: new Date().toISOString(),
      }))
    if (newEntries.length === 0) return
    const existing = loadSyncLog()
    const byId = new Map(existing.map((e) => [e.workoutId, e]))
    for (const entry of newEntries) byId.set(entry.workoutId, entry)
    saveJson(STORAGE_KEYS.SYNC_LOG, [...byId.values()])
  }, [])

  /** 撤销同步后移除对应记录 */
  const removeFromSyncLog = useCallback((workoutIds: string[]) => {
    if (workoutIds.length === 0) return
    const ids = new Set(workoutIds)
    saveJson(
      STORAGE_KEYS.SYNC_LOG,
      loadSyncLog().filter((e) => !ids.has(e.workoutId)),
    )
  }, [])

  return { appendSyncLog, removeFromSyncLog }
}
