import { useEffect, useState, useCallback, type ChangeEvent } from 'react'
import type { TrainingPlan, PlannedWorkout, WorkoutStep, SyncResult, StepType } from './types'
import './App.css'

// ── Constants ──────────────────────────────────────────────────────────────

const LLM_PRESETS = {
  deepseek: { label: 'DeepSeek',  baseUrl: 'https://api.deepseek.com/v1',                         model: 'deepseek-chat'  },
  qwen:     { label: '通义千问',  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',   model: 'qwen-plus'      },
  moonshot: { label: 'Moonshot',  baseUrl: 'https://api.moonshot.cn/v1',                           model: 'moonshot-v1-8k' },
  custom:   { label: '自定义',    baseUrl: '',                                                      model: ''               },
} as const

const LLM_CONFIG_KEY     = 'garmin-trainer:llm-config'
const GARMIN_SESSION_KEY = 'garmin-trainer:garmin-session'
const SYNC_LOG_KEY       = 'garmin-trainer:sync-log'

const STEP_TYPE_LABELS: Record<StepType, string> = {
  warmup: '热身', interval: '间歇', recovery: '恢复', cooldown: '放松', easy: '轻松跑', rest: '休息',
}

const STEP_BAR_COLORS: Record<StepType, string> = {
  warmup:   '#BFDBFE',
  interval: '#FCA5A5',
  recovery: '#A7F3D0',
  cooldown: '#C7D2FE',
  easy:     '#E5E7EB',
  rest:     '#F3F4F6',
}

// Workout bar: horizontal timeline, width proportional to estimated duration
function WorkoutBar({ steps, height = 7, showLegend = false }: { steps: WorkoutStep[]; height?: number; showLegend?: boolean }) {
  const segs = steps.map(s => {
    const m = s.repeat && s.repeat > 1 ? s.repeat : 1
    return { type: s.type, w: estimateStepDur(s) * m }
  })
  const total = segs.reduce((a, b) => a + b.w, 0)
  if (!total) return null

  // Unique types present (in order)
  const seen = new Set<StepType>()
  segs.forEach(s => seen.add(s.type))

  return (
    <div>
      <div style={{ display: 'flex', height, borderRadius: 3, overflow: 'hidden', gap: 1, marginTop: showLegend ? 0 : 4 }}>
        {segs.map((seg, i) => (
          <div key={i} title={STEP_TYPE_LABELS[seg.type]}
            style={{ flex: seg.w / total, background: STEP_BAR_COLORS[seg.type], minWidth: 3 }} />
        ))}
      </div>
      {showLegend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 6 }}>
          {[...seen].map(t => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--tx-3)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: STEP_BAR_COLORS[t], flexShrink: 0 }} />
              {STEP_TYPE_LABELS[t]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const VALID_STEP_TYPES = new Set<StepType>(['warmup', 'interval', 'recovery', 'cooldown', 'easy', 'rest'])
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

const SAMPLE_TEXT = `周一：轻松跑 8公里，配速 6:00-6:30/km，心率 130-145 bpm
周三：阈值训练 — 热身 2km + 3×8分钟 T 配速（4:55-5:10/km，心率 165-175）+ 组间 90s 慢跑恢复 + 放松 2km
周五：有氧节奏跑 10公里，配速 5:30-5:45/km，心率 150-162
周日：长距离 16公里，配速 6:10-6:40/km，心率 135-148`

const SAMPLE_JSON = JSON.stringify({
  name: "示例训练计划",
  workouts: [{
    date: new Date().toISOString().slice(0, 10),
    title: "阈值间歇",
    steps: [
      { type: "warmup",   distanceMeters: 2000, durationSeconds: 720, targetPace: "6:00/km" },
      { type: "interval", distanceMeters: 1600, durationSeconds: 480, targetPace: "4:55-5:10/km", targetHeartRate: "165-175", repeat: 3 },
      { type: "recovery", distanceMeters:  400, durationSeconds:  90, targetPace: "6:30/km",       repeat: 3 },
      { type: "cooldown", distanceMeters: 2000, durationSeconds: 720, targetPace: "6:00/km" },
    ]
  }]
}, null, 2)

// ── Persistence helpers ────────────────────────────────────────────────────

interface StoredLlmConfig { provider: keyof typeof LLM_PRESETS; baseUrl: string; apiKey: string; model: string }
interface StoredGarminSession { domain: 'garmin.cn' | 'garmin.com'; username: string; session: unknown }
interface SyncLogEntry { workoutId: string; date: string; title: string; planName?: string; syncedAt: string }

const ls = {
  get<T>(k: string): T | null {
    try { const r = localStorage.getItem(k); return r ? (JSON.parse(r) as T) : null } catch { return null }
  },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /**/ } },
  del(k: string) { try { localStorage.removeItem(k) } catch { /**/ } },
}

function appendSyncLog(entries: SyncLogEntry[]) {
  if (!entries.length) return
  const existing = ls.get<SyncLogEntry[]>(SYNC_LOG_KEY) ?? []
  const m = new Map(existing.map(e => [e.workoutId, e]))
  entries.forEach(e => m.set(e.workoutId, e))
  ls.set(SYNC_LOG_KEY, [...m.values()])
}
function removeFromSyncLog(ids: string[]) {
  const s = new Set(ids)
  const existing = ls.get<SyncLogEntry[]>(SYNC_LOG_KEY) ?? []
  ls.set(SYNC_LOG_KEY, existing.filter(e => !s.has(e.workoutId)))
}

// ── VDOT ──────────────────────────────────────────────────────────────────

function estimateVdot(distM: number, timeMin: number): number | null {
  if (distM <= 0 || timeMin <= 0) return null
  const v = distM / timeMin
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * timeMin) + 0.2989558 * Math.exp(-0.1932605 * timeMin)
  const vdot = vo2 / pct
  return Number.isFinite(vdot) && vdot > 0 ? vdot : null
}

