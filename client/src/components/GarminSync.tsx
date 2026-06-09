import { useState } from 'react'
import { apiFetch } from '../lib/api'
import type { TrainingPlan, SyncResult } from '../types'

interface Props {
  plan: TrainingPlan
  domain: 'garmin.cn' | 'garmin.com'
  username: string
  password: string
  loggedIn: boolean
  loggingIn: boolean
  restoringSession: boolean
  loginError: string | null
  onDomainChange: (d: 'garmin.cn' | 'garmin.com') => void
  onUsernameChange: (u: string) => void
  onPasswordChange: (p: string) => void
  onLoginErrorClear: () => void
  onLogin: () => Promise<boolean>
  onLogout: () => void
  onSyncComplete: (results: SyncResult[]) => void
  onUndoComplete: (workoutIds: string[]) => void
}

export function GarminSync({
  plan,
  domain,
  username,
  password,
  loggedIn,
  loggingIn,
  restoringSession,
  loginError,
  onDomainChange,
  onUsernameChange,
  onPasswordChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onLoginErrorClear: _onLoginErrorClear,
  onLogin,
  onLogout,
  onSyncComplete,
  onUndoComplete,
}: Props) {
  const [showGarminForm, setShowGarminForm] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [undoing, setUndoing] = useState(false)
  const [undoMessage, setUndoMessage] = useState<string | null>(null)
  const [undoError, setUndoError] = useState<string | null>(null)

  async function handleSync() {
    setSyncing(true)
    setSyncError(null)
    setSyncResults(null)
    setUndoMessage(null)
    setUndoError(null)
    const { ok, data, error } = await apiFetch<{ results: SyncResult[] }>('/api/sync', {
      method: 'POST',
      body: { plan },
    })
    setSyncing(false)
    if (!ok) {
      setSyncError(error)
      return
    }
    setSyncResults(data!.results)
    onSyncComplete(data!.results)
  }

  async function handleUndo() {
    if (!syncResults) return
    const workoutIds = syncResults.filter((r) => r.ok && r.workoutId).map((r) => r.workoutId as string)
    if (workoutIds.length === 0) return
    setUndoing(true)
    setUndoError(null)
    setUndoMessage(null)
    const { ok, data, error } = await apiFetch<{ results: { workoutId: string; ok: boolean; error?: string }[] }>(
      '/api/garmin/delete-workouts',
      { method: 'POST', body: { workoutIds } },
    )
    setUndoing(false)
    if (!ok) {
      setUndoError(error)
      return
    }
    const results = data!.results
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      setUndoError(`${failed.length} 条删除失败：${failed.map((f) => f.error).join('; ')}`)
    } else {
      setUndoMessage(`已删除本次同步创建的 ${results.length} 条训练`)
      onUndoComplete(results.map((r) => r.workoutId))
      setSyncResults(null)
    }
  }

  async function handleLogin() {
    const ok = await onLogin()
    if (ok) setShowGarminForm(false)
  }

  return (
    <section className="card">
      <h2>同步到 Garmin</h2>
      <p className="hint warn">
        本工具通过非官方接口登录 Garmin Connect（账号密码仅保存在本机内存中，不会上传）。
        该方式依赖 Garmin 网页接口，可能因 Garmin 改版而失效，请谨慎使用。
      </p>
      {restoringSession ? (
        <p className="hint">正在恢复上次的 Garmin 登录状态…</p>
      ) : loggedIn && !showGarminForm ? (
        <>
          <div className="row">
            <p className="hint">已连接 Garmin ✓（{username}），下次打开无需重新登录。</p>
            <span className="row" style={{ gap: 12 }}>
              <a
                href="#"
                className="hint"
                onClick={(e) => {
                  e.preventDefault()
                  setShowGarminForm(true)
                }}
              >
                切换账号
              </a>
              <button className="ghost" onClick={onLogout}>
                退出登录
              </button>
            </span>
          </div>
          <button onClick={handleSync} disabled={syncing}>
            {syncing ? '同步中…' : '确认并同步'}
          </button>
          {syncError && <p className="error">同步出错：{syncError}</p>}
          {syncResults && (
            <>
              <ul className="results">
                {syncResults.map((r, i) => (
                  <li key={i} className={r.ok ? 'ok' : 'fail'}>
                    {r.date} · {r.title}：{r.ok ? '已同步' : `失败（${r.error}）`}
                  </li>
                ))}
              </ul>
              {syncResults.some((r) => r.ok && r.workoutId) && (
                <>
                  <button onClick={handleUndo} disabled={undoing}>
                    {undoing ? '撤销中…' : '撤销本次同步（删除刚创建的训练）'}
                  </button>
                  {undoMessage && <p className="hint">{undoMessage}</p>}
                  {undoError && <p className="error">撤销出错：{undoError}</p>}
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {loggedIn && (
            <p className="hint">
              当前已连接 Garmin（{username}）。在下方登录新账号将替换当前连接。{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  setShowGarminForm(false)
                }}
              >
                取消，继续使用当前账号
              </a>
            </p>
          )}
          <label>
            账号区域
            <select value={domain} onChange={(e) => onDomainChange(e.target.value as 'garmin.cn' | 'garmin.com')}>
              <option value="garmin.cn">中国区（佳明中国 / garmin.cn）</option>
              <option value="garmin.com">国际区（garmin.com）</option>
            </select>
          </label>
          <label>
            Garmin 账号
            <input type="text" value={username} onChange={(e) => onUsernameChange(e.target.value)} />
          </label>
          <label>
            密码
            <input type="password" value={password} onChange={(e) => onPasswordChange(e.target.value)} />
          </label>
          <button
            onClick={handleLogin}
            disabled={loggingIn || !username || !password}
          >
            {loggingIn ? '登录中…' : '登录 Garmin'}
          </button>
          {loginError && <p className="error">登录出错：{loginError}</p>}
          <p className="hint">登录成功后，连接状态会保存在本机，下次打开无需重新登录。</p>
        </>
      )}
    </section>
  )
}
