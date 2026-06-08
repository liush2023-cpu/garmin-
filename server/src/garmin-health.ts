/**
 * Garmin 健康数据拉取模块 —— 基于 garmin-connect 已有认证，拉取 HRV、睡眠、
 * 身体电量、静息心率、训练负荷、活动数据。
 *
 * 每个函数先查 SQLite 缓存，未命中再调 API；请求间隔 0.5s 防限流。
 */

import { getClient } from "./garmin.js";
import { cacheGet, cacheSet, TTL } from "./cache.js";

// ── 辅助 ─────────────────────────────────────────────────────────────────────

function ensureClient() {
  const c = getClient();
  if (!c) throw new Error("尚未登录 Garmin，请先登录");
  return c;
}

/** 日期格式 YYYY-MM-DD */
function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 最近 N 天的日期列表（含今天，从旧到新） */
function recentDates(days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(dateStr(d));
  }
  return dates;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── HRV 数据 ─────────────────────────────────────────────────────────────────

export interface HrvDay {
  date: string;
  hrvAvg: number | null;
  hrvStatus: string | null;
}

/** 拉取最近 N 天的夜间 HRV 均值 */
export async function getHrvData(days = 14): Promise<HrvDay[]> {
  const cacheKey = `hrv_${days}`;
  const cached = cacheGet<HrvDay[]>(cacheKey, TTL.DAILY);
  if (cached) return cached;

  const client = ensureClient();
  const gcApi = (client.client as any).url.GC_API as string;
  const results: HrvDay[] = [];

  for (const date of recentDates(days)) {
    try {
      const data: any = await client.get(
        `${gcApi}/wellness-service/wellness/dailyHeartRateVariability?date=${date}`,
      );
      results.push({
        date,
        hrvAvg: data?.hrvSummary?.avgHrv ?? null,
        hrvStatus: data?.hrvSummary?.status ?? null,
      });
    } catch {
      results.push({ date, hrvAvg: null, hrvStatus: null });
    }
    await sleep(500);
  }

  cacheSet(cacheKey, results);
  return results;
}

// ── 睡眠数据 ─────────────────────────────────────────────────────────────────

export interface SleepDay {
  date: string;
  totalSleepSeconds: number | null;
  deepSeconds: number | null;
  lightSeconds: number | null;
  remSeconds: number | null;
  awakeSeconds: number | null;
  sleepScore: number | null;
  avgHrv: number | null;
  restingHeartRate: number | null;
}

export async function getSleepData(days = 14): Promise<SleepDay[]> {
  const cacheKey = `sleep_${days}`;
  const cached = cacheGet<SleepDay[]>(cacheKey, TTL.DAILY);
  if (cached) return cached;

  const client = ensureClient();
  const results: SleepDay[] = [];

  for (const date of recentDates(days)) {
    try {
      const raw = await client.getSleepData(new Date(date)) as any;
      const dto = raw?.dailySleepDTO;
      results.push({
        date,
        totalSleepSeconds: dto?.sleepTimeSeconds ?? null,
        deepSeconds: dto?.deepSleepSeconds ?? null,
        lightSeconds: dto?.lightSleepSeconds ?? null,
        remSeconds: dto?.remSleepSeconds ?? null,
        awakeSeconds: dto?.awakeSleepSeconds ?? null,
        sleepScore: dto?.sleepScores?.overall?.value ?? null,
        avgHrv: raw?.avgOvernightHrv ?? null,
        restingHeartRate: raw?.restingHeartRate ?? null,
      });
    } catch {
      results.push({
        date, totalSleepSeconds: null, deepSeconds: null, lightSeconds: null,
        remSeconds: null, awakeSeconds: null, sleepScore: null, avgHrv: null, restingHeartRate: null,
      });
    }
    await sleep(500);
  }

  cacheSet(cacheKey, results);
  return results;
}

// ── 身体电量 ─────────────────────────────────────────────────────────────────

export interface BodyBatteryDay {
  date: string;
  /** 全天 Body Battery 值数组（时间序列） */
  values: Array<{ time: string; value: number }>;
  /** 当前值（最后一条） */
  current: number | null;
}

export async function getBodyBattery(days = 7): Promise<BodyBatteryDay[]> {
  const cacheKey = `bb_${days}`;
  const cached = cacheGet<BodyBatteryDay[]>(cacheKey, TTL.BODY_BATTERY);
  if (cached) return cached;

  const client = ensureClient();
  const gcApi = (client.client as any).url.GC_API as string;
  const results: BodyBatteryDay[] = [];

  for (const date of recentDates(days)) {
    try {
      const data: any = await client.get(
        `${gcApi}/wellness-service/wellness/bodyBattery/valuesForDay?date=${date}`,
      );
      const entries: Array<{ startGMT: string; value: number }> = data ?? [];
      const values = entries.map((e) => ({
        time: e.startGMT,
        value: e.value,
      }));
      results.push({
        date,
        values,
        current: values.length > 0 ? values[values.length - 1].value : null,
      });
    } catch {
      results.push({ date, values: [], current: null });
    }
    await sleep(500);
  }

  cacheSet(cacheKey, results);
  return results;
}

// ── 静息心率 ─────────────────────────────────────────────────────────────────

export interface RhrDay {
  date: string;
  restingHeartRate: number | null;
}