function vdotToPaces(vdot: number): { label: string; range: string; color: string; desc: string }[] {
  function velFromPct(pct: number): number {
    const vo2 = pct * vdot
    const a = 0.000104, b = 0.182258, c = -4.6 - vo2
    return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
  }
  function fmtPace(v: number): string {
    const s = 60000 / v
    return `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, '0')}`
  }
  return [
    { label: 'E',  pcts: [0.65, 0.74] as [number,number], color: '#2196F3', desc: '轻松跑 · 心率 1-2 区' },
    { label: 'M',  pcts: [0.75, 0.84] as [number,number], color: '#4CAF50', desc: '马拉松配速 · 心率 3 区' },
    { label: 'T',  pcts: [0.88, 0.92] as [number,number], color: '#FF9800', desc: '乳酸阈值 · 心率 4 区' },
    { label: 'I',  pcts: [0.95, 1.00] as [number,number], color: '#E8590C', desc: '间歇 · 心率 4-5 区' },
    { label: 'R',  pcts: [1.05, 1.10] as [number,number], color: '#9C27B0', desc: '重复冲刺 · 无氧' },
  ].map(z => ({
    label: z.label,
    range: `${fmtPace(velFromPct(z.pcts[1]))}–${fmtPace(velFromPct(z.pcts[0]))}/km`,
    color: z.color,
    desc: z.desc,
  }))
}

const RACE_PRESETS = {
  '5k':   { label: '5 公里',     meters: 5000      },
  '10k':  { label: '10 公里',    meters: 10000     },
  half:   { label: '半程马拉松', meters: 21097.5   },
  full:   { label: '全程马拉松', meters: 42195     },
  custom: { label: '自定义',     meters: 0         },
} as const

// ── Plan validation ────────────────────────────────────────────────────────

function validatePlan(data: unknown): TrainingPlan {
  if (typeof data !== 'object' || data === null) throw new Error('顶层必须是 JSON 对象')
  const plan = data as Record<string, unknown>
  if (typeof plan.name !== 'string') throw new Error('缺少字符串字段 "name"')
  if (!Array.isArray(plan.workouts)) throw new Error('缺少数组字段 "workouts"')
  plan.workouts.forEach((w, wi) => {
    const wo = w as Record<string, unknown>
    if (typeof wo.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(wo.date))
      throw new Error(`workouts[${wi}].date 必须是 YYYY-MM-DD`)
    if (typeof wo.title !== 'string') throw new Error(`workouts[${wi}].title 必须是字符串`)
    if (!Array.isArray(wo.steps)) throw new Error(`workouts[${wi}].steps 必须是数组`)
    ;(wo.steps as Record<string, unknown>[]).forEach((s, si) => {
      if (!VALID_STEP_TYPES.has(s.type as StepType))
        throw new Error(`steps[${wi}][${si}].type 非法：${String(s.type)}`)
      if (s.distanceMeters == null && s.durationSeconds == null)
        throw new Error(`steps[${wi}][${si}] 缺少 distanceMeters 或 durationSeconds`)
    })
  })
  return data as TrainingPlan
}

// ── Duration estimation (P1-2) ─────────────────────────────────────────────

/** Parse "5:30/km", "5:30-5:45/km", "5:30" → avg seconds per km */
function parsePaceToSecPerKm(pace: string): number | null {
  const m = pace.match(/(\d+):(\d{2})(?:\s*[-–]\s*(\d+):(\d{2}))?/)
  if (!m) return null
  const t1 = parseInt(m[1]) * 60 + parseInt(m[2])
  if (m[3] && m[4]) {
    const t2 = parseInt(m[3]) * 60 + parseInt(m[4])
    return (t1 + t2) / 2
  }
  return t1
}

/** Estimate step duration in seconds, using durationSeconds or distance÷pace */
function estimateStepDur(s: WorkoutStep): number {
  if (s.durationSeconds != null) return s.durationSeconds
  if (s.distanceMeters) {
    if (s.targetPace) {
      const sPerKm = parsePaceToSecPerKm(s.targetPace)
      if (sPerKm) return Math.round(s.distanceMeters / 1000 * sPerKm)
    }
    // fallback: ~6 min/km easy pace
    return Math.round(s.distanceMeters / 1000 * 360)
  }
  return 0
}

// ── Totals & formatting ────────────────────────────────────────────────────

function workoutTotals(w: PlannedWorkout) {
  let dur = 0, dist = 0
  for (const s of w.steps) {
    const m = s.repeat && s.repeat > 1 ? s.repeat : 1
    dur  += estimateStepDur(s) * m
    if (s.distanceMeters != null) dist += s.distanceMeters * m
  }
  return { dur, dist }
}

