import pkg from "garmin-connect";
import type { GarminSessionTokens, PlannedWorkout, WorkoutStep } from "./types.js";

const { GarminConnect } = pkg;
type GarminConnect = InstanceType<typeof GarminConnect>;

type IWorkoutDetail = Awaited<ReturnType<GarminConnect["addRunningWorkout"]>>;

// One client per process — credentials never leave this machine.
let client: GarminConnect | null = null;
let clientDomain: "garmin.com" | "garmin.cn" = "garmin.cn";

export async function garminLogin(username: string, password: string, domain: "garmin.com" | "garmin.cn" = "garmin.cn"): Promise<void> {
  const gc = new GarminConnect({ username, password }, domain);
  await gc.login();
  client = gc;
  clientDomain = domain;
}

/**
 * Restore a previous session from exported OAuth tokens, without sending the
 * password again. Returns true if the session is valid and usable.
 */
export async function garminRestoreSession(tokens: GarminSessionTokens, domain: "garmin.com" | "garmin.cn" = "garmin.cn"): Promise<boolean> {
  try {
    const gc = new GarminConnect({ username: "", password: "" }, domain);
    gc.loadToken(tokens.oauth1, tokens.oauth2);
    // Cheap call to confirm the restored session actually works.
    await gc.getUserSettings();
    client = gc;
    clientDomain = domain;
    return true;
  } catch {
    return false;
  }
}

