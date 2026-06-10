import { useState, type ChangeEvent } from 'react'
import { validatePlan } from '../lib/validate'
import type { TrainingPlan } from '../types'

interface Props {
  onPlanReady: (plan: TrainingPlan) => void
}

export function PlanImporter({ onPlanReady }: Props) {
  const [planJsonText, setPlanJsonText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleLoadJson() {
    setError(null)
    try {
      const data = JSON.parse(planJsonText)
      onPlanReady(validatePlan(data))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((text) => setPlanJsonText(text))
  }

  return (
    <section className="card">
      <h2>入口 3：导入 JSON</h2>
      <p className="hint">上传符合格式的 JSON 文件，直接导入课表。</p>
      <label>
        从文件导入
        <input type="file" accept="application/json,.json" onChange={handleFile} />
      </label>
      <button onClick={handleLoadJson} disabled={!planJsonText.trim()}>
        导入
      </button>
      {error && <p className="error">导入出错：{error}</p>}
    </section>
  )
}