function fmtDur(s: number): string {
  if (!s) return '—'
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m} 分钟`
}
function fmtDist(m: number): string {
  return m ? `${(m / 1000).toFixed(1)} km` : '—'
}
function weekday(date: string): string {
  try { return `周${WEEKDAY[new Date(date + 'T00:00:00').getDay()]}` } catch { return '' }
}

// ── Warnings ──────────────────────────────────────────────────────────────

interface Warning { level: 'info' | 'warn' | 'error'; msg: string }

function computeWarnings(plan: TrainingPlan, hrZones: HrZones): Warning[] {
  const w: Warning[] = []
  const hrEmpty = !Object.values(hrZones).some(v => v.trim())
  const hasHrRef = plan.workouts.some(wo => wo.steps.some(s => s.targetHeartRate && /Z\d/i.test(s.targetHeartRate)))
  if (hasHrRef && hrEmpty)
    w.push({ level: 'warn', msg: '训练步骤包含 Z1-Z5 心率区间引用，但未填写心率区间映射，同步后心率目标将缺失。' })
  const noDate = plan.workouts.filter(wo => !wo.date)
  if (noDate.length)
    w.push({ level: 'warn', msg: `${noDate.length} 个训练没有具体日期，无法自动排期。` })
  plan.workouts.forEach(wo => {
    if (wo.steps.some(s => s.type === 'interval') && !wo.steps.some(s => s.type === 'recovery'))
      w.push({ level: 'info', msg: `「${wo.title}」包含间歇步骤但未找到恢复步骤，请确认恢复方式已涵盖在 notes 里。` })
  })
  const noSteps = plan.workouts.filter(wo => wo.steps.length === 0)
  if (noSteps.length)
    w.push({ level: 'info', msg: `${noSteps.length} 天为休息日（无具体步骤），同步时将跳过。` })
  return w
}

// ── gccli command generation ───────────────────────────────────────────────

function generateCliOutput(plan: TrainingPlan): string {
  const lines: string[] = []
  const active = plan.workouts.filter(wo => wo.steps.length > 0)
  if (!active.length) return '# 无可同步的训练（全部为休息日）'
  lines.push(`# 训练计划：${plan.name}`, `# 共 ${active.length} 个训练日`, '', '# ── 步骤 1：保存 JSON 文件并执行 create 命令 ──', '')
  active.forEach((wo, i) => {
    const slug = `workout-${i + 1}-${wo.date}`
    lines.push(`# ${wo.date} ${weekday(wo.date)} · ${wo.title}`, `cat > ${slug}.json << 'EOF'`, buildWorkoutJson(wo), 'EOF', '', `gccli workouts create --file ${slug}.json`, '')
  })
  lines.push('# ── 步骤 2：执行 schedule 命令 ──', '')
  active.forEach(wo => lines.push(`gccli workouts schedule add <WORKOUT_ID> --date ${wo.date}`))
  return lines.join('\n')
}

function buildWorkoutJson(wo: PlannedWorkout): string {
  return JSON.stringify({
    workoutName: wo.title,
    sportType: { sportTypeId: 1, sportTypeKey: 'running' },
    workoutSegments: [{
      segmentOrder: 1,
      sportType: { sportTypeId: 1, sportTypeKey: 'running' },
      workoutSteps: wo.steps.map((s, i) => ({
        type: 'ExecutableStepDTO',
        stepOrder: i + 1,
        stepType: { stepTypeKey: s.type },
        endCondition: s.distanceMeters != null
          ? { conditionTypeKey: 'distance', conditionValue: s.distanceMeters }
          : { conditionTypeKey: 'time',     conditionValue: s.durationSeconds },
        ...(s.targetPace ? { targetType: { workoutTargetTypeKey: 'pace.zone' }, description: s.targetPace } : {}),
        ...(s.repeat && s.repeat > 1 ? { repeat: s.repeat } : {}),
      }))
    }]
  }, null, 2)
}

// ── Copy hook ─────────────────────────────────────────────────────────────

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key); setTimeout(() => setCopied(null), 1800)
    })
  }, [])
  return { copied, copy }
}

// ── HR zones ──────────────────────────────────────────────────────────────

interface HrZones { z1: string; z2: string; z3: string; z4: string; z5: string }
const DEFAULT_HR: HrZones = { z1: '110-130', z2: '130-150', z3: '150-165', z4: '165-178', z5: '178-190' }

// ══════════════════════════════════════════════════════════════════════════
// App
// ══════════════════════════════════════════════════════════════════════════