/** Export the current session's OAuth tokens so the client can persist and restore it later. */
export function garminExportSession(): { tokens: GarminSessionTokens; domain: "garmin.com" | "garmin.cn" } | null {
  if (!client) return null;
  return { tokens: client.exportToken(), domain: clientDomain };
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

// --- 配速 / 心率目标解析 -------------------------------------------------
//
// Garmin 用结构化的 targetType + targetValueOne/Two 来表示"目标配速区间"
// （pace.zone，单位 米/秒）和"目标心率区间"（heart.rate.zone，单位 bpm），
// 而不是靠备注文字。下面两个函数把我们模型里自由格式的字符串换算成这种结构。
//
// 配速越快，数值（分钟/公里）越小，对应的 米/秒 越大；Garmin 把"较慢的一端"
// 放 targetValueOne、"较快的一端"放 targetValueTwo（即 One <= Two）。

const PACE_PATTERN = /(\d{1,2}):(\d{2})/g;

function paceToMetersPerSecond(minutes: number, seconds: number): number {
  const secondsPerKm = minutes * 60 + seconds;
  if (secondsPerKm <= 0) return 0;
  return 1000 / secondsPerKm;
}

/** 解析 "4:45/km"、"4:40-4:50/km"、"<5:00/km"、"4:45" 等写法为 [慢, 快] 的 m/s 区间。 */
export function parsePaceRangeToMps(pace: string): [number, number] | null {
  const matches = [...pace.matchAll(PACE_PATTERN)].map(([, m, s]) => paceToMetersPerSecond(Number(m), Number(s)));
  if (matches.length === 0) return null;
  if (matches.length === 1) {
    // 单一配速：给一个小的容差区间，避免 Garmin 因区间过窄报错。
    const v = matches[0];
    const tolerance = v * 0.03;
    return [v - tolerance, v + tolerance];
  }
  const lo = Math.min(...matches);
  const hi = Math.max(...matches);
  return [lo, hi];
}

const HR_PATTERN = /\d{2,3}/g;

/** 解析 "165-170"、"<145"、">160"、"150" 等写法为 [低, 高] 的 bpm 区间。 */
export function parseHeartRateRangeToBpm(hr: string): [number, number] | null {
  const numbers = (hr.match(HR_PATTERN) ?? []).map(Number);
  if (numbers.length === 0) return null;
  if (numbers.length === 1) {
    const v = numbers[0];
    if (hr.includes("<")) return [Math.max(0, v - 30), v];
    if (hr.includes(">")) return [v, v + 30];
    return [Math.max(0, v - 5), v + 5];
  }
  const lo = Math.min(...numbers);
  const hi = Math.max(...numbers);
  return [lo, hi];
}

const PACE_TARGET_TYPE = { workoutTargetTypeId: 6, workoutTargetTypeKey: "pace.zone" };
const HEART_RATE_TARGET_TYPE = { workoutTargetTypeId: 4, workoutTargetTypeKey: "heart.rate.zone" };
const NO_TARGET_TYPE = { workoutTargetTypeId: 1, workoutTargetTypeKey: "no.target" };

function resolveTarget(step: WorkoutStep): { targetType: typeof NO_TARGET_TYPE; targetValueOne: number | null; targetValueTwo: number | null } {
  if (step.targetPace) {
    const range = parsePaceRangeToMps(step.targetPace);
    if (range) return { targetType: PACE_TARGET_TYPE, targetValueOne: range[0], targetValueTwo: range[1] };
  }
  if (step.targetHeartRate) {
    const range = parseHeartRateRangeToBpm(step.targetHeartRate);
    if (range) return { targetType: HEART_RATE_TARGET_TYPE, targetValueOne: range[0], targetValueTwo: range[1] };
  }
  return { targetType: NO_TARGET_TYPE, targetValueOne: null, targetValueTwo: null };
}

// --- DTO 构建 -------------------------------------------------------------

function buildStepDTO(step: WorkoutStep, stepOrder: number, childStepId: number | null = null) {
  const useDistance = step.distanceMeters != null;
  const targetBits = [
    step.targetPace ? `配速 ${step.targetPace}` : null,
    step.targetHeartRate ? `心率 ${step.targetHeartRate}` : null,
  ].filter(Boolean);
  const description = [step.notes, targetBits.length ? `目标：${targetBits.join("，")}` : null]
    .filter(Boolean)
    .join(" | ") || null;
  const { targetType, targetValueOne, targetValueTwo } = resolveTarget(step);
  return {
    type: "ExecutableStepDTO",
    stepId: null,
    stepOrder,
    childStepId,
    description,
    stepType: { stepTypeId: STEP_TYPE_MAP[step.type].stepTypeId, stepTypeKey: STEP_TYPE_MAP[step.type].stepTypeKey },
    endCondition: useDistance
      ? { conditionTypeId: 3, conditionTypeKey: "distance" }
      : { conditionTypeId: 2, conditionTypeKey: "time" },
    preferredEndConditionUnit: useDistance ? { unitKey: "kilometer" } : null,
    endConditionValue: useDistance ? step.distanceMeters : step.durationSeconds,
    endConditionCompare: null,
    endConditionZone: null,
    targetType,
    targetValueOne,
    targetValueTwo,
    zoneNumber: null,
    description2: step.targetPace ?? null,
  };
}

/**
 * 把"组间恢复重复 N 次"这类结构打包成 Garmin 的 RepeatGroupDTO：
 * 把相邻且 repeat 值相同（>1）的若干步骤识别为一组，输出为一个会在 Garmin
 * App 里显示成"N 次"的重复块；其余步骤按原样输出为平铺的 ExecutableStepDTO。
 */
function buildWorkoutSteps(steps: WorkoutStep[]) {
  const result: unknown[] = [];
  let stepOrder = 1;
  let groupId = 1000; // 与普通 stepId（null）区分开的分组 id 起始值

  let i = 0;
  while (i < steps.length) {
    const step = steps[i];
    const repeat = step.repeat && step.repeat > 1 ? step.repeat : null;

    if (repeat == null) {
      result.push(buildStepDTO(step, stepOrder));
      stepOrder += 1;
      i += 1;
      continue;
    }

    // 收集相邻且 repeat 值相同的步骤组成一个重复块
    let j = i;
    while (j < steps.length && steps[j].repeat === repeat) j += 1;
    const group = steps.slice(i, j);
    const currentGroupId = groupId;
    groupId += 1;

    result.push({
      type: "RepeatGroupDTO",
      stepId: null,
      stepOrder,
      childStepId: currentGroupId,
      description: null,
      stepType: { stepTypeId: 6, stepTypeKey: "repeat" },
      numberOfIterations: repeat,
      smartRepeat: false,
      endCondition: { conditionTypeId: 7, conditionTypeKey: "iterations" },
      endConditionValue: repeat,
      preferredEndConditionUnit: null,
      endConditionCompare: null,
      endConditionZone: null,
      targetType: NO_TARGET_TYPE,
      targetValueOne: null,
      targetValueTwo: null,
      zoneNumber: null,
      workoutSteps: group.map((s, idx) => buildStepDTO(s, idx + 1, currentGroupId)),
    });
    stepOrder += 1;
    i = j;
  }

  return result;
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
        workoutSteps: buildWorkoutSteps(workout.steps),
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
