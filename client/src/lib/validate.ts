import type { TrainingPlan, PlannedWorkout, StepType, WorkoutStep } from '../types'

const VALID_STEP_TYPES = new Set<StepType>(['warmup', 'interval', 'recovery', 'cooldown', 'easy', 'rest'])

export function validatePlan(data: unknown): TrainingPlan {
  if (typeof data !== 'object' || data === null) throw new Error('Top level must be a JSON object')
  const plan = data as Record<string, unknown>
  if (typeof plan.name !== 'string') throw new Error('Missing string field "name"')
  if (!Array.isArray(plan.workouts)) throw new Error('Missing array field "workouts"')
  plan.workouts.forEach((w, wi) => {
    if (typeof w !== 'object' || w === null) throw new Error(`workouts[${wi}] must be object`)
    const workout = w as Record<string, unknown>
    if (typeof workout.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(workout.date))
      throw new Error(`workouts[${wi}].date must be YYYY-MM-DD`)
    if (typeof workout.title !== 'string' || workout.title.trim().length === 0)
      throw new Error(`workouts[${wi}].title must be non-empty string`)
    if (!Array.isArray(workout.steps)) throw new Error(`workouts[${wi}].steps must be array`)
    workout.steps.forEach((s, si) => {
      if (typeof s !== 'object' || s === null) throw new Error(`workouts[${wi}].steps[${si}] must be object`)
      const step = s as Record<string, unknown>
      if (typeof step.type !== 'string' || !VALID_STEP_TYPES.has(step.type as StepType))
        throw new Error(`workouts[${wi}].steps[${si}].type must be one of: ${[...VALID_STEP_TYPES].join(', ')}`)
      if (step.distanceMeters == null && step.durationSeconds == null)
        throw new Error(`workouts[${wi}].steps[${si}] must have distanceMeters or durationSeconds`)
    })
  })
  return data as TrainingPlan
}

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
  if (totalSeconds <= 0) return '-'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.round((totalSeconds % 3600) / 60)
  return h > 0 ? `approx ${h}h ${m}m` : `approx ${m}min`
}

export function formatDistance(totalMeters: number): string {
  if (totalMeters <= 0) return '-'
  return `approx ${(totalMeters / 1000).toFixed(1)} km`
}

export type SanityLevel = 'info' | 'warn' | 'error'

export interface SanityIssue {
  level: SanityLevel
  workoutIdx?: number
  stepIdx?: number
  msg: string
}

function parsePaceToSecPerKm(pace: string): number | null {
  const m = pace.match(/(\d{1,2}):(\d{2})(?:\s*[-\u2013]\s*(\d{1,2}):(\d{2}))?/)
  if (!m) return null
  const t1 = parseInt(m[1]) * 60 + parseInt(m[2])
  if (m[3] && m[4]) return (t1 + parseInt(m[3]) * 60 + parseInt(m[4])) / 2
  return t1
}

function actualPaceSecPerKm(distM: number, durS: number): number | null {
  if (distM <= 0 || durS <= 0) return null
  return durS / (distM / 1000)
}

export function checkPlanSanity(plan: TrainingPlan): SanityIssue[] {
  const issues: SanityIssue[] = []
  let totalWeeklyDistanceM = 0
  plan.workouts.forEach((wo, wi) => {
    checkWorkoutSanity(wo, wi, issues)
    const { totalDistanceMeters } = workoutTotals(wo)
    totalWeeklyDistanceM += totalDistanceMeters
  })
  if (totalWeeklyDistanceM > 150_000) {
    issues.push({
      level: 'warn',
      msg: `Weekly total distance ~${(totalWeeklyDistanceM / 1000).toFixed(0)}km exceeds typical training range (150km+), please verify`,
    })
  }
  return issues
}

function checkWorkoutSanity(wo: PlannedWorkout, wi: number, issues: SanityIssue[]) {
  if (wo.steps.length === 0) return
  let woDistM = 0
  let woDurS = 0
  wo.steps.forEach((step, si) => {
    const mult = step.repeat && step.repeat > 1 ? step.repeat : 1
    woDistM += (step.distanceMeters ?? 0) * mult
    woDurS += (step.durationSeconds ?? 0) * mult
    checkStepSanity(step, si, wi, issues)
  })
  if (woDurS > 7 * 3600) {
    issues.push({ level: 'warn', workoutIdx: wi, msg: `"${wo.title}" total duration ${Math.round(woDurS/3600)}h exceeds 7h, check if durationSeconds unit is correct (should be seconds)` })
  }
  if (woDistM > 100_000) {
    issues.push({ level: 'warn', workoutIdx: wi, msg: `"${wo.title}" total distance ${(woDistM/1000).toFixed(0)}km exceeds 100km, check if distanceMeters unit is correct (should be meters)` })
  }
}

function checkStepSanity(step: WorkoutStep, si: number, wi: number, issues: SanityIssue[]) {
  const loc = `Workout ${wi + 1} step ${si + 1}`
  if (step.targetPace) {
    const spk = parsePaceToSecPerKm(step.targetPace)
    if (spk !== null) {
      if (spk < 120) {
        issues.push({ level: 'error', workoutIdx: wi, stepIdx: si, msg: `${loc} (${step.type}) pace ${step.targetPace} is below 2:00/km, exceeds human limits` })
      } else if (spk < 150 && step.type !== 'interval') {
        issues.push({ level: 'warn', workoutIdx: wi, stepIdx: si, msg: `${loc} (${step.type}) pace ${step.targetPace} is below 2:30/km, should this be an interval step?` })
      } else if (spk > 900) {
        issues.push({ level: 'info', workoutIdx: wi, stepIdx: si, msg: `${loc} (${step.type}) pace ${step.targetPace} is above 15:00/km, please verify` })
      }
    }
  }
  if (step.distanceMeters != null && step.durationSeconds != null && step.targetPace) {
    const targetSpk = parsePaceToSecPerKm(step.targetPace)
    const actualSpk = actualPaceSecPerKm(step.distanceMeters, step.durationSeconds)
    if (targetSpk !== null && actualSpk !== null) {
      const ratio = actualSpk / targetSpk
      if (ratio < 0.6 || ratio > 1.7) {
        const actualMin = Math.floor(actualSpk / 60)
        const actualSec = Math.round(actualSpk % 60)
        const actualPaceStr = `${actualMin}:${actualSec.toString().padStart(2, '0')}/km`
        issues.push({ level: 'warn', workoutIdx: wi, stepIdx: si, msg: `${loc} (${step.type}) computed pace ~${actualPaceStr} differs >40% from target ${step.targetPace} - AI values may be inconsistent` })
      }
    }
  }
  if (step.distanceMeters != null && step.distanceMeters > 50_000) {
    issues.push({ level: 'warn', workoutIdx: wi, stepIdx: si, msg: `${loc} distance ${(step.distanceMeters/1000).toFixed(0)}km >50km, check unit (should be meters not km)` })
  }
  if (step.durationSeconds != null && step.durationSeconds > 10_800) {
    issues.push({ level: 'warn', workoutIdx: wi, stepIdx: si, msg: `${loc} duration ${Math.round(step.durationSeconds/3600)}h >3h, check unit (should be seconds not minutes/hours)` })
  }
}