export default function App() {

  // ── LLM config ──────────────────────────────────────────────
  const savedLlm = ls.get<StoredLlmConfig>(LLM_CONFIG_KEY)
  const [provider,     setProvider    ] = useState<keyof typeof LLM_PRESETS>(savedLlm?.provider ?? 'deepseek')
  const [baseUrl,      setBaseUrl     ] = useState(savedLlm?.baseUrl  ?? LLM_PRESETS.deepseek.baseUrl)
  const [llmApiKey,    setLlmApiKey   ] = useState(savedLlm?.apiKey   ?? '')
  const [model,        setModel       ] = useState(savedLlm?.model    ?? LLM_PRESETS.deepseek.model)
  const [showSettings, setShowSettings] = useState(!savedLlm?.apiKey)   // open on first visit

  useEffect(() => {
    ls.set(LLM_CONFIG_KEY, { provider, baseUrl, apiKey: llmApiKey, model })
  }, [provider, baseUrl, llmApiKey, model])

  function setPreset(p: keyof typeof LLM_PRESETS) {
    setProvider(p); setBaseUrl(LLM_PRESETS[p].baseUrl); setModel(LLM_PRESETS[p].model)
  }

  // ── Input state ──────────────────────────────────────────────
  const [inputTab,  setInputTab ] = useState<'text' | 'json' | 'vdot'>('text')
  const [inputText, setInputText] = useState('')
  const [hrZones,   setHrZones  ] = useState<HrZones>(DEFAULT_HR)
  const [hrOpen,    setHrOpen   ] = useState(false)
  const hrSetter = (z: keyof HrZones) => (e: ChangeEvent<HTMLInputElement>) =>
    setHrZones(v => ({ ...v, [z]: e.target.value }))

  // VDOT sub-form
  const [raceKey,    setRaceKey   ] = useState<keyof typeof RACE_PRESETS>('10k')
  const [raceKm,     setRaceKm    ] = useState('10')
  const [raceH,      setRaceH     ] = useState('0')
  const [raceM,      setRaceM     ] = useState('50')
  const [raceS,      setRaceS     ] = useState('0')
  const [vdotResult, setVdotResult] = useState<number | null>(null)
  const [genVdot,    setGenVdot   ] = useState('46')
  const [genMode,    setGenMode   ] = useState<'single' | 'week'>('single')
  const [genGoal,    setGenGoal   ] = useState<'aerobic' | 'marathon' | 'threshold' | 'speed'>('aerobic')
  const [genDays,    setGenDays   ] = useState('4')
  const [genKm,      setGenKm     ] = useState('30')

  function handleEstimate() {
    const dm = raceKey === 'custom' ? Number(raceKm) * 1000 : RACE_PRESETS[raceKey].meters
    const tm = Number(raceH) * 60 + Number(raceM) + Number(raceS) / 60
    const v  = estimateVdot(dm, tm)
    setVdotResult(v); if (v) setGenVdot(v.toFixed(1))
  }

  // ── Parse state ──────────────────────────────────────────────
  type ParseStatus = 'idle' | 'loading' | 'success' | 'error'
  const [parseStatus, setParseStatus] = useState<ParseStatus>('idle')
  const [parseError,  setParseError ] = useState<string | null>(null)
  const [plan,        setPlan       ] = useState<TrainingPlan | null>(null)

  // ── Garmin state ─────────────────────────────────────────────
  const savedGarmin = ls.get<StoredGarminSession>(GARMIN_SESSION_KEY)
  const [gDomain,          setGDomain         ] = useState<'garmin.cn' | 'garmin.com'>(savedGarmin?.domain ?? 'garmin.cn')
  const [gUsername,        setGUsername        ] = useState(savedGarmin?.username ?? '')
  const [gPassword,        setGPassword        ] = useState('')
  const [loggedIn,         setLoggedIn         ] = useState(false)
  const [loggingIn,        setLoggingIn        ] = useState(false)
  const [loginError,       setLoginError       ] = useState<string | null>(null)
  const [restoringSession, setRestoringSession ] = useState(!!savedGarmin)
  const [showGarminForm,   setShowGarminForm   ] = useState(false)

  // restore session on mount
  useEffect(() => {
    const saved = ls.get<StoredGarminSession>(GARMIN_SESSION_KEY)
    if (!saved?.session) { setRestoringSession(false); return }
    let cancelled = false
    fetch('/api/garmin/restore', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens: saved.session, domain: saved.domain }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok }) => { if (!cancelled) { if (ok) setLoggedIn(true); else ls.del(GARMIN_SESSION_KEY) } })
      .catch(() => { if (!cancelled) ls.del(GARMIN_SESSION_KEY) })
      .finally(() => { if (!cancelled) setRestoringSession(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogin() {
    setLoggingIn(true); setLoginError(null)
    try {
      const r = await fetch('/api/garmin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: gUsername, password: gPassword, domain: gDomain }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? '登录失败')
      setLoggedIn(true)
      if (d.session) ls.set(GARMIN_SESSION_KEY, { domain: gDomain, username: gUsername, session: d.session })
      setGPassword(''); setShowGarminForm(false)
    } catch (e) { setLoginError(e instanceof Error ? e.message : String(e)) }
    finally { setLoggingIn(false) }
  }
  function handleLogout() { setLoggedIn(false); ls.del(GARMIN_SESSION_KEY); setGPassword('') }

  // ── Sync state ───────────────────────────────────────────────
  const [syncing,     setSyncing    ] = useState(false)
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null)
  const [syncError,   setSyncError  ] = useState<string | null>(null)
  const [undoing,     setUndoing    ] = useState(false)
  const [undoMsg,     setUndoMsg    ] = useState<string | null>(null)
  const [undoError,   setUndoError  ] = useState<string | null>(null)

  async function handleSync() {
    if (!plan) return
    setSyncing(true); setSyncError(null); setSyncResults(null); setUndoMsg(null); setUndoError(null)
    try {
      const r = await fetch('/api/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? '同步失败')
      const results = d.results as SyncResult[]
      setSyncResults(results)
      appendSyncLog(
        results.filter((rr): rr is SyncResult & { workoutId: string } => rr.ok && !!rr.workoutId)
          .map(rr => ({ workoutId: rr.workoutId, date: rr.date, title: rr.title, planName: plan.name, syncedAt: new Date().toISOString() }))
      )
    } catch (e) { setSyncError(e instanceof Error ? e.message : String(e)) }
    finally { setSyncing(false) }
  }

  async function handleUndo() {
    if (!syncResults) return
    const ids = syncResults.filter(r => r.ok && r.workoutId).map(r => r.workoutId as string)
    if (!ids.length) return
    setUndoing(true); setUndoError(null); setUndoMsg(null)
    try {
      const r = await fetch('/api/garmin/delete-workouts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workoutIds: ids }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? '撤销失败')
      const results = d.results as { workoutId: string; ok: boolean; error?: string }[]
      const failed = results.filter(rr => !rr.ok)
      if (failed.length) { setUndoError(`${failed.length} 条删除失败`) }
      else { setUndoMsg(`已删除 ${results.length} 条训练`); removeFromSyncLog(results.map(rr => rr.workoutId)); setSyncResults(null) }
    } catch (e) { setUndoError(e instanceof Error ? e.message : String(e)) }
    finally { setUndoing(false) }
  }

  // ── Parse handlers ────────────────────────────────────────────
  async function doParse(planText: string) {
    if (!planText.trim()) return
    setParseStatus('loading'); setParseError(null); setPlan(null)
    try {
      const r = await fetch('/api/parse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planText, baseUrl, apiKey: llmApiKey, model }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? '解析失败')
      setPlan(validatePlan(d.plan)); setParseStatus('success')
    } catch (e) { setParseError(e instanceof Error ? e.message : String(e)); setParseStatus('error') }
  }

  function doLoadJson(text: string) {
    try { setPlan(validatePlan(JSON.parse(text))); setParseStatus('success') }
    catch (e) { setParseError(e instanceof Error ? e.message : String(e)); setParseStatus('error') }
  }

  async function doGenerate() {
    const vdot = Number(genVdot)
    if (!Number.isFinite(vdot) || vdot <= 0) { setParseError('请输入有效的 VDOT 数值'); setParseStatus('error'); return }
    const goalParams = genMode === 'single'
      ? { mode: 'single' as const, vdot, goal: genGoal }
      : { mode: 'week' as const, vdot, daysPerWeek: Number(genDays) || 4, weeklyDistanceKm: Number(genKm) || 30 }
    setParseStatus('loading'); setParseError(null); setPlan(null)
    try {
      const r = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalParams, baseUrl, apiKey: llmApiKey, model }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? '生成失败')
      setPlan(validatePlan(d.plan)); setParseStatus('success')
    } catch (e) { setParseError(e instanceof Error ? e.message : String(e)); setParseStatus('error') }
  }

  function handleParse() {
    if (inputTab === 'text') doParse(inputText)
    if (inputTab === 'json') doLoadJson(inputText)
    if (inputTab === 'vdot') doGenerate()
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    e.target.files?.[0]?.text().then(t => { setInputText(t); setInputTab('json') })
  }

  // ── UI state ──────────────────────────────────────────────────
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [mobileTab,   setMobileTab  ] = useState<'input' | 'results' | 'output'>('input')
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // ── Derived ───────────────────────────────────────────────────
  const { copied, copy } = useCopy()
  const cliOutput  = plan ? generateCliOutput(plan) : ''
  const warnings   = plan ? computeWarnings(plan, hrZones) : []
  const llmReady   = !!(baseUrl.trim() && llmApiKey.trim() && model.trim())
  const activeWorkouts = plan ? plan.workouts.filter(w => w.steps.length > 0) : []
  const totalDist  = plan ? plan.workouts.reduce((a, w) => a + workoutTotals(w).dist, 0) : 0
  const totalDur   = plan ? plan.workouts.reduce((a, w) => a + workoutTotals(w).dur, 0) : 0

  const parseLabel =
    parseStatus === 'loading' ? (inputTab === 'vdot' ? 'AI 生成中…' : '解析中…') :
    inputTab === 'text' ? '解析训练计划' :
    inputTab === 'json' ? '导入 JSON' : 'AI 生成课表'
  const parseDisabled = parseStatus === 'loading'
    || (!inputText.trim() && inputTab !== 'vdot')
    || (inputTab !== 'json' && !llmReady)

  // ══════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════

  return (
    <>
      {/* ── Settings modal (P0-4) ── */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-card__header">
              <span className="fw-6" style={{ fontSize: 14 }}>大模型接口设置</span>
              <button className="btn--icon" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="modal-card__body gap-10">
              <label className="field">
                <span className="field__label">服务商</span>
                <select value={provider} onChange={e => setPreset(e.target.value as keyof typeof LLM_PRESETS)}>
                  {Object.entries(LLM_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Base URL</span>
                <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" />
              </label>
              <label className="field">
                <span className="field__label">API Key</span>
                <input type="password" value={llmApiKey} onChange={e => setLlmApiKey(e.target.value)} placeholder="sk-…" />
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span className="field__label">模型</span>
                <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder="deepseek-chat" />
              </label>
              {llmReady && (
                <p style={{ fontSize: 11, color: 'var(--success)', marginTop: 4 }}>✓ 接口已配置</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__brand-dot" />
          训练计划导入工具
        </div>
        <div className="app-header__right">
          {plan && (
            <span className="status-badge">
              <span className="status-badge__dot status-badge__dot--on" />
              {activeWorkouts.length} 个训练
            </span>
          )}

          {/* P0-3: Garmin badge → clickable when not connected */}
          {restoringSession ? (
            <span className="status-badge"><span className="status-badge__dot" />恢复会话…</span>
          ) : loggedIn ? (
            <span className="status-badge">
              <span className="status-badge__dot status-badge__dot--on" />
              Garmin · {gUsername}
            </span>
          ) : (
            <button
              className="status-badge status-badge--btn"
              onClick={() => { setShowGarminForm(true); setMobileTab('output') }}
              title="点击连接 Garmin 账号"
            >
              <span className="status-badge__dot" />
              连接 Garmin
            </button>
          )}

          <button className={`btn btn--ghost btn--sm ${!llmReady ? 'btn--warn' : ''}`}
            onClick={() => setShowSettings(v => !v)}>
            ⚙ 设置{!llmReady && ' ①'}
          </button>
        </div>
      </header>

      {/* ── Mobile tab bar ── */}
      <div className="mobile-tabs">
        {(['input', 'results', 'output'] as const).map(t => (
          <button key={t} className={`mobile-tab ${mobileTab === t ? 'mobile-tab--active' : ''}`}
            onClick={() => setMobileTab(t)}>
            {{ input: '输入', results: '解析结果', output: '同步' }[t]}
          </button>
        ))}
      </div>

      {/* ── Main ── */}
      <main className="app-main">

        {/* ════════ LEFT: Input Panel ════════ */}
        <div className={`panel ${mobileTab === 'input' ? 'panel--active' : ''}`}>
          <div className="panel__header">
            <span className="fw-6" style={{ fontSize: 13 }}>训练计划</span>
            <div className="seg">
              {(['text', 'json', 'vdot'] as const).map(t => (
                <button key={t} className={`seg__btn ${inputTab === t ? 'seg__btn--active' : ''}`}
                  onClick={() => setInputTab(t)}>
                  {{ text: '文本', json: 'JSON', vdot: 'AI 生成' }[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="panel__body gap-10">

            {/* TEXT */}
            {inputTab === 'text' && (
              <>
                <textarea rows={16} value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder={'粘贴自然语言训练计划，支持中文/Markdown 表格格式\n\n例：\n周三：阈值训练 — 热身 2km + 3×8min T 配速（4:55-5:10/km）+ 放松 2km'} />
                <button className="btn btn--ghost btn--sm" onClick={() => setInputText(SAMPLE_TEXT)}>
                  加载示例课表
                </button>
              </>
            )}

            {/* JSON */}
            {inputTab === 'json' && (
              <>
                <textarea rows={16} value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder="粘贴符合格式的 JSON，或点击下方按钮上传文件" />
                <div className="row">
                  <button className="btn btn--ghost btn--sm flex1" onClick={() => setInputText(SAMPLE_JSON)}>加载 JSON 示例</button>
                  <label className="btn btn--ghost btn--sm flex1" style={{ textAlign: 'center', cursor: 'pointer', marginBottom: 0 }}>
                    上传文件
                    <input type="file" accept=".json,application/json" onChange={handleFileUpload} style={{ display: 'none' }} />
                  </label>
                </div>
              </>
            )}

            {/* VDOT / AI Generate */}
            {inputTab === 'vdot' && (
              <div className="gap-10">
                <div className="settings-panel gap-10">
                  <span className="section-title">用比赛成绩估算 VDOT</span>
                  <div className="row">
                    <label className="field flex1" style={{ marginBottom: 0 }}>
                      <span className="field__label">距离</span>
                      <select value={raceKey} onChange={e => setRaceKey(e.target.value as keyof typeof RACE_PRESETS)}>
                        {Object.entries(RACE_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </label>
                    {raceKey === 'custom' && (
                      <label className="field" style={{ width: 80, marginBottom: 0 }}>
                        <span className="field__label">公里</span>
                        <input type="number" min={0} step={0.1} value={raceKm} onChange={e => setRaceKm(e.target.value)} />
                      </label>
                    )}
                  </div>
                  <div className="row">
                    {([['时', raceH, setRaceH], ['分', raceM, setRaceM], ['秒', raceS, setRaceS]] as [string, string, (v: string) => void][]).map(
                      ([lbl, val, set]) => (
                        <label key={lbl} className="field flex1" style={{ marginBottom: 0 }}>
                          <span className="field__label">{lbl}</span>
                          <input type="number" min={0} max={lbl === '时' ? undefined : 59} value={val} onChange={e => set(e.target.value)} />
                        </label>
                      )
                    )}
                  </div>
                  <button className="btn btn--secondary btn--sm" onClick={handleEstimate}>估算 VDOT</button>
                  {vdotResult !== null && (
                    <>
                      <p style={{ fontSize: 12, color: 'var(--success)', marginBottom: 8 }}>
                        VDOT ≈ <strong>{vdotResult.toFixed(1)}</strong> — 已填入下方
                      </p>
                      <div className="vdot-paces">
                        {vdotToPaces(vdotResult).map(z => (
                          <div key={z.label} className="vdot-pace-row">
                            <span className="vdot-pace-label" style={{ color: z.color }}>{z.label}</span>
                            <span className="vdot-pace-range">{z.range}</span>
                            <span className="vdot-pace-desc">{z.desc}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <label className="field">
                  <span className="field__label">当前 VDOT</span>
                  <input type="number" step={0.1} value={genVdot} onChange={e => setGenVdot(e.target.value)} placeholder="46.5" />
                </label>
                <label className="field">
                  <span className="field__label">生成类型</span>
                  <select value={genMode} onChange={e => setGenMode(e.target.value as 'single' | 'week')}>
                    <option value="single">单次训练</option>
                    <option value="week">一周计划</option>
                  </select>
                </label>
                {genMode === 'single' ? (
                  <label className="field">
                    <span className="field__label">训练目的</span>
                    <select value={genGoal} onChange={e => setGenGoal(e.target.value as typeof genGoal)}>
                      <option value="aerobic">有氧耐力（E 配速，心率 2 区）</option>
                      <option value="marathon">马拉松配速（M 配速）</option>
                      <option value="threshold">乳酸阈值（T 配速）</option>
                      <option value="speed">无氧 / 速度（I/R 配速）</option>
                    </select>
                  </label>
                ) : (
                  <>
                    <label className="field">
                      <span className="field__label">每周训练天数</span>
                      <input type="number" min={1} max={7} value={genDays} onChange={e => setGenDays(e.target.value)} />
                    </label>
                    <label className="field">
                      <span className="field__label">当前周跑量（km）</span>
                      <input type="number" min={0} value={genKm} onChange={e => setGenKm(e.target.value)} />
                    </label>
                  </>
                )}
                {!llmReady && (
                  <p style={{ fontSize: 11, color: 'var(--warn)' }}>
                    请先点右上角「⚙ 设置」填写大模型接口
                  </p>
                )}
              </div>
            )}

            {/* HR zones (collapsible) */}
            <div>
              <div className="collapsible__trigger" onClick={() => setHrOpen(v => !v)}>
                <span>心率区间映射（可选）</span>
                <span className={`collapsible__caret ${hrOpen ? 'collapsible__caret--open' : ''}`}>▼</span>
              </div>
              {hrOpen && (
                <div className="collapsible__body">
                  <p style={{ fontSize: 11, color: 'var(--tx-3)', marginBottom: 8 }}>
                    如训练步骤中包含 Z1-Z5 心率区间标注，填写映射后同步时将自动换算为 bpm 数值。
                  </p>
                  <div className="hr-grid">
                    {(['z1', 'z2', 'z3', 'z4', 'z5'] as const).map(z => (
                      <div className="hr-zone" key={z}>
                        <span className={`hr-zone__label ${z}`}>{z.toUpperCase()}</span>
                        <input type="text" value={hrZones[z]} onChange={hrSetter(z)} placeholder="110-130" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Parse button (P2-1: primary style = high visual weight) */}
            <button className="btn btn--primary" onClick={handleParse} disabled={parseDisabled}>
              {parseLabel}
            </button>
            {parseStatus === 'error' && parseError && (
              <div className="warn-item warn-item--error">
                <span className="warn-item__icon">✕</span>
                {parseError}
              </div>
            )}
          </div>
        </div>

        {/* ════════ CENTER: Results Panel ════════ */}
        <div className={`panel ${mobileTab === 'results' ? 'panel--active' : ''}`} style={{ background: 'var(--bg-subtle)' }}>
          <div className="panel__header">
            <span className="fw-6" style={{ fontSize: 13 }}>解析结果</span>
            {plan && (
              <div className="plan-stats">
                <span>{activeWorkouts.length} 训练日</span>
                <span className="plan-stats__sep">·</span>
                <span>{fmtDist(totalDist)}</span>
                {totalDur > 0 && (
                  <>
                    <span className="plan-stats__sep">·</span>
                    <span>约 {fmtDur(totalDur)}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {!plan ? (
            <div className="panel__body">
              <div className="empty">
                <span className="empty__icon">📋</span>
                <span className="empty__title">暂无解析结果</span>
                <span className="empty__sub">在左侧粘贴训练计划，或切换到「AI 生成」标签</span>
              </div>
            </div>
          ) : (
            <>
              {warnings.length > 0 && (
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <ul className="warnings-list">
                    {warnings.map((w, i) => (
                      <li key={i} className={`warn-item warn-item--${w.level}`}>
                        <span className="warn-item__icon">{w.level === 'error' ? '✕' : w.level === 'warn' ? '⚠' : 'ℹ'}</span>
                        {w.msg}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="panel__body" style={{ padding: 0 }}>
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>训练</th>
                      <th>距离</th>
                      <th>约时</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.workouts.map((wo, wi) => {
                      const { dur, dist } = workoutTotals(wo)
                      const isRest = wo.steps.length === 0
                      const expanded = expandedRow === wi
                      return [
                        <tr key={`row-${wi}`}
                          className={`row--data ${expanded ? 'row--expanded' : ''}`}
                          onClick={() => !isRest && setExpandedRow(expanded ? null : wi)}>
                          <td>
                            <div className="cell-date">{wo.date}</div>
                            <div className="cell-day">{weekday(wo.date)}</div>
                          </td>
                          <td>
                            {isRest ? (
                              <span style={{ color: 'var(--tx-4)', fontStyle: 'italic', fontSize: 12 }}>休息日</span>
                            ) : (
                              <>
                                <span className="cell-title">{wo.title}</span>
                                <WorkoutBar steps={wo.steps} />
                              </>
                            )}
                          </td>
                          <td className="cell-mono">{fmtDist(dist)}</td>
                          <td className="cell-mono">{fmtDur(dur)}</td>
                          <td style={{ textAlign: 'center', width: 28 }}>
                            {!isRest && (
                              <button className="btn--icon" onClick={e => { e.stopPropagation(); setExpandedRow(expanded ? null : wi) }}>
                                {expanded ? '▲' : '▼'}
                              </button>
                            )}
                          </td>
                        </tr>,
                        expanded && !isRest && (
                          <tr key={`detail-${wi}`}>
                            <td colSpan={5} style={{ padding: 0 }}>
                              <div className="steps-detail">
                                {/* P1-4: bar + legend in expanded view */}
                                <WorkoutBar steps={wo.steps} height={14} showLegend />
                                <table style={{ marginTop: 12 }}>
                                  <thead>
                                    <tr>
                                      <th>类型</th>
                                      <th>距离</th>
                                      <th>时长</th>
                                      <th>配速</th>
                                      <th>心率</th>
                                      <th>重复</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {wo.steps.map((s, si) => (
                                      <tr key={si}>
                                        <td><span className={`badge badge--${s.type}`}>{STEP_TYPE_LABELS[s.type]}</span></td>
                                        <td className="text-mono">{s.distanceMeters != null ? `${s.distanceMeters}m` : '—'}</td>
                                        <td className="text-mono">{s.durationSeconds != null ? fmtDur(s.durationSeconds) : <span style={{ color: 'var(--tx-4)' }}>~{fmtDur(estimateStepDur(s))}</span>}</td>
                                        <td className="text-mono">{s.targetPace ?? '—'}</td>
                                        <td className="text-mono">{s.targetHeartRate ?? '—'}</td>
                                        <td className="text-mono">{s.repeat && s.repeat > 1 ? `×${s.repeat}` : '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )
                      ]
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ════════ RIGHT: Sync Panel (P0-1) ════════ */}
        <div className={`panel ${mobileTab === 'output' ? 'panel--active' : ''}`}>
          <div className="panel__header">
            <span className="fw-6" style={{ fontSize: 13 }}>推送到 Garmin</span>
          </div>

          <div className="panel__body gap-10">

            {/* ── Garmin connection area ── */}
            {restoringSession ? (
              <div className="sync-connect-row">
                <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>正在恢复 Garmin 会话…</span>
              </div>
            ) : loggedIn && !showGarminForm ? (
              <>
                <div className="sync-connect-row">
                  <span className="sync-connected-label">
                    <span style={{ color: 'var(--success)' }}>●</span> {gUsername}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn--ghost btn--sm" onClick={() => setShowGarminForm(true)}>切换账号</button>
                    <button className="btn btn--ghost btn--sm" onClick={handleLogout}>退出</button>
                  </div>
                </div>

                {/* P0-1: BIG sync button */}
                <button
                  className="btn btn--primary btn--sync"
                  onClick={handleSync}
                  disabled={syncing || !plan || activeWorkouts.length === 0}
                >
                  {syncing ? (
                    <><span className="spin">⟳</span> 同步中…</>
                  ) : (
                    `同步到 Garmin${plan ? ` (${activeWorkouts.length} 个训练)` : ''}`
                  )}
                </button>

                {syncError && (
                  <div className="warn-item warn-item--error"><span className="warn-item__icon">✕</span>{syncError}</div>
                )}

                {syncResults && (
                  <div className="sync-results gap-10">
                    <ul className="warnings-list">
                      {syncResults.map((r, i) => (
                        <li key={i} className={`warn-item warn-item--${r.ok ? 'info' : 'error'}`}>
                          <span className="warn-item__icon">{r.ok ? '✓' : '✕'}</span>
                          {r.date} · {r.title}：{r.ok ? '已同步' : r.error}
                        </li>
                      ))}
                    </ul>
                    {syncResults.some(r => r.ok && r.workoutId) && (
                      <>
                        <button className="btn btn--ghost btn--sm" onClick={handleUndo} disabled={undoing}>
                          {undoing ? '撤销中…' : '撤销本次同步'}
                        </button>
                        {undoMsg   && <p style={{ fontSize: 12, color: 'var(--success)' }}>{undoMsg}</p>}
                        {undoError && <div className="warn-item warn-item--error"><span>✕</span>{undoError}</div>}
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* P0-3: Login form – shown when not connected or switching account */
              <div className="sync-area gap-10">
                {loggedIn && (
                  <p style={{ fontSize: 12 }}>
                    切换账号（当前：{gUsername}）
                    <a href="#" onClick={e => { e.preventDefault(); setShowGarminForm(false) }} style={{ marginLeft: 8 }}>取消</a>
                  </p>
                )}
                <label className="field">
                  <span className="field__label">账号区域</span>
                  <select value={gDomain} onChange={e => setGDomain(e.target.value as 'garmin.cn' | 'garmin.com')}>
                    <option value="garmin.cn">中国区（garmin.cn）</option>
                    <option value="garmin.com">国际区（garmin.com）</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">账号</span>
                  <input type="text" value={gUsername} onChange={e => setGUsername(e.target.value)} placeholder="yourname@email.com" />
                </label>
                <label className="field" style={{ marginBottom: 0 }}>
                  <span className="field__label">密码</span>
                  <input type="password" value={gPassword} onChange={e => setGPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !loggingIn && gUsername && gPassword && handleLogin()} />
                </label>
                <button className="btn btn--primary" onClick={handleLogin}
                  disabled={loggingIn || !gUsername || !gPassword}>
                  {loggingIn ? '登录中…' : '登录 Garmin'}
                </button>
                {loginError && <div className="warn-item warn-item--error"><span className="warn-item__icon">✕</span>{loginError}</div>}
              </div>
            )}

            {/* ── Training preview (P0-1) ── */}
            {plan && activeWorkouts.length > 0 && (
              <>
                <div className="divider" />
                <span className="section-title">训练预览</span>
                <div className="sync-preview">
                  {activeWorkouts.map((wo, i) => (
                    <div key={i} className="sync-preview-item">
                      <div className="sync-preview-meta">
                        <span className="sync-preview-date">{wo.date} {weekday(wo.date)}</span>
                        <span className="sync-preview-title">{wo.title}</span>
                      </div>
                      <div className="sync-preview-stats">
                        <span>{fmtDist(workoutTotals(wo).dist)}</span>
                        <span style={{ color: 'var(--tx-4)' }}>·</span>
                        <span>{fmtDur(workoutTotals(wo).dur)}</span>
                      </div>
                      <WorkoutBar steps={wo.steps} height={5} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {!plan && !loggedIn && (
              <div className="empty" style={{ minHeight: 100 }}>
                <span className="empty__icon">⚡</span>
                <span className="empty__title">等待训练计划</span>
                <span className="empty__sub">在左侧解析或生成计划，然后同步到 Garmin</span>
              </div>
            )}

            {/* P0-2: Advanced / manual import (collapsible) */}
            {plan && (
              <>
                <div className="divider" />
                <div className="collapsible__trigger" onClick={() => setAdvancedOpen(v => !v)}>
                  <span>高级 / 手动导入（gccli）</span>
                  <span className={`collapsible__caret ${advancedOpen ? 'collapsible__caret--open' : ''}`}>▼</span>
                </div>
                {advancedOpen && (
                  <div className="collapsible__body gap-10">
                    {/* Pre-flight checklist */}
                    <ul className="checklist">
                      <li>
                        <span className={`chk-icon ${activeWorkouts.length > 0 ? 'chk-ok' : 'chk-off'}`}>
                          {activeWorkouts.length > 0 ? '✓' : '○'}
                        </span>
                        至少有 1 个包含步骤的训练日
                      </li>
                      <li>
                        <span className={`chk-icon ${plan.workouts.every(w => w.date) ? 'chk-ok' : 'chk-warn'}`}>
                          {plan.workouts.every(w => w.date) ? '✓' : '⚠'}
                        </span>
                        所有训练日包含具体日期
                      </li>
                      <li>
                        <span className={`chk-icon ${plan.workouts.flatMap(w => w.steps).every(s => s.targetPace || s.targetHeartRate) ? 'chk-ok' : 'chk-warn'}`}>
                          {plan.workouts.flatMap(w => w.steps).every(s => s.targetPace || s.targetHeartRate) ? '✓' : '⚠'}
                        </span>
                        所有步骤包含配速或心率目标
                      </li>
                    </ul>
                    <div className="code-block">
                      <div className="code-block__header">
                        <span className="code-block__label">bash</span>
                        <button className={`code-block__copy ${copied === 'cli' ? 'code-block__copy--ok' : ''}`}
                          onClick={() => copy(cliOutput, 'cli')}>
                          {copied === 'cli' ? '已复制 ✓' : '复制全部'}
                        </button>
                      </div>
                      <pre>{cliOutput}</pre>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      </main>
    </>
  )
}
