import { GarminConnect } from "garmin-connect";
import type { PlannedWorkout, WorkoutStep } from "./types.js";

type IWorkoutDetail = Awaited<ReturnType<GarminConnect["addRunningWorkout"]>>;

// One client per process — credentials never leave this machine.
let client: GarminConnect | null = null;

export async function garminLogin(username: string, password: string, domain: "garmin.com" | "garmin.cn" = "garmin.cn"): Promise<void> {
  const gc = new GarminConnect({ username, password }, domain);
  await gc.login();
  client = gc;
}

export function isLoggedIn(): boolean {
  return client !== null;
}

const STEP_TYPE_MAP: Record<WorkoutStep["type"], { stepTypeId: number; stepTypeKey: string }> = {
  warmup: { stepTypeId: 1, stepTypeKey: "warmup" },
  interval: { stepTypeId: 3, stepTypeKey: "interval" },
  recovery: { stepTypeId: 4, stepTypeKey: "recovery" },
  cooldown: { stepTypeId: 2, stepTypeKey: "cooldown" },
  easy: { stepTypeId: 5, stepTypeKey: "other" },
  rest: { stepTypeId: 5, stepTypeKey: "rest" },
};

function buildStepDTO(step: WorkoutStep, stepOrder: number) {
  const useDistance = step.distanceMeters != null;
  const targetBits = [
    step.targetPace ? `配速 ${step.targetPace}` : null,
    step.targetHeartRate ? `心率 ${step.targetHeartRate}` : null,
  ].filter(Boolean);
  const description = [step.notes, targetBits.length ? `目标：${targetBits.join("，")}` : null]
    .filter(Boolean)
    .join(" | ") || null;
  return {
    type: "ExecutableStepDTO",
    stepId: null,
    stepOrder,
    childStepId: null,
    description,
    stepType: { stepTypeId: STEP_TYPE_MAP[step.type].stepTypeId, stepTypeKey: STEP_TYPE_MAP[step.type].stepTypeKey },
    endCondition: useDistance
      ? { conditionTypeId: 3, conditionTypeKey: "distance" }
      : { conditionTypeId: 2, conditionTypeKey: "time" },
    preferredEndConditionUnit: useDistance ? { unitKey: "kilometer" } : null,
    endConditionValue: useDistance ? step.distanceMeters : step.durationSeconds,
    endConditionCompare: null,
    endConditionZone: null,
    targetType: { workoutTargetTypeId: 1, workoutTargetTypeKey: "no.target" },
    targetValueOne: null,
    targetValueTwo: null,
    zoneNumber: null,
    description2: step.targetPace ?? null,
  };
}

function buildWorkoutDTO(workout: PlannedWorkout): IWorkoutDetail {
  const sportType = { sportTypeId: 1, sportTypeKey: "running" };
  return {
    workoutId: undefined,
    workoutName: workout.title,
    description: workout.steps.map((s) => s.notes).filter(Boolean).join("; ") || undefined,
    sportType,
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType,
        workoutSteps: workout.steps.map((s, i) => buildStepDTO(s, i + 1)),
      },
    ],
  } as unknown as IWorkoutDetail;
}

async function scheduleWorkout(workoutId: string, date: string): Promise<void> {
  if (!client) throw new Error("尚未登录 Garmin");
  await client.client.post(`${client.client.url.GC_API}/workout-service/schedule/${workoutId}`, { date });
}

export interface SyncResult {
  date: string;
  title: string;
  ok: boolean;
  error?: string;
  workoutId?: string;
}

export async function syncWorkouts(workouts: PlannedWorkout[]): Promise<SyncResult[]> {
  if (!client) throw new Error("尚未登录 Garmin");

  const results: SyncResult[] = [];
  for (const workout of workouts) {
    if (workout.steps.length === 0) {
      results.push({ date: workout.date, title: workout.title, ok: true });
      continue;
    }
    try {
      const created = await client.addWorkout(buildWorkoutDTO(workout));
      if (!created.workoutId) throw new Error("Garmin 未返回 workoutId");
      const workoutId = String(created.workoutId);
      await scheduleWorkout(workoutId, workout.date);
      results.push({ date: workout.date, title: workout.title, ok: true, workoutId });
    } catch (err) {
      results.push({
        date: workout.date,
        title: workout.title,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

export interface DeleteResult {
  workoutId: string;
  ok: boolean;
  error?: string;
}

export async function deleteWorkouts(workoutIds: string[]): Promise<DeleteResult[]> {
  if (!client) throw new Error("尚未登录 Garmin");

  const results: DeleteResult[] = [];
  for (const workoutId of workoutIds) {
    try {
      await client.deleteWorkout({ workoutId });
      results.push({ workoutId, ok: true });
    } catch (err) {
      results.push({ workoutId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
