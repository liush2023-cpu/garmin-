import { useEffect, useState, useCallback, type ChangeEvent } from 'react'
import type { TrainingPlan, PlannedWorkout, WorkoutStep, SyncResult, StepType } from './types'
import './App.css'

// ── Constants ──────────────────────────────────────────────────────────────

const LLM_PRESETS = {
  deepseek: { label: 'DeepSeek',  baseUrl: 'https://api.deepseek.com/v1',                        model: 'deepseek-chat'  },
  qwen:     { label: '通义千问',  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',  model: 'qwen-plus'      },
  moonshot: { label: 'Moonshot',  baseUrl: 'https://api.moonshot.cn/v1',                          model: 'moonshot-v1-8k' },
  custom:   { label: '自定义',    baseUrl: '',                                                     model: ''               },
} as const

const LLM_CONFIG_KEY     = 'garmin-trainer:llm-config'
const GARMIN_SESSION_KEY = 'garmin-trainer:garmin-session'
const SYNC_LOG_KEY       = 'garmin-trainer:sync-log'

const STEP_TYPE_LABELS: Record<StepType, string> = {
  warmup: '热身', interval: '间歇', recovery: '恢复', cooldown: '放松', easy: '轻松跑', rest: '休息',
}

// Semantic bar colors: gray=rest, green=easy/recovery, blue=aerobic, red=high-intensity
const STEP_BAR_COLORS: Record<StepType, string> = {
  warmup:   '#BFDBFE',   // blue  – aerobic
  interval: '#FCA5A5',   // red   – high intensity
  recovery: '#BBF7D0',   // green – recovery
  cooldown: '#BFDBFE',   // blue  – aerobic
  easy:     '#BBF7D0',   // green – easy
  rest:     '#E5E7EB',   // gray  – rest
}

const VALID_STEP_TYPES = new Set<StepType>(['warmup', 'interval', 'recovery', 'cooldown', 'easy', 'rest'])
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

// ── Workout classification ─────────────────────────────────────────────────

type WorkoutCategory = 'rest' | 'easy' | 'aerobic' | 'lsd' | 'threshold' | 'speed' | 'strength' | 'core'
type IntensityLevel  = 'rest' | 'recovery' | 'easy' | 'moderate' | 'hard'

const CAT_CONFIG: Record<WorkoutCategory, { label: string; color: string; bg: string }> = {
  rest:      { label: '休息日',   color: '#9CA3AF', bg: '#F9FAFB' },
  easy:      { label: '轻松跑',   color: '#15803D', bg: '#DCFCE7' },
  aerobic:   { label: '有氧跑',   color: '#1D4ED8', bg: '#DBEAFE' },
  lsd:       { label: '长距离',   color: '#6D28D9', bg: '#EDE9FE' },
  threshold: { label: '阈值跑',   color: '#B91C1C', bg: '#FEE2E2' },
  speed:     { label: '速度跑',   color: '#C2410C', bg: '#FFEDD5' },
  strength:  { label: '力量训练', color: '#374151', bg: '#F3F4F6' },
  core:      { label: '核心训练', color: '#92400E', bg: '#FEF3C7' },
}

const INT_CONFIG: Record<IntensityLevel, { label: string; dot: string }> = {
  rest:     { label: '休息',   dot: '#9CA3AF' },
  recovery: { label: '恢复',   dot: '#16A34A' },
  easy:     { label: '轻松',   dot: '#22C55E' },
  moderate: { label: '中等',   dot: '#3B82F6' },
  hard:     { label: '高强度', dot: '#EF4444' },
}

// ── Storage ────────────────────────────────────────────────────────────────

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
  ls.set(SYNC_LOG_KEY, (ls.get<SyncLogEntry[]>(SYNC_LOG_KEY) ?? []).filter(e => !s.has(e.workoutId)))
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

function vdotToPaces(vdot: number) {
  function vel(pct: number) {
    const vo2 = pct * vdot, a = 0.000104, b = 0.182258, c = -4.6 - vo2
    return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
  }
  function fp(v: number) {
    const s = 60000 / v; return `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, '0')}`
  }
  return [
    { label: 'E', pcts: [0.65, 0.74] as [number,number], color: '#2196F3', desc: '轻松跑 · 心率 1-2 区' },
    { label: 'M', pcts: [0.75, 0.84] as [number,number], color: '#4CAF50', desc: '马拉松配速 · 心率 3 区' },
    { label: 'T', pcts: [0.88, 0.92] as [number,number], color: '#FF9800', desc: '乳酸阈值 · 心率 4 区' },
    { label: 'I', pcts: [0.95, 1.00] as [number,number], color: '#E8590C', desc: '间歇 · 心率 4-5 区' },
    { label: 'R', pcts: [1.05, 1.10] as [number,number], color: '#9C27B0', desc: '重复冲刺 · 无氧' },
  ].map(z => ({ label: z.label, range: `${fp(vel(z.pcts[1]))}–${fp(vel(z.pcts[0]))}/km`, color: z.color, desc: z.desc }))
}

const RACE_PRESETS = {
  '5k':   { label: '5 公里',     meters: 5000      },
  '10k':  { label: '10 公里',    meters: 10000     },
  half:   { label: '半程马拉松', meters: 21097.5   },
  full:   { label: '全程马拉松', meters: 42195     },
  custom: { label: '自定义',     meters: 0         },
} as const

// ── Validation ────────────────────────────────────────────────────────────

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

// ── Duration estimation ────────────────────────────────────────────────────

function parsePaceToSecPerKm(pace: string): number | null {
  const m = pace.match(/(\d+):(\d{2})(?:\s*[-–]\s*(\d+):(\d{2}))?/)
  if (!m) return null
  const t1 = parseInt(m[1]) * 60 + parseInt(m[2])
  if (m[3] && m[4]) return (t1 + parseInt(m[3]) * 60 + parseInt(m[4])) / 2
  return t1
}

function estimateStepDur(s: WorkoutStep): number {
  if (s.durationSeconds != null) return s.durationSeconds
  if (s.distanceMeters) {
    if (s.targetPace) {
      const spk = parsePaceToSecPerKm(s.targetPace)
      if (spk) return Math.round(s.distanceMeters / 1000 * spk)
    }
    return Math.round(s.distanceMeters / 1000 * 360) // fallback 6min/km
  }
  return 0
}

// ── Totals ────────────────────────────────────────────────────────────────

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
  return h ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}分`
}
function fmtDist(m: number): string { return m ? `${(m / 1000).toFixed(1)}km` : '—' }
function weekday(date: string): string {
  try { return `周${WEEKDAY[new Date(date + 'T00:00:00').getDay()]}` } catch { return '' }
}

// ── Workout classification ─────────────────────────────────────────────────

function classifyWorkout(wo: PlannedWorkout): WorkoutCategory {
  if (wo.steps.length === 0) return 'rest'
  const text = (wo.title + ' ' + wo.steps.map(s => s.notes ?? '').join(' ')).toLowerCase()
  if (/力量|举重|gym/.test(text)) return 'strength'
  if (/核心|core|plank/.test(text)) return 'core'
  if (/长距|lsd|long.?run/.test(text)) return 'lsd'
  if (/阈值|tempo|threshold/.test(text)) return 'threshold'
  if (/间歇|interval|速度|speed/.test(text)) return 'speed'
  if (/恢复|recovery/.test(text)) return 'easy'
  if (/有氧|aerobic|节奏/.test(text)) return 'aerobic'
  if (/轻松|easy|慢跑/.test(text)) return 'easy'
  const hasInterval = wo.steps.some(s => s.type === 'interval')
  if (hasInterval) return 'threshold'
  const { dist } = workoutTotals(wo)
  if (dist >= 15000) return 'lsd'
  if (dist >= 8000)  return 'aerobic'
  return 'easy'
}

function getIntensity(cat: WorkoutCategory): IntensityLevel {
  if (cat === 'rest') return 'rest'
  if (cat === 'easy') return 'easy'
  if (cat === 'aerobic' || cat === 'lsd') return 'moderate'
  if (cat === 'threshold' || cat === 'speed') return 'hard'
  return 'moderate'
}

function getWorkoutIssues(wo: PlannedWorkout): string[] {
  const issues: string[] = []
  if (wo.steps.some(s => s.type === 'interval') && !wo.steps.some(s => s.type === 'recovery'))
    issues.push('包含间歇但缺少恢复步骤')
  const noTarget = wo.steps.filter(s => !s.targetPace && !s.targetHeartRate && s.type !== 'rest')
  if (noTarget.length) issues.push(`${noTarget.length} 个步骤缺少配速/心率目标`)
  return issues
}

// ── Warnings ──────────────────────────────────────────────────────────────

interface Warning { level: 'info' | 'warn' | 'error'; msg: string }

function computeWarnings(plan: TrainingPlan, hrZones: HrZones): Warning[] {
  const w: Warning[] = []
  const hrEmpty = !Object.values(hrZones).some(v => v.trim())
  if (plan.workouts.some(wo => wo.steps.some(s => s.targetHeartRate && /Z\d/i.test(s.targetHeartRate))) && hrEmpty)
    w.push({ level: 'warn', msg: '训练步骤包含 Z1-Z5 心率区间引用，但未填写心率区间映射，同步后心率目标将缺失。' })
  const noDate = plan.workouts.filter(wo => !wo.date)
  if (noDate.length)
    w.push({ level: 'warn', msg: `${noDate.length} 个训练没有具体日期，无法自动排期。` })
  plan.workouts.forEach(wo => {
    if (wo.steps.some(s => s.type === 'interval') && !wo.steps.some(s => s.type === 'recovery'))
      w.push({ level: 'warn', msg: `「${wo.title}」包含间歇步骤但未找到恢复步骤，请同步前确认。` })
  })
  return w
}

// ── gccli generation ──────────────────────────────────────────────────────

function generateCliOutput(plan: TrainingPlan): string {
  const active = plan.workouts.filter(wo => wo.steps.length > 0)
  if (!active.length) return '# 无可同步的训练（全部为休息日）'
  const lines = [
    `# 训练计划：${plan.name}  共 ${active.length} 个训练日`, '',
    '# ── 步骤 1：保存 JSON 文件并执行 create 命令 ──', '',
  ]
  active.forEach((wo, i) => {
    const slug = `workout-${i + 1}-${wo.date}`
    lines.push(`# ${wo.date} ${weekday(wo.date)} · ${wo.title}`)
    lines.push(`cat > ${slug}.json << 'EOF'`)
    lines.push(buildWorkoutJson(wo))
    lines.push('EOF', '', `gccli workouts create --file ${slug}.json`, '')
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
        type: 'ExecutableStepDTO', stepOrder: i + 1,
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
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1800) })
  }, [])
  return { copied, copy }
}

