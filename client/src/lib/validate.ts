import type { TrainingPlan, PlannedWorkout, StepType } from '../types'

const VALID_STEP_TYPES = new Set<StepType>(['warmup', 'interval', 'recovery', 'cooldown', 'easy', 'rest'])

export function validatePlan(data: unknown): TrainingPlan {
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

/** 汇总一次训练的预估总时长（秒）/ 总距离（米）/ 步骤数 */
export function workoutTotals(workout: PlannedWorkout): {
  totalDurationSeconds: number
  totalDistanceMeters: number
  stepCount: number
} {
  let totalDurationSeconds = 0
  let totalDistanceMeters = 0
  for (const step of workout.steps) {
    const mult = step.repeat && step.repeat > 1 ? step.repeat : 1
    if (step.durationSeconds != null) totalDurationSeconds += step.durationSeconds * mult
    if (step.distanceMeters != null) totalDistanceMeters += step.distanceMeters * mult
  }
  return { totalDurationSeconds, totalDistanceMeters, stepCount: workout.steps.length }
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '—'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.round((totalSeconds % 3600) / 60)
  return h > 0 ? `约 ${h} 小时 ${m} 分钟` : `约 ${m} 分钟`
}

export function formatDistance(totalMeters: number): string {
  if (totalMeters <= 0) return '—'
  return `约 ${(totalMeters / 1000).toFixed(1)} 公里`
}