export async function getRestingHeartRate(days = 14): Promise<RhrDay[]> {
  const cacheKey = `rhr_${days}`;
  const cached = cacheGet<RhrDay[]>(cacheKey, TTL.DAILY);
  if (cached) return cached;

  const client = ensureClient();
  const results: RhrDay[] = [];

  for (const date of recentDates(days)) {
    try {
      const raw = await client.getHeartRate(new Date(date)) as any;
      results.push({
        date,
        restingHeartRate: raw?.restingHeartRate ?? null,
      });
    } catch {
      results.push({ date, restingHeartRate: null });
    }
    await sleep(500);
  }

  cacheSet(cacheKey, results);
  return results;
}

// ── 训练负荷 ─────────────────────────────────────────────────────────────────

export interface TrainingLoadDay {
  date: string;
  acuteLoad: number | null;
  chronicLoad: number | null;
  acwr: number | null; // 急慢比
}

export async function getTrainingLoad(days = 28): Promise<TrainingLoadDay[]> {
  const cacheKey = `load_${days}`;
  const cached = cacheGet<TrainingLoadDay[]>(cacheKey, TTL.TRAINING_LOAD);
  if (cached) return cached;

  const client = ensureClient();
  const gcApi = (client.client as any).url.GC_API as string;

  try {
    const data: any = await client.get(
      `${gcApi}/metrics-service/metrics/maxmet/daily?startDate=${recentDates(days)[0]}&endDate=${dateStr(new Date())}`,
    );
    // 响应结构可能因 Garmin 版本不同而变化，做防御性处理
    const rows: any[] = Array.isArray(data) ? data : data?.metricsList ?? [];
    const results: TrainingLoadDay[] = rows.map((r: any) => {
      const acute = r?.acuteTrainingLoad ?? r?.atl ?? null;
      const chronic = r?.chronicTrainingLoad ?? r?.ctl ?? null;
      return {
        date: r?.calendarDate ?? r?.date ?? "",
        acuteLoad: acute,
        chronicLoad: chronic,
        acwr: acute != null && chronic != null && chronic > 0
          ? Math.round((acute / chronic) * 100) / 100
          : null,
      };
    });
    cacheSet(cacheKey, results);
    return results;
  } catch {
    return [];
  }
}

// ── 活动列表 ─────────────────────────────────────────────────────────────────

export interface ActivitySummary {
  activityId: string;
  activityName: string;
  activityType: string;
  startTimeLocal: string;
  distance: number;       // 米
  duration: number;       // 秒
  averageHR: number | null;
  maxHR: number | null;
  calories: number | null;
  trainingLoad: number | null;
}

export async function getActivities(limit = 20): Promise<ActivitySummary[]> {
  const cacheKey = `activities_${limit}`;
  const cached = cacheGet<ActivitySummary[]>(cacheKey, TTL.ACTIVITIES);
  if (cached) return cached;

  const client = ensureClient();
  try {
    const raw = await client.getActivities(0, limit) as any[];
    const results: ActivitySummary[] = raw.map((a: any) => ({
      activityId: String(a.activityId),
      activityName: a.activityName ?? "",
      activityType: a.activityType?.typeKey ?? a.activityType ?? "unknown",
      startTimeLocal: a.startTimeLocal ?? "",
      distance: a.distance ?? 0,
      duration: a.duration ?? 0,
      averageHR: a.averageHR ?? null,
      maxHR: a.maxHR ?? null,
      calories: a.calories ?? null,
      trainingLoad: a.activityTrainingLoad ?? null,
    }));
    cacheSet(cacheKey, results);
    return results;
  } catch {
    return [];
  }
}

// ── 单次活动详情 ─────────────────────────────────────────────────────────────

export interface ActivityDetail {
  activityId: string;
  activityName: string;
  activityType: string;
  startTimeLocal: string;
  distance: number;
  duration: number;
  averageHR: number | null;
  maxHR: number | null;
  calories: number | null;
  averageSpeed: number | null;   // m/s
  maxSpeed: number | null;
  averageCadence: number | null;
  elevationGain: number | null;
  elevationLoss: number | null;
  trainingLoad: number | null;
  vo2max: number | null;
  // 心率区间分布（如果有）
  hrZones: Record<string, number> | null;
}

export async function getActivityDetail(activityId: string): Promise<ActivityDetail> {
  const cacheKey = `activity_${activityId}`;
  const cached = cacheGet<ActivityDetail>(cacheKey, TTL.ACTIVITY_DETAIL);
  if (cached) return cached;

  const client = ensureClient();
  const raw = await client.getActivity({ activityId: Number(activityId) }) as any;

  const result: ActivityDetail = {
    activityId: String(raw.activityId),
    activityName: raw.activityName ?? "",
    activityType: raw.activityType?.typeKey ?? raw.activityType ?? "unknown",
    startTimeLocal: raw.startTimeLocal ?? "",
    distance: raw.distance ?? 0,
    duration: raw.duration ?? 0,
    averageHR: raw.averageHR ?? null,
    maxHR: raw.maxHR ?? null,
    calories: raw.calories ?? null,
    averageSpeed: raw.averageSpeed ?? null,
    maxSpeed: raw.maxSpeed ?? null,
    averageCadence: raw.averageCadence ?? null,
    elevationGain: raw.elevationGain ?? null,
    elevationLoss: raw.elevationLoss ?? null,
    trainingLoad: raw.activityTrainingLoad ?? null,
    vo2max: raw.vO2MaxValue ?? null,
    hrZones: null,
  };

  cacheSet(cacheKey, result);
  return result;
}