// ── HR zones ──────────────────────────────────────────────────────────────

interface HrZones { z1: string; z2: string; z3: string; z4: string; z5: string }
const DEFAULT_HR: HrZones = { z1: '110-130', z2: '130-150', z3: '150-165', z4: '165-178', z5: '178-190' }

// ── Sample data ───────────────────────────────────────────────────────────

const SAMPLE_TEXT = `周一：轻松跑 8公里，配速 6:00-6:30/km，心率 130-145 bpm
周三：阈值训练 — 热身 2km + 3×8分钟 T 配速（4:55-5:10/km，心率 165-175）+ 组间 90s 慢跑恢复 + 放松 2km
周五：有氧节奏跑 10公里，配速 5:30-5:45/km，心率 150-162
周日：长距离 16公里，配速 6:10-6:40/km，心率 135-148`

const SAMPLE_JSON = JSON.stringify({
  name: "示例训练计划",
  workouts: [{
    date: new Date().toISOString().slice(0, 10), title: "阈值间歇",
    steps: [
      { type: "warmup",   distanceMeters: 2000, durationSeconds: 720, targetPace: "6:00/km" },
      { type: "interval", distanceMeters: 1600, durationSeconds: 480, targetPace: "4:55-5:10/km", targetHeartRate: "165-175", repeat: 3 },
      { type: "recovery", distanceMeters:  400, durationSeconds:  90, targetPace: "6:30/km", repeat: 3 },
      { type: "cooldown", distanceMeters: 2000, durationSeconds: 720, targetPace: "6:00/km" },
    ]
  }]
}, null, 2)

