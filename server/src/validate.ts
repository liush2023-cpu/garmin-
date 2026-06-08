/**
 * 轻量级请求体校验 —— 零依赖，每个路由一个专用校验函数。
 *
 * 返回值约定：
 *   { ok: true,  data: T }          — 校验通过，data 为清洗后的类型安全数据
 *   { ok: false, error: string, status: number } — 校验失败
 */

import type { GeneratePlanParams } from "./parse.js";

// ── 通用辅助 ────────────────────────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

// ── 校验结果类型 ────────────────────────────────────────────────────────────

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
  if (!isNonEmptyString(apiKey))    return fail("缺少 apiKey（非空字符串）");
  if (!isNonEmptyString(model))     return fail("缺少 model（非空字符串）");
  return { ok: true, data: { planText: planText.trim(), baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() } };
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
  if (!isNonEmptyString(apiKey))  return fail("缺少 apiKey（非空字符串）");
  if (!isNonEmptyString(model))   return fail("缺少 model（非空字符串）");

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
        baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim(),
      },
    };
  }

  // mode === "week"
  const days = Number(gp.daysPerWeek);
  const km = Number(gp.weeklyDistanceKm);
  if (!Number.isFinite(days) || days < 1 || days > 7) return fail("goalParams.daysPerWeek 必须是 1-7 的整数");
  if (!Number.isFinite(km) || km <= 0) return fail("goalParams.weeklyDistanceKm 必须是正数");

  return {
    ok: true,
    data: {
      goalParams: { mode: "week", vdot: gp.vdot, daysPerWeek: days, weeklyDistanceKm: km },
      baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim(),
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
      [key: string]: unknown;
    }>;
  }>;
}

const VALID_STEP_TYPES = new Set(["warmup", "interval", "recovery", "cooldown", "easy", "rest"]);

export function validateSyncBody(body: unknown): ValidateResult<SyncBody> {
  if (typeof body !== "object" || body === null) return fail("请求体必须是 JSON 对象");
  const { plan } = body as Record<string, unknown>;
  if (typeof plan !== "object" || plan === null) return fail("缺少 plan 对象");
  const { workouts } = plan as Record<string, unknown>;
  if (!Array.isArray(workouts)) return fail("缺少 plan.workouts 数组");

  for (let i = 0; i < workouts.length; i++) {
    const w = workouts[i];
    if (typeof w !== "object" || w === null) return fail(`workouts[${i}] 必须是对象`);
    if (typeof w.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(w.date)) {
      return fail(`workouts[${i}].date 必须是 YYYY-MM-DD 格式`);
    }
    if (typeof w.title !== "string") return fail(`workouts[${i}].title 必须是字符串`);
    if (!Array.isArray(w.steps)) return fail(`workouts[${i}].steps 必须是数组`);

    for (let j = 0; j < w.steps.length; j++) {
      const s = w.steps[j];
      if (typeof s !== "object" || s === null) return fail(`workouts[${i}].steps[${j}] 必须是对象`);
      if (typeof s.type !== "string" || !VALID_STEP_TYPES.has(s.type)) {
        return fail(`workouts[${i}].steps[${j}].type 无效，必须是：${[...VALID_STEP_TYPES].join(", ")}`);
      }
      if (s.distanceMeters == null && s.durationSeconds == null) {
        return fail(`workouts[${i}].steps[${j}] 必须包含 distanceMeters 或 durationSeconds 之一`);
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
    if (typeof workoutIds[i] !== "string" || !(workoutIds[i] as string).trim()) {
      return fail(`workoutIds[${i}] 必须是非空字符串`);
    }
  }
  return { ok: true, data: { workoutIds: workoutIds as string[] } };
}
