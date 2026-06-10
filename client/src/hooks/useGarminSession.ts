import { useState, useEffect, useCallback } from 'react'
import { loadJson, saveJson, removeItem, STORAGE_KEYS } from '../lib/storage'
import { apiFetch } from '../lib/api'

export interface StoredGarminSession {
  domain: 'garmin.cn' | 'garmin.com'
  username: string
  session: unknown
}

export function useGarminSession() {
  const saved = loadJson<StoredGarminSession>(STORAGE_KEYS.GARMIN_SESSION)

  const [domain, setDomain] = useState<'garmin.cn' | 'garmin.com'>(saved?.domain ?? 'garmin.cn')
  const [username, setUsername] = useState(saved?.username ?? '')
  const [password, setPassword] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [restoringSession, setRestoringSession] = useState(!!saved)
  const [loginError, setLoginError] = useState<string | null>(null)

  // 打开页面时尝试恢复 session
  useEffect(() => {
    if (!saved?.session) {
      setRestoringSession(false)
      return
    }
    let cancelled = false
    apiFetch('/api/garmin/restore', {
      method: 'POST',
      body: { tokens: saved.session, domain: saved.domain },
    }).then(({ ok }) => {
      if (cancelled) return
      if (ok) {
        setLoggedIn(true)
      } else {
        removeItem(STORAGE_KEYS.GARMIN_SESSION)
      }
    }).catch(() => {
      if (!cancelled) removeItem(STORAGE_KEYS.GARMIN_SESSION)
    }).finally(() => {
      if (!cancelled) setRestoringSession(false)
    })
    return () => { cancelled = true }
    // 仅在挂载时运行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async () => {
    setLoggingIn(true)
    setLoginError(null)
    const { ok, data, error } = await apiFetch<{ ok: boolean; session: unknown }>('/api/garmin/login', {
      method: 'POST',
      body: { username, password, domain },
    })
    setLoggingIn(false)
    if (!ok) {
      setLoginError(error)
      return false
    }
    setLoggedIn(true)
    if (data?.session) {
      saveJson(STORAGE_KEYS.GARMIN_SESSION, { domain, username, session: data.session })
    }
    setPassword('')
    return true
  }, [username, password, domain])

  const logout = useCallback(() => {
    setLoggedIn(false)
    setPassword('')
    removeItem(STORAGE_KEYS.GARMIN_SESSION)
  }, [])

  return {
    domain,
    username,
    password,
    loggedIn,
    loggingIn,
    restoringSession,
    loginError,
    setDomain,
    setUsername,
    setPassword,
    setLoginError,
    login,
    logout,
  }
}
