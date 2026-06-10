import { useState } from 'react'
import { apiFetch } from '../lib/api'
import { validatePlan } from '../lib/validate'
import { VdotEstimator } from './VdotEstimator'
import type { TrainingPlan } from '../types'

interface Props {
  isConfigured: boolean
  llmConfig: { baseUrl: string; apiKey: string; model: string }
  onPlanReady: (plan: TrainingPlan) => void
}

export function PlanGenerator({ isConfigured, llmConfig, onPlanReady }: Props) {
  const [genMode, setGenMode] = useState<'single' | 'week'>('single')
  const [genVdot, setGenVdot] = useState('46.5')
  const [genGoal, setGenGoal] = useState<'aerobic' | 'marathon' | 'threshold' | 'speed'>('aerobic')
  const [genDaysPerWeek, setGenDaysPerWeek] = useState('4')
  const [genWeeklyKm, setGenWeeklyKm] = useState('30')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    const vdot = Number(genVdot)
    if (!Number.isFinite(vdot) || vdot <= 0) {
      setError('请输入有效的 VDOT 数值')
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
    setError(null)
    const { ok, data, error: apiError } = await apiFetch<{ plan: unknown }>('/api/generate', {
      method: 'POST',
      body: { goalParams, ...llmConfig },
    })
    setGenerating(false)
    if (!ok) {
      setError(apiError)
      return
    }
    try {
      onPlanReady(validatePlan(data!.plan))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="card">
      <h2>入口 1：按 VDOT 生成课表</h2>
      <p className="hint">
        告诉 AI 你当前的跑力（VDOT）和训练诉求，由它按 Jack Daniels 训练理论直接生成包含目标配速 / 心率区间的结构化课表。
      </p>
      <VdotEstimator onEstimate={(v) => setGenVdot(v.toFixed(1))} />
      <label>
        当前跑力（VDOT）
        <input type="number" step="0.1" placeholder="例如 46.5" value={genVdot} onChange={(e) => setGenVdot(e.target.value)} />
      </label>
      <label>
        生成类型
        <select value={genMode} onChange={(e) => setGenMode(e.target.value as 'single' | 'week')}>
          <option value="single">单次训练课表</option>
          <option value="week">一周训练课表</option>
        </select>
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
            <input type="number" min={1} max={7} value={genDaysPerWeek} onChange={(e) => setGenDaysPerWeek(e.target.value)} />
          </label>
          <label>
            当前每周跑量（公里）
            <input type="number" min={0} step="1" value={genWeeklyKm} onChange={(e) => setGenWeeklyKm(e.target.value)} />
          </label>
        </>
      )}
      <button onClick={handleGenerate} disabled={generating || !isConfigured}>
        {generating ? '生成中…' : '生成课表'}
      </button>
      {error && <p className="error">生成出错：{error}</p>}
      {!isConfigured && <p className="hint">请先点击右上角「⚙️ 设置」填写大模型接口配置。</p>}
    </section>
  )
}
