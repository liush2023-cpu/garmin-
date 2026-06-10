/**
 * 健康数据 API 路由 —— 挂载在 /api/health 下。
 */

import { Router } from "express";
import { isLoggedIn } from "./garmin.js";
import {
  getHrvData,
  getSleepData,
  getBodyBattery,
  getRestingHeartRate,
  getTrainingLoad,
  getActivities,
  getActivityDetail,
} from "./garmin-health.js";
import { calculateReadiness } from "./readiness.js";
import { analyzeWeeklyPlan, type HealthData } from "./analyzer.js";
import { cacheCleanup } from "./cache.js";

const router = Router();

/** 所有健康路由都需要先登录 Garmin */
router.use((_req, res, next) => {
  if (!isLoggedIn()) return res.status(401).json({ error: "请先登录 Garmin 账号" });
  next();
});

// ── 系统状态 ─────────────────────────────────────────────────────────────────

router.get("/status", async (_req, res) => {
  try {
    // 清理过期缓存
    cacheCleanup();

    const [hrv, bb] = await Promise.all([getHrvData(1), getBodyBattery(1)]);
    const latestHrv = hrv[0] ?? null;
    const latestBb = bb[0] ?? null;

    res.json({
      ok: true,
      garmin: true,
      latestHrv: latestHrv?.hrvAvg ?? null,
      latestBodyBattery: latestBb?.current ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── 各项数据端点 ─────────────────────────────────────────────────────────────

router.get("/hrv", async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 14, 90);
    res.json({ data: await getHrvData(days) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/sleep", async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 14, 90);
    res.json({ data: await getSleepData(days) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/body-battery", async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 7, 30);
    res.json({ data: await getBodyBattery(days) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/rhr", async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 14, 90);
    res.json({ data: await getRestingHeartRate(days) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/load", async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 28, 90);
    res.json({ data: await getTrainingLoad(days) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/activities", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    res.json({ data: await getActivities(limit) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/activity/:id", async (req, res) => {
  try {
    res.json({ data: await getActivityDetail(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── 综合准备度 ───────────────────────────────────────────────────────────────

router.get("/readiness", async (_req, res) => {
  try {
    const [hrv, sleep, bb, load] = await Promise.all([
      getHrvData(14),
      getSleepData(7),
      getBodyBattery(1),
      getTrainingLoad(28),
    ]);
    const result = calculateReadiness(hrv, sleep, bb, load);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── AI 分析 ──────────────────────────────────────────────────────────────────

router.post("/analyze", async (req, res) => {
  const { baseUrl, apiKey, model } = req.body as {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
  if (!baseUrl || !apiKey || !model) {
    return res.status(400).json({ error: "缺少 LLM 配置（baseUrl / apiKey / model）" });
  }

  try {
    const [hrv, sleep, bb, load, activities, readinessRaw] = await Promise.all([
      getHrvData(14),
      getSleepData(7),
      getBodyBattery(7),
      getTrainingLoad(28),
      getActivities(10),
      // 内联计算 readiness
      (async () => {
        const [h, s, b, l] = await Promise.all([
          getHrvData(14), getSleepData(7), getBodyBattery(1), getTrainingLoad(28),
        ]);
        return calculateReadiness(h, s, b, l);
      })(),
    ]);

    const healthData: HealthData = {
      hrv, sleep, bodyBattery: bb, trainingLoad: load,
      recentActivities: activities, readiness: readinessRaw,
    };

    const analysis = await analyzeWeeklyPlan(healthData, { baseUrl, apiKey, model });
    res.json({ readiness: readinessRaw, analysis });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