// ── WorkoutBar ────────────────────────────────────────────────────────────

function WorkoutBar({ steps, height = 6, showLegend = false }: { steps: WorkoutStep[]; height?: number; showLegend?: boolean }) {
  const segs = steps.map(s => ({ type: s.type, w: estimateStepDur(s) * (s.repeat && s.repeat > 1 ? s.repeat : 1) }))
  const total = segs.reduce((a, b) => a + b.w, 0)
  if (!total) return null
  const seen = [...new Set(segs.map(s => s.type))]
  return (
    <div>
      <div style={{ display: 'flex', height, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
        {segs.map((seg, i) => (
          <div key={i} title={STEP_TYPE_LABELS[seg.type]}
            style={{ flex: seg.w / total, background: STEP_BAR_COLORS[seg.type], minWidth: 3 }} />
        ))}
      </div>
      {showLegend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginTop: 5 }}>
          {seen.map(t => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--tx-4)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: STEP_BAR_COLORS[t], flexShrink: 0 }} />
              {STEP_TYPE_LABELS[t]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Step detail (structured, not table) ───────────────────────────────────

function StepDetail({ steps }: { steps: WorkoutStep[] }) {
  // Group adjacent steps with same repeat value
  const groups: Array<{ steps: WorkoutStep[]; repeat: number }> = []
  let i = 0
  while (i < steps.length) {
    const s = steps[i]
    const rep = s.repeat && s.repeat > 1 ? s.repeat : 1
    if (rep > 1) {
      const grp = [s]; let j = i + 1
      while (j < steps.length && steps[j].repeat === rep) { grp.push(steps[j]); j++ }
      groups.push({ steps: grp, repeat: rep }); i = j
    } else {
      groups.push({ steps: [s], repeat: 1 }); i++
    }
  }
  function fmtStep(s: WorkoutStep) {
    const parts = []
    if (s.distanceMeters != null) parts.push(s.distanceMeters >= 1000 ? `${(s.distanceMeters / 1000).toFixed(1)}km` : `${s.distanceMeters}m`)
    const dur = s.durationSeconds != null ? s.durationSeconds : (s.distanceMeters && s.targetPace ? estimateStepDur(s) : 0)
    if (dur) parts.push(s.durationSeconds != null ? fmtDur(dur) : `约${fmtDur(dur)}`)
    if (s.targetPace) parts.push(s.targetPace)
    return parts.join(' · ')
  }
  return (
    <div className="step-detail">
      {groups.map((g, gi) => (
        <div key={gi} className={`step-group ${g.repeat > 1 ? 'step-group--repeat' : ''}`}>
          {g.repeat > 1 && <div className="step-group__repeat">× {g.repeat}</div>}
          <div className={`step-group__rows ${g.repeat > 1 ? 'step-group__rows--indented' : ''}`}>
            {g.steps.map((s, si) => (
              <div key={si} className="step-row">
                <span className={`badge badge--${s.type}`}>{STEP_TYPE_LABELS[s.type]}</span>
                <span className="step-row__info">{fmtStep(s)}</span>
                {s.targetHeartRate && (
                  <span className="step-row__hr">♥ {s.targetHeartRate}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

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
  const [showSettings, setShowSettings] = useState(!savedLlm?.apiKey)

  useEffect(() => {
    ls.set(LLM_CONFIG_KEY, { provider, baseUrl, apiKey: llmApiKey, model })
  }, [provider, baseUrl, llmApiKey, model])

  function setPreset(p: keyof typeof LLM_PRESETS) {
    setProvider(p); setBaseUrl(LLM_PRESETS[p].baseUrl); setModel(LLM_PRESETS[p].model)
  }

  // ── Input ────────────────────────────────────────────────────
  const [inputTab,      setInputTab     ] = useState<'text' | 'json' | 'vdot'>('text')
  const [inputText,     setInputText    ] = useState('')
  const [inputCollapsed, setInputCollapsed] = useState(false)   // collapses after parse
  const [hrZones,       setHrZones      ] = useState<HrZones>(DEFAULT_HR)
  const [hrOpen,        setHrOpen       ] = useState(false)
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
    const v = estimateVdot(dm, tm)
    setVdotResult(v); if (v) setGenVdot(v.toFixed(1))
  }

  // ── Parse ────────────────────────────────────────────────────
  type ParseStatus = 'idle' | 'loading' | 'success' | 'error'
  const [parseStatus, setParseStatus] = useState<ParseStatus>('idle')
  const [parseError,  setParseError ] = useState<string | null>(null)
  const [plan,        setPlan       ] = useState<TrainingPlan | null>(null)

  // ── Garmin ───────────────────────────────────────────────────
  const savedGarmin = ls.get<StoredGarminSession>(GARMIN_SESSION_KEY)
  const [gDomain,          setGDomain         ] = useState<'garmin.cn' | 'garmin.com'>(savedGarmin?.domain ?? 'garmin.cn')
  const [gUsername,        setGUsername        ] = useState(savedGarmin?.username ?? '')
  const [gPassword,        setGPassword        ] = useState('')
  const [loggedIn,         setLoggedIn         ] = useState(false)
  const [loggingIn,        setLoggingIn        ] = useState(false)
  const [loginError,       setLoginError       ] = useState<string | null>(null)
  const [restoringSession, setRestoringSession ] = useState(!!savedGarmin)
  const [showGarminForm,   setShowGarminForm   ] = useState(false)

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

  // ── Sync ─────────────────────────────────────────────────────
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
      setPlan(validatePlan(d.plan)); setParseStatus('success'); setInputCollapsed(true)
    } catch (e) { setParseError(e instanceof Error ? e.message : String(e)); setParseStatus('error') }
  }
  function doLoadJson(text: string) {
    try { setPlan(validatePlan(JSON.parse(text))); setParseStatus('success'); setInputCollapsed(true) }
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
      setPlan(validatePlan(d.plan)); setParseStatus('success'); setInputCollapsed(true)
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

  // ── UI state ─────────────────────────────────────────────────
  const [expandedRow,  setExpandedRow  ] = useState<number | null>(null)
  const [mobileTab,    setMobileTab    ] = useState<'input' | 'results' | 'output'>('input')
  const [advancedOpen, setAdvancedOpen ] = useState(false)

  // ── Derived ───────────────────────────────────────────────────
  const { copied, copy } = useCopy()
  const cliOutput      = plan ? generateCliOutput(plan) : ''
  const warnings       = plan ? computeWarnings(plan, hrZones) : []
  const llmReady       = !!(baseUrl.trim() && llmApiKey.trim() && model.trim())
  const activeWorkouts = plan ? plan.workouts.filter(w => w.steps.length > 0) : []
  const totalDist      = plan ? plan.workouts.reduce((a, w) => a + workoutTotals(w).dist, 0) : 0
  const totalDur       = plan ? plan.workouts.reduce((a, w) => a + workoutTotals(w).dur, 0) : 0
  const problemCount   = plan ? plan.workouts.filter(wo => getWorkoutIssues(wo).length > 0).length : 0

  const parseLabel = parseStatus === 'loading'
    ? (inputTab === 'vdot' ? 'AI 生成中…' : '解析中…')
    : inputTab === 'json' ? '导入 JSON'
    : inputTab === 'vdot' ? 'AI 生成课表'
    : '解析训练计划'
  const parseDisabled = parseStatus === 'loading'
    || (!inputText.trim() && inputTab !== 'vdot')
    || (inputTab !== 'json' && !llmReady)

  // ══════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════
  return (
    <>
      {/* ── Settings modal ── */}
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
              {llmReady && <p style={{ fontSize: 11, color: 'var(--success)', marginTop: 4 }}>✓ 接口已配置</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="app-header">
        {/* Left: brand */}
        <div className="app-header__brand">
          <span className="app-header__brand-dot" />
          训练计划导入工具
        </div>

        {/* Center: plan summary (appears after parse) */}
        {plan && (
          <div className="header-summary">
            <span className="header-summary__item">{activeWorkouts.length} 个训练</span>
            <span className="header-summary__sep">·</span>
            <span className="header-summary__item">{fmtDist(totalDist)}</span>
            {totalDur > 0 && (
              <>
                <span className="header-summary__sep">·</span>
                <span className="header-summary__item">约 {fmtDur(totalDur)}</span>
              </>
            )}
            {problemCount > 0 && (
              <>
                <span className="header-summary__sep">·</span>
                <span className="header-summary__item header-summary__item--warn">⚠ {problemCount} 个需确认</span>
              </>
            )}
          </div>
        )}

        {/* Right: garmin + settings */}
        <div className="app-header__right">
          {restoringSession ? (
            <span className="status-badge"><span className="status-badge__dot" />恢复会话…</span>
          ) : loggedIn ? (
            <span className="status-badge">
              <span className="status-badge__dot status-badge__dot--on" />
              {gUsername}
            </span>
          ) : (
            <button className="status-badge status-badge--btn"
              onClick={() => { setShowGarminForm(true); setMobileTab('output') }}>
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

      {/* ── Mobile tabs ── */}
      <div className="mobile-tabs">
        {(['input', 'results', 'output'] as const).map(t => (
          <button key={t} className={`mobile-tab ${mobileTab === t ? 'mobile-tab--active' : ''}`}
            onClick={() => setMobileTab(t)}>
            {{ input: '输入', results: '解析', output: '同步' }[t]}
          </button>
        ))}
      </div>

      {/* ── Main 3-col ── */}
      <main className="app-main">

        {/* ════ LEFT: Input ════ */}
        <div className={`panel ${mobileTab === 'input' ? 'panel--active' : ''}`}>

          {/* If plan exists: collapsible wrapper */}
          {plan ? (
            <>
              {/* Collapsible header */}
              <div className="panel__collapse-trigger" onClick={() => setInputCollapsed(v => !v)}>
                <span className="fw-6" style={{ fontSize: 12 }}>原始训练计划</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="seg" style={{ transform: 'scale(0.85)', transformOrigin: 'right' }}>
                    {(['text', 'json', 'vdot'] as const).map(t => (
                      <button key={t} className={`seg__btn ${inputTab === t ? 'seg__btn--active' : ''}`}
                        onClick={e => { e.stopPropagation(); setInputTab(t); setInputCollapsed(false) }}>
                        {{ text: '文本', json: 'JSON', vdot: 'AI' }[t]}
                      </button>
                    ))}
                  </div>
                  <span className={`collapsible__caret ${inputCollapsed ? '' : 'collapsible__caret--open'}`}>▼</span>
                </div>
              </div>

              {/* Input content (expandable) */}
              {!inputCollapsed && (
                <div className="panel__body gap-10">
                  {renderInputContent()}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Normal header with tabs */}
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
                {renderInputContent()}
              </div>
            </>
          )}

          {/* ── Fixed footer: parse button ── */}
          <div className="panel__footer">
            <button className="btn btn--primary" onClick={handleParse} disabled={parseDisabled}>
              {parseLabel}
            </button>
            {parseStatus === 'error' && parseError && (
              <div className="warn-item warn-item--error" style={{ marginTop: 8 }}>
                <span className="warn-item__icon">✕</span>
                <span>{parseError}</span>
              </div>
            )}
          </div>
        </div>

        {/* ════ CENTER: Results ════ */}
        <div className={`panel panel--center ${mobileTab === 'results' ? 'panel--active' : ''}`}>
          <div className="panel__header">
            <span className="fw-6" style={{ fontSize: 13 }}>解析结果</span>
            {plan && <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>{plan.name}</span>}
          </div>

          {/* Loading skeleton */}
          {parseStatus === 'loading' && (
            <div className="panel__body" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="wo-card" style={{ padding: 14 }}>
                  <div className="skeleton" style={{ height: 14, width: `${40 + i * 10}%`, marginBottom: 8, borderRadius: 4 }} />
                  <div className="skeleton" style={{ height: 11, width: '55%', marginBottom: 8, borderRadius: 4 }} />
                  <div className="skeleton" style={{ height: 6, borderRadius: 3 }} />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {parseStatus !== 'loading' && !plan && (
            <div className="panel__body">
              <div className="empty">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ opacity: .3 }}>
                  <rect x="4" y="8" width="32" height="24" rx="3" stroke="currentColor" strokeWidth="2" />
                  <line x1="4" y1="15" x2="36" y2="15" stroke="currentColor" strokeWidth="2" />
                  <line x1="12" y1="22" x2="24" y2="22" stroke="currentColor" strokeWidth="2" />
                  <line x1="12" y1="27" x2="28" y2="27" stroke="currentColor" strokeWidth="2" />
                </svg>
                <span className="empty__title">粘贴训练计划后，解析结果会显示在这里</span>
                <span className="empty__sub">支持自然语言描述、JSON 格式，或由 AI 按 VDOT 生成</span>
              </div>
            </div>
          )}

          {/* Results */}
          {plan && parseStatus !== 'loading' && (
            <>
              {/* Prominent warnings */}
              {warnings.length > 0 && (
                <div className="warnings-banner">
                  {warnings.map((w, i) => (
                    <div key={i} className={`warn-banner warn-banner--${w.level}`}>
                      <span className="warn-banner__icon">{w.level === 'error' ? '✕' : '⚠'}</span>
                      <span>{w.msg}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Workout cards */}
              <div className="panel__body" style={{ padding: '8px 0' }}>
                {plan.workouts.map((wo, wi) => {
                  const { dur, dist } = workoutTotals(wo)
                  const cat     = classifyWorkout(wo)
                  const catCfg  = CAT_CONFIG[cat]
                  const intLvl  = getIntensity(cat)
                  const intCfg  = INT_CONFIG[intLvl]
                  const issues  = getWorkoutIssues(wo)
                  const isRest  = wo.steps.length === 0
                  const expanded = expandedRow === wi

                  return (
                    <div key={wi} className={`wo-card ${expanded ? 'wo-card--expanded' : ''} ${issues.length ? 'wo-card--warn' : ''}`}>
                      {/* Card header row */}
                      <div className="wo-card__header" onClick={() => !isRest && setExpandedRow(expanded ? null : wi)}>
                        {/* Date */}
                        <div className="wo-card__date">
                          <span className="wo-card__date-val">{wo.date.slice(5)}</span>
                          <span className="wo-card__weekday">{weekday(wo.date)}</span>
                        </div>

                        {/* Title + tags */}
                        <div className="wo-card__main">
                          <div className="wo-card__title-row">
                            <span className="wo-card__title">{isRest ? '休息日' : wo.title}</span>
                            {!isRest && (
                              <span className="type-tag" style={{ background: catCfg.bg, color: catCfg.color }}>
                                {catCfg.label}
                              </span>
                            )}
                            {issues.length > 0 && (
                              <span className="wo-card__issue-badge" title={issues.join('\n')}>需确认</span>
                            )}
                          </div>
                          {!isRest && (
                            <div className="wo-card__bar-row">
                              <WorkoutBar steps={wo.steps} height={5} />
                            </div>
                          )}
                        </div>

                        {/* Stats */}
                        <div className="wo-card__stats">
                          {!isRest && (
                            <>
                              <span className="wo-stat">{fmtDist(dist)}</span>
                              <span className="wo-stat wo-stat--time">{fmtDur(dur)}</span>
                              <span className="intensity-dot" style={{ background: intCfg.dot }} title={intCfg.label} />
                            </>
                          )}
                          {!isRest && (
                            <button className="btn--icon expand-btn" onClick={e => { e.stopPropagation(); setExpandedRow(expanded ? null : wi) }}>
                              {expanded ? '▲' : '▼'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {expanded && !isRest && (
                        <div className="wo-card__detail">
                          {issues.length > 0 && (
                            <div className="wo-card__issue-list">
                              {issues.map((iss, ii) => (
                                <div key={ii} className="wo-card__issue-item">⚠ {iss}</div>
                              ))}
                            </div>
                          )}
                          <WorkoutBar steps={wo.steps} height={12} showLegend />
                          <StepDetail steps={wo.steps} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* ════ RIGHT: Sync ════ */}
        <div className={`panel ${mobileTab === 'output' ? 'panel--active' : ''}`}>
          <div className="panel__header">
            <span className="fw-6" style={{ fontSize: 13 }}>同步到 Garmin</span>
          </div>

          <div className="panel__body gap-10">

            {/* Connection status */}
            {restoringSession ? (
              <p style={{ fontSize: 12, color: 'var(--tx-3)' }}>正在恢复 Garmin 会话…</p>
            ) : loggedIn && !showGarminForm ? (
              <>
                <div className="sync-connect-row">
                  <span className="sync-connected-label">
                    <span style={{ color: 'var(--success)', fontSize: 8 }}>●</span>
                    已连接：{gUsername}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn--ghost btn--sm" onClick={() => setShowGarminForm(true)}>切换账号</button>
                    <button className="btn btn--ghost btn--sm" onClick={handleLogout}>退出登录</button>
                  </div>
                </div>

                {/* Sync summary info */}
                {plan && (
                  <div className="sync-summary">
                    <div className="sync-summary__row">
                      <span className="sync-summary__label">待同步训练</span>
                      <span className="sync-summary__val">{activeWorkouts.length} 个</span>
                    </div>
                    {problemCount > 0 && (
                      <div className="sync-summary__row sync-summary__row--warn">
                        <span className="sync-summary__label">需要确认</span>
                        <span className="sync-summary__val">{problemCount} 个</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Big sync button */}
                <button className="btn btn--primary btn--sync"
                  onClick={handleSync}
                  disabled={syncing || !plan || activeWorkouts.length === 0}>
                  {syncing ? (
                    <><span className="spin">⟳</span> 同步中…</>
                  ) : plan ? (
                    `同步 ${activeWorkouts.length} 个训练到 Garmin`
                  ) : (
                    '同步到 Garmin'
                  )}
                </button>

                {/* Risk info */}
                {plan && !syncResults && (
                  <div className="sync-risk">
                    <div className="sync-risk__item">
                      <span className="sync-risk__icon">ℹ</span>
                      将创建 {activeWorkouts.length} 个 Garmin 训练，不会覆盖已有训练
                    </div>
                    {problemCount > 0 && (
                      <div className="sync-risk__item sync-risk__item--warn">
                        <span className="sync-risk__icon">⚠</span>
                        {problemCount} 个训练有备注说明，请同步前在中间面板确认
                      </div>
                    )}
                  </div>
                )}

                {syncError && (
                  <div className="warn-item warn-item--error"><span className="warn-item__icon">✕</span>{syncError}</div>
                )}

                {/* Sync results */}
                {syncResults && (
                  <div className="gap-10">
                    <div className="sync-done-banner">
                      {syncResults.every(r => r.ok)
                        ? `✓ 已同步 ${syncResults.length} 个训练`
                        : `同步完成：${syncResults.filter(r => r.ok).length} 成功 · ${syncResults.filter(r => !r.ok).length} 失败`
                      }
                    </div>
                    <ul className="warnings-list">
                      {syncResults.map((r, i) => (
                        <li key={i} className={`warn-item warn-item--${r.ok ? 'info' : 'error'}`}>
                          <span className="warn-item__icon">{r.ok ? '✓' : '✕'}</span>
                          {r.date} · {r.title}：{r.ok ? '已准备同步' : r.error}
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
              /* Login form */
              <div className="sync-area gap-10">
                {!loggedIn && (
                  <p style={{ fontSize: 12, color: 'var(--tx-3)', marginBottom: 4 }}>
                    登录 Garmin Connect 账号，一键同步课表到手表。
                  </p>
                )}
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
                  <input type="text" value={gUsername} onChange={e => setGUsername(e.target.value)} placeholder="email@example.com" />
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
                {loginError && (
                  <div className="warn-item warn-item--error"><span className="warn-item__icon">✕</span>{loginError}</div>
                )}
              </div>
            )}

            {/* Compact training preview */}
            {plan && activeWorkouts.length > 0 && (
              <>
                <div className="divider" />
                <span className="section-title">训练预览</span>
                <div className="sync-preview">
                  {activeWorkouts.map((wo, i) => {
                    const { dur, dist } = workoutTotals(wo)
                    const issues = getWorkoutIssues(wo)
                    const cat = classifyWorkout(wo)
                    const catCfg = CAT_CONFIG[cat]
                    return (
                      <div key={i} className={`sync-preview-item ${issues.length ? 'sync-preview-item--warn' : ''}`}>
                        <span className="sync-preview-date">{wo.date.slice(5)} {weekday(wo.date)}</span>
                        <span className="sync-preview-title">{wo.title}</span>
                        <span className="type-tag type-tag--xs" style={{ background: catCfg.bg, color: catCfg.color }}>{catCfg.label}</span>
                        <span className="sync-preview-stat">{fmtDist(dist)}</span>
                        <span className="sync-preview-stat">{fmtDur(dur)}</span>
                        {issues.length > 0 && <span className="sync-preview-warn" title={issues.join('\n')}>⚠</span>}
                        {syncResults && (
                          <span className={`sync-preview-result ${syncResults.find(r => r.title === wo.title && r.date === wo.date)?.ok ? 'sync-preview-result--ok' : 'sync-preview-result--err'}`}>
                            {syncResults.find(r => r.title === wo.title && r.date === wo.date)?.ok ? '✓' : '✕'}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Empty state when no plan */}
            {!plan && (
              <div className="empty" style={{ minHeight: 120 }}>
                <span className="empty__icon">⚡</span>
                <span className="empty__title">等待训练计划</span>
                <span className="empty__sub">在左侧解析或生成计划后，点击同步到 Garmin</span>
              </div>
            )}

            {/* Advanced / manual import */}
            {plan && (
              <>
                <div className="divider" />
                <div className="collapsible__trigger" onClick={() => setAdvancedOpen(v => !v)}>
                  <span>高级 / 手动导入（gccli）</span>
                  <span className={`collapsible__caret ${advancedOpen ? 'collapsible__caret--open' : ''}`}>▼</span>
                </div>
                {advancedOpen && (
                  <div className="collapsible__body gap-10">
                    <ul className="checklist">
                      <li>
                        <span className={`chk-icon ${activeWorkouts.length > 0 ? 'chk-ok' : 'chk-off'}`}>
                          {activeWorkouts.length > 0 ? '✓' : '○'}
                        </span>
                        至少 1 个包含步骤的训练日
                      </li>
                      <li>
                        <span className={`chk-icon ${plan.workouts.every(w => w.date) ? 'chk-ok' : 'chk-warn'}`}>
                          {plan.workouts.every(w => w.date) ? '✓' : '⚠'}
                        </span>
                        所有训练日包含日期
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

  // ── Input content renderer (shared between collapsed/expanded) ─
  function renderInputContent() {
    return (
      <>
        {inputTab === 'text' && (
          <>
            <textarea className="input-textarea" value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={'粘贴自然语言训练计划，支持中文/Markdown 表格格式\n\n例：\n周三：阈值训练 — 热身 2km + 3×8min T 配速（4:55-5:10/km）+ 放松 2km'} />
            <button className="btn btn--ghost btn--sm" onClick={() => setInputText(SAMPLE_TEXT)}>
              加载示例课表
            </button>
          </>
        )}

        {inputTab === 'json' && (
          <>
            <textarea className="input-textarea" value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="粘贴符合格式的 JSON，或点击下方按钮上传文件" />
            <div className="row">
              <button className="btn btn--ghost btn--sm flex1" onClick={() => setInputText(SAMPLE_JSON)}>
                加载 JSON 示例
              </button>
              <label className="btn btn--ghost btn--sm flex1" style={{ textAlign: 'center', cursor: 'pointer', marginBottom: 0 }}>
                上传文件
                <input type="file" accept=".json,application/json" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
            </div>
          </>
        )}

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
                  <p style={{ fontSize: 12, color: 'var(--success)', marginBottom: 4 }}>
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

        {/* HR zones */}
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
      </>
    )
  }
}
