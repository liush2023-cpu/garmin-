/**
 * 轻量级请求体校验 —— 零依赖，每个路由一个专用校验函数。
 */

import type { GeneratePlanParams } from "./parse.js";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function isPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

type ValidateOk<T> = { ok: true; data: T };
type ValidateFail = { ok: false; error: string; status: number };
export type ValidateResult<T> = ValidateOk<T> | ValidateFail;

function fail(error: string, status = 400): ValidateFail {
  return { ok: false, error, status };
}

// ── /api/parse ──────────────────────────────────────────────────────────────

export interface ParseBody {
  planText: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function validateParseBody(body: unknown): ValidateResult<ParseBody> {
  if (typeof body !== "object" || body === null) return fail("请求体必须是 JSON 对象");
  const { planText, baseUrl, apiKey, model } = body as Record<string, unknown>;
  if (!isNonEmptyString(planText)) return fail("缺少 planText（非空字符串）");
  if (!isNonEmptyString(baseUrl))   return fail("缺少 baseUrl（非空字符串）");
  if (!isNonEmptyString(model))     return fail("缺少 model（非空字符串）");
  return { ok: true, data: { planText: planText.trim(), baseUrl: baseUrl.trim(), apiKey: typeof apiKey === "string" ? apiKey.trim() : "", model: model.trim() } };
}

// ── /api/generate ───────────────────────────────────────────────────────────

export interface GenerateBody {
  goalParams: GeneratePlanParams;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function validateGenerateBody(body: unknown): ValidateResult<GenerateBody> {
  if (typeof body !== "object" || body === null) return fail("请求体必须是 JSON 对象");
  const { goalParams, baseUrl, apiKey, model } = body as Record<string, unknown>;

  if (!isNonEmptyString(baseUrl)) return fail("缺少 baseUrl（非空字符串）");
  if (!isNonEmptyString(model))   return fail("缺少 model（非空字符串）");
  const safeApiKey = typeof apiKey === "string" ? apiKey.trim() : "";

  if (typeof goalParams !== "object" || goalParams === null) return fail("缺少 goalParams 对象");
  const gp = goalParams as Record<string, unknown>;

  if (gp.mode !== "single" && gp.mode !== "week") return fail("goalParams.mode 必须是 single 或 week");
  if (!isPositiveNumber(gp.vdot)) return fail("请提供有效的 VDOT 数值（正数）");

  if (gp.mode === "single") {
    const validGoals = ["aerobic", "marathon", "threshold", "speed"];
    if (!validGoals.includes(gp.goal as string)) return fail(`goalParams.goal 必须是以下之一：${validGoals.join(", ")}`);
    return {
      ok: true,
      data: {
        goalParams: { mode: "single", vdot: gp.vdot, goal: gp.goal as "aerobic" | "marathon" | "threshold" | "speed" },
        baseUrl: baseUrl.trim(), apiKey: safeApiKey, model: model.trim(),
      },
    };
  }

  const days = Number(gp.daysPerWeek);
  const km = Number(gp.weeklyDistanceKm);
  if (!Number.isFinite(days) || days < 1 || days > 7) return fail("goalParams.daysPerWeek 必须是 1-7 的整数");
  if (!Number.isFinite(km) || km <= 0) return fail("goalParams.weeklyDistanceKm 必须是正数");

  return {
    ok: true,
    data: {
      goalParams: { mode: "week", vdot: gp.vdot, daysPerWeek: days, weeklyDistanceKm: km },
      baseUrl: baseUrl.trim(), apiKey: safeApiKey, model: model.trim(),
    },
  };
}

// ── /api/garmin/login ───────────────────────────────────────────────────────

export interface LoginBody {
  username: string;
  password: string;
  domain?: "garmin.com" | "garmin.cn";
}

export function validateLoginBody(body: unknown): ValidateResult<LoginBody> {
  if (typeof body !== "object" || body === null) return fail("请求体必须是 JSON 对象");
  const { username, password, domain } = body as Record<string, unknown>;
  if (!isNonEmptyString(username)) return fail("缺少 username（非空字符串）");
  if (!isNonEmptyString(password)) return fail("缺少 password（非空字符串）");
  if (domain !== undefined && domain !== "garmin.com" && domain !== "garmin.cn") {
    return fail("domain 必须是 garmin.com 或 garmin.cn");
  }
  return { ok: true, data: { username: username.trim(), password, domain } };
}

// ── /api/garmin/restore ─────────────────────────────────────────────────────

export interface RestoreBody {
  tokens: { oauth1: unknown; oauth2: unknown };
  domain: "garmin.com" | "garmin.cn";
}

export function validateRestoreBody(body: unknown): ValidateResult<RestoreBody> {
  if (typeof body !== "object" || body === null) return fail("请求体必须是 JSON 对象");
  const { tokens, domain } = body as Record<string, unknown>;
  if (typeof tokens !== "object" || tokens === null) return fail("缺少 tokens 对象");
  const t = tokens as Record<string, unknown>;
  if (!t.oauth1 || typeof t.oauth1 !== "object") return fail("缺少 tokens.oauth1");
  if (!t.oauth2 || typeof t.oauth2 !== "object") return fail("缺少 tokens.oauth2");
  const d = (domain ?? "garmin.cn") as string;
  if (d !== "garmin.com" && d !== "garmin.cn") return fail("domain 必须是 garmin.com 或 garmin.cn");
  return { ok: true, data: { tokens: t as RestoreBody["tokens"], domain: d } };
}

// ── /api/sync ───────────────────────────────────────────────────────────────

export interface SyncBody {
  workouts: Array<{
    date: string;
    title: string;
    steps: Array<{
      type: string;
      distanceMeters?: number;
      durationSeconds?: number;
      targetPace?: string;
      targetHeartRate?: string;
      repeat?: number;
      notes?: string;
      [key: string]: unknown;
    }>;
  }>;
}

const VALID_STEP_TYPES = new Set(["warmup", "interval", "recovery", "cooldown", "easy", "rest"]);

function extractBpmValues(hr: string): number[] {
  return (hr.match(/\d{2,3}/g) ?? []).map(Number).filter(Number.isFinite);
}

export function validateSyncBody(body: unknown): ValidateResult<SyncBody> {
  if (typeof body !== "object" || body === null) return fail("请求体必须是 JSON 对象");
  const { plan } = body as Record<string, unknown>;
  if (typeof plan !== "object" || plan === null) return fail("缺少 plan 对象");
  const { workouts } = plan as Record<string, unknown>;
  if (!Array.isArray(workouts)) return fail("缺少 plan.workouts 数组");
  if (workouts.length === 0) return fail("workouts 数组不能为空");
  if (workouts.length > 100) return fail("workouts 最多支持 100 条");

  for (let i = 0; i < workouts.length; i++) {
    const w = workouts[i];
    if (typeof w !== "object" || w === null) return fail(`workouts[${i}] 必须是对象`);

    // 日期
    if (typeof w.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(w.date)) {
      return fail(`workouts[${i}].date 必须是 YYYY-MM-DD 格式`);
    }
    const parsedDate = new Date(w.date + "T00:00:00");
    if (isNaN(parsedDate.getTime())) return fail(`workouts[${i}].date 日期不合法：${w.date}`);
    const yearDiff = Math.abs(parsedDate.getFullYear() - new Date().getFullYear());
    if (yearDiff > 5) return fail(`workouts[${i}].date 日期超出合理范围（±5年）：${w.date}`);

    // 标题
    if (typeof w.title !== "string" || w.title.trim().length === 0) {
      return fail(`workouts[${i}].title 必须是非空字符串`);
    }
    if (w.title.length > 200) return fail(`workouts[${i}].title 超过最大长度 200`);

    // 步骤
    if (!Array.isArray(w.steps)) return fail(`workouts[${i}].steps 必须是数组`);
    if (w.steps.length > 200) return fail(`workouts[${i}].steps 最多支持 200 步`);

    for (let j = 0; j < w.steps.length; j++) {
      const s = w.steps[j];
      const loc = `workouts[${i}].steps[${j}]`;
      if (typeof s !== "object" || s === null) return fail(`${loc} 必须是对象`);

      if (typeof s.type !== "string" || !VALID_STEP_TYPES.has(s.type)) {
        return fail(`${loc}.type 无效，必须是：${[...VALID_STEP_TYPES].join(", ")}`);
      }

      if (s.distanceMeters == null && s.durationSeconds == null) {
        return fail(`${loc} 必须包含 distanceMeters 或 durationSeconds 之一`);
      }
      if (s.distanceMeters != null) {
        if (typeof s.distanceMeters !== "number" || !Number.isFinite(s.distanceMeters) || s.distanceMeters <= 0)
          return fail(`${loc}.distanceMeters 必须是正数（单位：米）`);
        if (s.distanceMeters > 200_000)
          return fail(`${loc}.distanceMeters 超过 200km，请检查单位是否正确（应为米）`);
      }
      if (s.durationSeconds != null) {
        if (typeof s.durationSeconds !== "number" || !Number.isFinite(s.durationSeconds) || s.durationSeconds <= 0)
          return fail(`${loc}.durationSeconds 必须是正数（单位：秒）`);
        if (s.durationSeconds > 86_400)
          return fail(`${loc}.durationSeconds 超过 24 小时，请检查单位是否正确（应为秒）`);
      }

      if (s.targetPace != null) {
        if (typeof s.targetPace !== "string") return fail(`${loc}.targetPace 必须是字符串`);
        if (s.targetPace.trim() && !/\d{1,2}:\d{2}/.test(s.targetPace)) {
          return fail(`${loc}.targetPace 格式不正确："${s.targetPace}"，期望如 "5:30/km" 或 "5:00-5:30/km"`);
        }
      }

      if (s.targetHeartRate != null) {
        if (typeof s.targetHeartRate !== "string") return fail(`${loc}.targetHeartRate 必须是字符串`);
        const bpms = extractBpmValues(s.targetHeartRate);
        for (const bpm of bpms) {
          if (bpm < 30 || bpm > 250)
            return fail(`${loc}.targetHeartRate 包含不合理的心率值 ${bpm}，正常范围 30-250 bpm`);
        }
        if (bpms.length === 2 && bpms[0] > bpms[1])
          return fail(`${loc}.targetHeartRate 区间低值(${bpms[0]})大于高值(${bpms[1]})`);
      }

      if (s.repeat != null) {
        if (typeof s.repeat !== "number" || !Number.isInteger(s.repeat) || s.repeat < 2 || s.repeat > 100)
          return fail(`${loc}.repeat 必须是 2-100 之间的整数`);
      }
    }
  }

  return { ok: true, data: { workouts: workouts as SyncBody["workouts"] } };
}

// ── /api/garmin/delete-workouts ─────────────────────────────────────────────

export interface DeleteBody {
  workoutIds: string[];
}

export function validateDeleteBody(body: unknown): ValidateResult<DeleteBody> {
  if (typeof body !== "object" || body === null) return fail("请求体必须是 JSON 对象");
  const { workoutIds } = body as Record<string, unknown>;
  if (!Array.isArray(workoutIds) || workoutIds.length === 0) return fail("缺少 workoutIds（非空数组）");
  for (let i = 0; i < workoutIds.length; i++) {
    if (typeof workoutIds[i] !== "string" || !(workoutIds[i] as string).trim())
      return fail(`workoutIds[${i}] 必须是非空字符串`);
  }
  return { ok: true, data: { workoutIds: workoutIds as string[] } };
}
