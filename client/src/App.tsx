import { useEffect, useState, type ChangeEvent } from 'react'
import type { TrainingPlan, SyncResult, WorkoutStep, StepType } from './types'
import './App.css'

const LLM_PRESETS = {
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  qwen: {
    label: '通义千问（阿里云百炼）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  moonshot: { label: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  custom: { label: '自定义（OpenAI 兼容接口）', baseUrl: '', model: '' },
} as const

// 本地持久化：避免每次都要重新填写 LLM 接口配置 / 重新登录 Garmin。
// 这些信息只保存在浏览器本地（localStorage），不会发送给除你指定的服务之外的任何人。
const LLM_CONFIG_KEY = 'garmin-trainer:llm-config'
const GARMIN_SESSION_KEY = 'garmin-trainer:garmin-session'
// 记录"计划 → 已同步到 Garmin 的训练"的映射（含 workoutId），
// 为以后做"实际完成数据 vs 计划"的对比分析预留。撤销同步时会同步移除对应记录。
const SYNC_LOG_KEY = 'garmin-trainer:sync-log'

/** 一条已同步到 Garmin 的训练记录，用于后续把计划和实际跑步数据关联起来。 */
interface SyncLogEntry {
  /** Garmin 上的训练 ID —— 后续拉取实际完成数据时用它做关联键 */
  workoutId: string
  /** 计划中的训练日期 YYYY-MM-DD */
  date: string
  /** 训练标题 */
  title: string
  /** 所属计划名称（便于区分多次导入） */
  planName?: string
  /** 同步发生的时间（ISO 字符串），用于排查/排序 */
  syncedAt: string
}

interface StoredLlmConfig {
  provider: keyof typeof LLM_PRESETS
  baseUrl: string
  apiKey: string
  model: string
}

interface StoredGarminSession {
  domain: 'garmin.cn' | 'garmin.com'
  username: string
  session: unknown
}

function loadLlmConfig(): StoredLlmConfig | null {
  try {
    const raw = localStorage.getItem(LLM_CONFIG_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredLlmConfig
  } catch {
    return null
  }
}

function saveLlmConfig(config: StoredLlmConfig) {
  try {
    localStorage.setItem(LLM_CONFIG_KEY, JSON.stringify(config))
  } catch {
    /* 忽略本地存储失败（如隐私模式） */
  }
}

function loadGarminSession(): StoredGarminSession | null {
  try {
    const raw = localStorage.getItem(GARMIN_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredGarminSession
  } catch {
    return null
  }
}

function saveGarminSession(session: StoredGarminSession | null) {
  try {
    if (session) localStorage.setItem(GARMIN_SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(GARMIN_SESSION_KEY)
  } catch {
    /* 忽略本地存储失败 */
  }
}

function loadSyncLog(): SyncLogEntry[] {
  try {
    const raw = localStorage.getItem(SYNC_LOG_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SyncLogEntry[]) : []
  } catch {
    return []
  }
}

function saveSyncLog(entries: SyncLogEntry[]) {
  try {
    localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(entries))
  } catch {
    /* 忽略本地存储失败 */
  }
}

/** 同步成功后追加记录（按 workoutId 去重，避免重复同步产生多条）。 */
function appendSyncLog(newEntries: SyncLogEntry[]) {
  if (newEntries.length === 0) return
  const existing = loadSyncLog()
  const byId = new Map(existing.map((e) => [e.workoutId, e]))
  for (const entry of newEntries) byId.set(entry.workoutId, entry)
  saveSyncLog([...byId.values()])
}

/** 撤销同步后移除对应记录，避免日志里残留指向已删除训练的死链接。 */
function removeFromSyncLog(workoutIds: string[]) {
  if (workoutIds.length === 0) return
  const ids = new Set(workoutIds)
  saveSyncLog(loadSyncLog().filter((e) => !ids.has(e.workoutId)))
}

// --- VDOT 估算（Jack Daniels / Daniels-Gilbert 公式） ----------------------
//
// 给定一次比赛的距离（米）和完赛时间（分钟），按《丹尼尔斯跑步方程式》
// 里的经验公式精确计算 VDOT，避免用户去外部网站查表。
//
//   v        = 配速，单位 米/分钟
//   VO2      = -4.60 + 0.182258·v + 0.000104·v²            （该配速消耗的摄氧量）
//   %VO2max  = 0.8 + 0.1894393·e^(-0.012778·t) + 0.2989558·e^(-0.1932605·t)
//              （完赛时间 t 分钟时，全程平均用到的最大摄氧量百分比）
//   VDOT     = VO2 / %VO2max
//
// 这正是 Daniels 书中附表、以及多数在线 VDOT 计算器背后使用的公式。
function estimateVdot(distanceMeters: number, timeMinutes: number): number | null {
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(timeMinutes)) return null
  if (distanceMeters <= 0 || timeMinutes <= 0) return null

  const v = distanceMeters / timeMinutes
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v
  const pctMax =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * timeMinutes) +
    0.2989558 * Math.exp(-0.1932605 * timeMinutes)
  if (pctMax <= 0) return null

  const vdot = vo2 / pctMax
  return Number.isFinite(vdot) && vdot > 0 ? vdot : null
}

const RACE_PRESETS = {
  '5k': { label: '5 公里', meters: 5000 },
  '10k': { label: '10 公里', meters: 10000 },
  half: { label: '半程马拉松', meters: 21097.5 },
  full: { label: '全程马拉松', meters: 42195 },
  custom: { label: '自定义距离', meters: 0 },
} as const

const STEP_TYPES: StepType[] = ['warmup', 'interval', 'recovery', 'cooldown', 'easy', 'rest']

const VALID_STEP_TYPES = new Set<StepType>(['warmup', 'interval', 'recovery', 'cooldown', 'easy', 'rest'])

function validatePlan(data: unknown): TrainingPlan {
  if (typeof data !== 'object' || data === null) throw new Error('顶层必须是一个 JSON 对象')
  const plan = data as Record<string, unknown>
  if (typeof plan.name !== 'string') throw new Error('缺少字符串字段 "name"')
  if (!Array.isArray(plan.workouts)) throw new Error('缺少数组字段 "workouts"')

  plan.workouts.forEach((w, wi) => {
    if (typeof w !== 'object' || w === null) throw new Error(`workouts[${wi}] 必须是对象`)
    const workout = w as Record<string, unknown>
    if (typeof workout.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(workout.date)) {
      throw new Error(`workouts[${wi}].date 必须是 YYYY-MM-DD 格式的字符串`)
    }
    if (typeof workout.title !== 'string') throw new Error(`workouts[${wi}].title 必须是字符串`)
    if (!Array.isArray(workout.steps)) throw new Error(`workouts[${wi}].steps 必须是数组`)
    workout.steps.forEach((s, si) => {
      if (typeof s !== 'object' || s === null) throw new Error(`workouts[${wi}].steps[${si}] 必须是对象`)
      const step = s as Record<string, unknown>
      if (typeof step.type !== 'string' || !VALID_STEP_TYPES.has(step.type as StepType)) {
        throw new Error(`workouts[${wi}].steps[${si}].type 必须是以下之一：${[...VALID_STEP_TYPES].join(', ')}`)
      }
      if (step.distanceMeters == null && step.durationSeconds == null) {
        throw new Error(`workouts[${wi}].steps[${si}] 必须包含 distanceMeters 或 durationSeconds 之一`)
      }
    })
  })

  return data as TrainingPlan
}

function stepSummary(step: WorkoutStep): string {
  const parts: string[] = [step.type]
  if (step.distanceMeters != null) parts.push(`${step.distanceMeters} 米`)
  if (step.durationSeconds != null) parts.push(`${step.durationSeconds} 秒`)
  if (step.targetPace) parts.push(`配速 ${step.targetPace}`)
  if (step.targetHeartRate) parts.push(`心率 ${step.targetHeartRate}`)
  if (step.repeat) parts.push(`x${step.repeat}`)
  return parts.join(' / ')
}

function App() {
  const [planJsonText, setPlanJsonText] = useState('')
  const [plan, setPlan] = useState<TrainingPlan | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const savedLlmConfig = loadLlmConfig()
  const [provider, setProvider] = useState<keyof typeof LLM_PRESETS>(savedLlmConfig?.provider ?? 'deepseek')
  const [baseUrl, setBaseUrl] = useState<string>(savedLlmConfig?.baseUrl ?? LLM_PRESETS.deepseek.baseUrl)
  const [llmApiKey, setLlmApiKey] = useState(savedLlmConfig?.apiKey ?? '')
  const [model, setModel] = useState<string>(savedLlmConfig?.model ?? LLM_PRESETS.deepseek.model)
  const [planText, setPlanText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  // 用近期比赛成绩估算 VDOT
  const [raceDistKey, setRaceDistKey] = useState<keyof typeof RACE_PRESETS>('10k')
  const [raceCustomKm, setRaceCustomKm] = useState('10')
  const [raceHours, setRaceHours] = useState('0')
  const [raceMinutes, setRaceMinutes] = useState('45')
  const [raceSeconds, setRaceSeconds] = useState('0')
  const [vdotEstimate, setVdotEstimate] = useState<number | null>(null)
  const [vdotEstimateError, setVdotEstimateError] = useState<string | null>(null)

  // 按 VDOT / 训练目的直接生成课表
  const [genMode, setGenMode] = useState<'single' | 'week'>('single')
  const [genVdot, setGenVdot] = useState('46.5')
  const [genGoal, setGenGoal] = useState<'aerobic' | 'marathon' | 'threshold' | 'speed'>('aerobic')
  const [genDaysPerWeek, setGenDaysPerWeek] = useState('4')
  const [genWeeklyKm, setGenWeeklyKm] = useState('30')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const savedGarminSession = loadGarminSession()
  const [gDomain, setGDomain] = useState<'garmin.cn' | 'garmin.com'>(savedGarminSession?.domain ?? 'garmin.cn')
  const [gUsername, setGUsername] = useState(savedGarminSession?.username ?? '')
  const [gPassword, setGPassword] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [restoringSession, setRestoringSession] = useState(!!savedGarminSession)
  const [loginError, setLoginError] = useState<string | null>(null)

  // 保存大模型接口配置到本地，下次打开页面自动填入。
  useEffect(() => {
    saveLlmConfig({ provider, baseUrl, apiKey: llmApiKey, model })
  }, [provider, baseUrl, llmApiKey, model])

  // 打开页面时尝试用本地保存的会话令牌自动恢复 Garmin 登录状态，免去重复输入密码。
  useEffect(() => {
    const saved = savedGarminSession
    if (!saved?.session) {
      setRestoringSession(false)
      return
    }
    let cancelled = false
    fetch('/api/garmin/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens: saved.session, domain: saved.domain }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok }) => {
        if (cancelled) return
        if (ok) {
          setLoggedIn(true)
        } else {
          saveGarminSession(null)
        }
      })
      .catch(() => {
        if (!cancelled) saveGarminSession(null)
      })
      .finally(() => {
        if (!cancelled) setRestoringSession(false)
      })
    return () => {
      cancelled = true
    }
    // 仅在挂载时运行一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [syncing, setSyncing] = useState(false)
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const [undoing, setUndoing] = useState(false)
  const [undoMessage, setUndoMessage] = useState<string | null>(null)
  const [undoError, setUndoError] = useState<string | null>(null)

  function handleLoadJson() {
    setLoadError(null)
    setPlan(null)
    try {
      const data = JSON.parse(planJsonText)
      setPlan(validatePlan(data))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleProviderChange(p: keyof typeof LLM_PRESETS) {
    setProvider(p)
    setBaseUrl(LLM_PRESETS[p].baseUrl)
    setModel(LLM_PRESETS[p].model)
  }

  async function handleParse() {
    setParsing(true)
    setParseError(null)
    setPlan(null)
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planText, baseUrl, apiKey: llmApiKey, model }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '解析失败')
      setPlan(validatePlan(data.plan))
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err))
    } finally {
      setParsing(false)
    }
  }

  function handleEstimateVdot() {
    setVdotEstimateError(null)
    setVdotEstimate(null)
    const distanceMeters =
      raceDistKey === 'custom' ? Number(raceCustomKm) * 1000 : RACE_PRESETS[raceDistKey].meters
    const timeMinutes = (Number(raceHours) || 0) * 60 + (Number(raceMinutes) || 0) + (Number(raceSeconds) || 0) / 60
    if (!distanceMeters || distanceMeters <= 0) {
      setVdotEstimateError('请输入有效的比赛距离')
      return
    }
    if (!timeMinutes || timeMinutes <= 0) {
      setVdotEstimateError('请输入有效的完赛时间')
      return
    }
    const vdot = estimateVdot(distanceMeters, timeMinutes)
    if (vdot == null) {
      setVdotEstimateError('无法根据该成绩估算 VDOT，请检查距离和时间是否合理')
      return
    }
    setVdotEstimate(vdot)
    setGenVdot(vdot.toFixed(1))
  }

  async function handleGenerate() {
    const vdot = Number(genVdot)
    if (!Number.isFinite(vdot) || vdot <= 0) {
      setGenerateError('请输入有效的 VDOT 数值')
      return
    }
    const goalParams =
      genMode === 'single'
        ? { mode: 'single' as const, vdot, goal: genGoal }
        : {
            mode: 'week' as const,
            vdot,
            daysPerWeek: Number(genDaysPerWeek) || 4,
            weeklyDistanceKm: Number(genWeeklyKm) || 30,
          }
    setGenerating(true)
    setGenerateError(null)
    setPlan(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalParams, baseUrl, apiKey: llmApiKey, model }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '生成失败')
      setPlan(validatePlan(data.plan))
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((text) => setPlanJsonText(text))
  }

  async function handleLogin() {
    setLoggingIn(true)
    setLoginError(null)
    try {
      const res = await fetch('/api/garmin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: gUsername, password: gPassword, domain: gDomain }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '登录失败')
      setLoggedIn(true)
      if (data.session) {
        saveGarminSession({ domain: gDomain, username: gUsername, session: data.session })
      }
      setGPassword('')
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoggingIn(false)
    }
  }

  function handleLogout() {
    setLoggedIn(false)
    setGPassword('')
    saveGarminSession(null)
  }

  async function handleSync() {
    if (!plan) return
    setSyncing(true)
    setSyncError(null)
    setSyncResults(null)
    setUndoMessage(null)
    setUndoError(null)
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '同步失败')
      const results = data.results as SyncResult[]
      setSyncResults(results)
      // 记录 workoutId ↔ 计划日期/标题的映射，方便以后把实际跑步数据和计划对应起来。
      const syncedAt = new Date().toISOString()
      appendSyncLog(
        results
          .filter((r): r is SyncResult & { workoutId: string } => r.ok && !!r.workoutId)
          .map((r) => ({ workoutId: r.workoutId, date: r.date, title: r.title, planName: plan.name, syncedAt })),
      )
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncing(false)
    }
  }

  async function handleUndo() {
    if (!syncResults) return
    const workoutIds = syncResults.filter((r) => r.ok && r.workoutId).map((r) => r.workoutId as string)
    if (workoutIds.length === 0) return
    setUndoing(true)
    setUndoError(null)
    setUndoMessage(null)
    try {
      const res = await fetch('/api/garmin/delete-workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workoutIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '撤销失败')
      const results = data.results as { workoutId: string; ok: boolean; error?: string }[]
      const failed = results.filter((r) => !r.ok)
      if (failed.length > 0) {
        setUndoError(`${failed.length} 条删除失败：${failed.map((f) => f.error).join('; ')}`)
      } else {
        setUndoMessage(`已删除本次同步创建的 ${results.length} 条训练`)
        removeFromSyncLog(results.map((r) => r.workoutId))
        setSyncResults(null)
      }
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : String(err))
    } finally {
      setUndoing(false)
    }
  }

  function updateStep(workoutIdx: number, stepIdx: number, patch: Partial<WorkoutStep>) {
    if (!plan) return
    const workouts = plan.workouts.map((w, wi) => {
      if (wi !== workoutIdx) return w
      const steps = w.steps.map((s, si) => (si === stepIdx ? { ...s, ...patch } : s))
      return { ...w, steps }
    })
    setPlan({ ...plan, workouts })
  }

  function updateWorkout(workoutIdx: number, patch: { date?: string; title?: string }) {
    if (!plan) return
    const workouts = plan.workouts.map((w, wi) => (wi === workoutIdx ? { ...w, ...patch } : w))
    setPlan({ ...plan, workouts })
  }

  return (
    <div className="page">
      <h1>Garmin AI 训练计划导入工具</h1>
      <p className="hint">
        粘贴 AI 生成的跑步训练计划文本，解析为结构化训练后预览/编辑，再同步到你的 Garmin Connect 账号。
        所有数据仅在本地处理，不会上传到任何第三方服务器。
      </p>

      <section className="card">
        <h2>第一步 A：自然语言生成课表（AI 解析）</h2>
        <p className="hint">
          直接粘贴自然语言描述的训练计划（含目标配速、目标心率等），由你选择的大模型 API 解析为结构化数据。
          接口地址、API Key、模型名称会保存在你浏览器的本地存储中，下次打开自动填好；它们只会发送给你选择的模型服务商，不会上传到本工具的服务器。
        </p>
        <label>
          模型服务商
          <select value={provider} onChange={(e) => handleProviderChange(e.target.value as keyof typeof LLM_PRESETS)}>
            {Object.entries(LLM_PRESETS).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          接口地址（Base URL）
          <input
            type="text"
            placeholder="https://api.deepseek.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>
        <label>
          API Key
          <input type="password" placeholder="sk-..." value={llmApiKey} onChange={(e) => setLlmApiKey(e.target.value)} />
        </label>
        <label>
          模型名称
          <input type="text" placeholder="deepseek-chat" value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
        <label>
          训练计划文本
          <textarea
            rows={10}
            placeholder="粘贴自然语言训练计划，例如：&#10;周二：阈值训练 10公里，3组×8分钟阈值跑（配速 4:55-5:15/km，心率 168-174），组间慢跑2分钟恢复&#10;周四：有氧跑 8公里，心率 135-145..."
            value={planText}
            onChange={(e) => setPlanText(e.target.value)}
          />
        </label>
        <button onClick={handleParse} disabled={parsing || !planText.trim() || !model.trim() || !baseUrl.trim() || !llmApiKey.trim()}>
          {parsing ? '解析中…' : '解析计划'}
        </button>
        {parseError && <p className="error">解析出错：{parseError}</p>}
      </section>

      <section className="card">
        <h2>第一步 B：按当前跑力（VDOT）自动生成课表</h2>
        <p className="hint">
          不想自己写文字描述？告诉 AI 你当前的跑力（VDOT）和训练诉求，由它按 Jack Daniels 训练理论直接生成结构化课表
          （热身、主体训练、放松，含目标配速 / 心率区间，自动按 Jack Daniels 的 E/M/T/I/R 配速换算）。
          需要先在上方填好 LLM 接口配置。
        </p>
        <div className="card" style={{ background: 'var(--code-bg)', boxShadow: 'none', margin: '0 0 16px' }}>
          <h2 style={{ fontSize: 15 }}>不知道自己的 VDOT？用近期比赛成绩估算</h2>
          <p className="hint">
            按 Jack Daniels《丹尼尔斯跑步方程式》里的 VDOT 公式精确计算（与官方对照表、主流在线计算器同源），
            填入一次近期全力跑的比赛/测试成绩（距离 + 完赛时间）即可。
          </p>
          <div className="row">
            <label style={{ flex: 1, minWidth: 160 }}>
              比赛距离
              <select value={raceDistKey} onChange={(e) => setRaceDistKey(e.target.value as keyof typeof RACE_PRESETS)}>
                {Object.entries(RACE_PRESETS).map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {raceDistKey === 'custom' && (
              <label style={{ flex: 1, minWidth: 120 }}>
                距离（公里）
                <input type="number" min={0} step="0.1" value={raceCustomKm} onChange={(e) => setRaceCustomKm(e.target.value)} />
              </label>
            )}
          </div>
          <div className="row">
            <label style={{ flex: 1, minWidth: 80 }}>
              小时
              <input type="number" min={0} value={raceHours} onChange={(e) => setRaceHours(e.target.value)} />
            </label>
            <label style={{ flex: 1, minWidth: 80 }}>
              分钟
              <input type="number" min={0} max={59} value={raceMinutes} onChange={(e) => setRaceMinutes(e.target.value)} />
            </label>
            <label style={{ flex: 1, minWidth: 80 }}>
              秒
              <input type="number" min={0} max={59} value={raceSeconds} onChange={(e) => setRaceSeconds(e.target.value)} />
            </label>
          </div>
          <button className="ghost" onClick={handleEstimateVdot}>
            估算 VDOT
          </button>
          {vdotEstimateError && <p className="error">{vdotEstimateError}</p>}
          {vdotEstimate != null && (
            <p className="hint">
              估算结果：<strong>VDOT ≈ {vdotEstimate.toFixed(1)}</strong>（已自动填入下方"当前跑力"）
            </p>
          )}
        </div>
        <label>
          生成类型
          <select value={genMode} onChange={(e) => setGenMode(e.target.value as 'single' | 'week')}>
            <option value="single">单次训练课表</option>
            <option value="week">一周训练课表</option>
          </select>
        </label>
        <label>
          当前跑力（VDOT）
          <input
            type="number"
            step="0.1"
            placeholder="例如 46.5"
            value={genVdot}
            onChange={(e) => setGenVdot(e.target.value)}
          />
        </label>
        {genMode === 'single' ? (
          <label>
            训练目的
            <select value={genGoal} onChange={(e) => setGenGoal(e.target.value as typeof genGoal)}>
              <option value="aerobic">有氧耐力（低强度长距离，心率区间 2 区）</option>
              <option value="marathon">马拉松配速（模拟比赛强度，对应 VDOT 的 M 配速）</option>
              <option value="threshold">乳酸阈值（阈值配速间歇，对应 VDOT 的 T 配速）</option>
              <option value="speed">无氧 / 速度（高强度短间歇，对应 VDOT 的 I/R 配速）</option>
            </select>
          </label>
        ) : (
          <>
            <label>
              每周可训练天数
              <input
                type="number"
                min={1}
                max={7}
                value={genDaysPerWeek}
                onChange={(e) => setGenDaysPerWeek(e.target.value)}
              />
            </label>
            <label>
              当前每周跑量（公里）
              <input
                type="number"
                min={0}
                step="1"
                value={genWeeklyKm}
                onChange={(e) => setGenWeeklyKm(e.target.value)}
              />
            </label>
          </>
        )}
        <button onClick={handleGenerate} disabled={generating || !model.trim() || !baseUrl.trim() || !llmApiKey.trim()}>
          {generating ? '生成中…' : '生成课表'}
        </button>
        {generateError && <p className="error">生成出错：{generateError}</p>}
      </section>

      <section className="card">
        <h2>第一步 C：导入训练计划 JSON</h2>
        <p className="hint">
          也可以让 AI 按照下面的结构直接生成 JSON，然后粘贴到下方文本框，或直接选择 JSON 文件导入。
        </p>
        <pre className="schema">{`{
  "name": "计划名称",
  "workouts": [
    {
      "date": "2026-06-08",
      "title": "周二间歇跑",
      "steps": [
        { "type": "warmup", "distanceMeters": 1000, "targetPace": "6:00/km" },
        { "type": "interval", "distanceMeters": 800, "repeat": 6, "targetPace": "4:30/km", "targetHeartRate": "168-174" },
        { "type": "recovery", "distanceMeters": 400, "targetPace": "6:30/km" },
        { "type": "cooldown", "distanceMeters": 1000, "targetPace": "6:00/km" }
      ]
    }
  ]
}`}</pre>
        <p className="hint">
          type 取值：warmup（热身）/ interval（间歇）/ recovery（恢复）/ cooldown（放松）/ easy（轻松跑）/ rest（休息日）。
          每个训练步骤需包含 distanceMeters（米）或 durationSeconds（秒）之一。
          相邻且 repeat 数值相同的步骤（例如"间歇 + 组间恢复"各标 repeat: 3）会被自动打包成 Garmin 里的"重复组"，
          显示为"3 次"，而不是同步成三段重复的独立步骤。
        </p>
        <label>
          从文件导入
          <input type="file" accept="application/json,.json" onChange={handleFile} />
        </label>
        <label>
          或粘贴 JSON
          <textarea
            rows={10}
            placeholder="粘贴符合上述结构的 JSON..."
            value={planJsonText}
            onChange={(e) => setPlanJsonText(e.target.value)}
          />
        </label>
        <button onClick={handleLoadJson} disabled={!planJsonText.trim()}>
          加载计划
        </button>
        {loadError && <p className="error">导入出错：{loadError}</p>}
      </section>

      {plan && (
        <section className="card">
          <h2>第二步：预览与编辑</h2>
          <p className="hint">计划名称：{plan.name}</p>
          {plan.workouts.map((workout, wi) => (
            <div className="workout" key={wi}>
              <div className="workout-header">
                <input
                  type="date"
                  value={workout.date}
                  onChange={(e) => updateWorkout(wi, { date: e.target.value })}
                />
                <input
                  type="text"
                  value={workout.title}
                  onChange={(e) => updateWorkout(wi, { title: e.target.value })}
                />
              </div>
              {workout.steps.length === 0 ? (
                <p className="hint">（无具体步骤 / 休息日）</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>类型</th>
                      <th>距离(米)</th>
                      <th>时长(秒)</th>
                      <th>目标配速</th>
                      <th>目标心率</th>
                      <th>重复</th>
                      <th>备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workout.steps.map((step, si) => (
                      <tr key={si}>
                        <td>
                          <select
                            value={step.type}
                            onChange={(e) => updateStep(wi, si, { type: e.target.value as StepType })}
                          >
                            {STEP_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={step.distanceMeters ?? ''}
                            onChange={(e) =>
                              updateStep(wi, si, {
                                distanceMeters: e.target.value === '' ? undefined : Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={step.durationSeconds ?? ''}
                            onChange={(e) =>
                              updateStep(wi, si, {
                                durationSeconds: e.target.value === '' ? undefined : Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={step.targetPace ?? ''}
                            onChange={(e) => updateStep(wi, si, { targetPace: e.target.value || undefined })}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            placeholder="如 150-160 或 <145"
                            value={step.targetHeartRate ?? ''}
                            onChange={(e) => updateStep(wi, si, { targetHeartRate: e.target.value || undefined })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={step.repeat ?? ''}
                            onChange={(e) =>
                              updateStep(wi, si, {
                                repeat: e.target.value === '' ? undefined : Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={step.notes ?? ''}
                            onChange={(e) => updateStep(wi, si, { notes: e.target.value || undefined })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="hint">{workout.steps.map(stepSummary).join('  →  ')}</p>
            </div>
          ))}
        </section>
      )}

      {plan && (
        <section className="card">
          <h2>第三步：同步到 Garmin</h2>
          <p className="hint warn">
            本工具通过非官方接口登录 Garmin Connect（账号密码仅保存在本机内存中，不会上传）。
            该方式依赖 Garmin 网页接口，可能因 Garmin 改版而失效，请谨慎使用。
          </p>
          {restoringSession ? (
            <p className="hint">正在恢复上次的 Garmin 登录状态…</p>
          ) : !loggedIn ? (
            <>
              <label>
                账号区域
                <select value={gDomain} onChange={(e) => setGDomain(e.target.value as 'garmin.cn' | 'garmin.com')}>
                  <option value="garmin.cn">中国区（佳明中国 / garmin.cn）</option>
                  <option value="garmin.com">国际区（garmin.com）</option>
                </select>
              </label>
              <label>
                Garmin 账号
                <input type="text" value={gUsername} onChange={(e) => setGUsername(e.target.value)} />
              </label>
              <label>
                密码
                <input type="password" value={gPassword} onChange={(e) => setGPassword(e.target.value)} />
              </label>
              <button onClick={handleLogin} disabled={loggingIn || !gUsername || !gPassword}>
                {loggingIn ? '登录中…' : '登录 Garmin'}
              </button>
              {loginError && <p className="error">登录出错：{loginError}</p>}
            </>
          ) : (
            <>
              <div className="row">
                <p className="hint">已登录 Garmin（{gUsername}），登录状态已保存在本机，下次打开无需重新登录。</p>
                <button className="ghost" onClick={handleLogout}>
                  退出登录
                </button>
              </div>
              <button onClick={handleSync} disabled={syncing}>
                {syncing ? '同步中…' : '同步到手表'}
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
          )}
        </section>
      )}
    </div>
  )
}

export default App
