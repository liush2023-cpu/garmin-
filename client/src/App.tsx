import { useState, type ChangeEvent } from 'react'
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

  const [provider, setProvider] = useState<keyof typeof LLM_PRESETS>('deepseek')
  const [baseUrl, setBaseUrl] = useState<string>(LLM_PRESETS.deepseek.baseUrl)
  const [llmApiKey, setLlmApiKey] = useState('')
  const [model, setModel] = useState<string>(LLM_PRESETS.deepseek.model)
  const [planText, setPlanText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const [gDomain, setGDomain] = useState<'garmin.cn' | 'garmin.com'>('garmin.cn')
  const [gUsername, setGUsername] = useState('')
  const [gPassword, setGPassword] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

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
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoggingIn(false)
    }
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
      setSyncResults(data.results)
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
          API Key 仅发送给你选择的模型服务商，不会保存在服务器上。
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
        <h2>第一步 B：导入训练计划 JSON</h2>
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
          {!loggedIn ? (
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
              <p className="hint">已登录 Garmin（{gUsername}）</p>
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
