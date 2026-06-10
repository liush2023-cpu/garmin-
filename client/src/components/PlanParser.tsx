import { useState } from 'react'
import { apiFetch } from '../lib/api'
import { validatePlan } from '../lib/validate'
import type { TrainingPlan } from '../types'

interface Props {
  isConfigured: boolean
  llmConfig: { baseUrl: string; apiKey: string; model: string }
  onPlanReady: (plan: TrainingPlan) => void
}

export function PlanParser({ isConfigured, llmConfig, onPlanReady }: Props) {
  const [planText, setPlanText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleParse() {
    setParsing(true)
    setError(null)
    const { ok, data, error: apiError } = await apiFetch<{ plan: unknown }>('/api/parse', {
      method: 'POST',
      body: { planText, ...llmConfig },
    })
    setParsing(false)
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
      <h2>入口 2：粘贴训练计划文本</h2>
      <p className="hint">直接粘贴一段自然语言描述的训练计划（含目标配速、目标心率等），AI 会解析成结构化课表。</p>
      <label>
        训练计划文本
        <textarea
          rows={8}
          placeholder={`粘贴自然语言训练计划，例如：\n周二：阈值训练 10公里，3组×8分钟阈值跑（配速 4:55-5:15/km，心率 168-174），组间慢跑2分钟恢复\n周四：有氧跑 8公里，心率 135-145...`}
          value={planText}
          onChange={(e) => setPlanText(e.target.value)}
        />
      </label>
      <button onClick={handleParse} disabled={parsing || !planText.trim() || !isConfigured}>
        {parsing ? '解析中…' : '解析并生成'}
      </button>
      {error && <p className="error">解析出错：{error}</p>}
    </section>
  )
}
