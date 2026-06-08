import { workoutTotals, formatDuration, formatDistance } from '../lib/validate'
import type { TrainingPlan } from '../types'

interface Props {
  plan: TrainingPlan
}

export function PlanPreview({ plan }: Props) {
  return (
    <section className="card">
      <h2>预览</h2>
      <p className="hint">计划名称：{plan.name}</p>
      <div className="row" style={{ gap: 16, alignItems: 'stretch' }}>
        {plan.workouts.map((workout, wi) => {
          const { totalDurationSeconds, totalDistanceMeters, stepCount } = workoutTotals(workout)
          return (
            <div className="card" key={wi} style={{ flex: '1 1 220px', margin: 0 }}>
              <p className="hint" style={{ fontWeight: 600, color: 'var(--text-h)' }}>
                {workout.date} · {workout.title}
              </p>
              <p className="hint">总时长：{formatDuration(totalDurationSeconds)}</p>
              <p className="hint">预估距离：{formatDistance(totalDistanceMeters)}</p>
              <p className="hint">步骤数：{stepCount > 0 ? `${stepCount} 步` : '休息日 / 无具体步骤'}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
