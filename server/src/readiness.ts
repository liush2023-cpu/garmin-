/**
 * 综合训练准备度评分（0-100）。
 *
 * 评分规则：
 *   HRV vs 个人 7 日均值：高于 +5% → +20, ±5% → +10, 低于 -10% → -10
 *   睡眠评分 >75 → +20, 50-75 → +10, <50 → -5
 *   身体电量 >70 → +20, 40-70 → +10, <40 → 0
 *   急慢比 <0.8 → +10, >1.3 → -15
 *
 * 基础分 50，加上述加减分，clamp 到 0-100。
 */

import type { HrvDay } from "./garmin-health.js";
import type { SleepDay } from "./garmin-health.js";
import type { BodyBatteryDay } from "./garmin-health.js";
import type { TrainingLoadDay } from "./garmin-health.js";

export interface ReadinessResult {
  score: number;
  level: string;
  components: {
    hrvStatus: string;
    sleepQuality: string;
    bodyBattery: number | null;
    fatigueLoad: string;
  };
  suggestion: string;
}

export function calculateReadiness(
  hrvData: HrvDay[],
  sleepData: SleepDay[],
  bodyBattery: BodyBatteryDay[],
  trainingLoad: TrainingLoadDay[],
): ReadinessResult {
  let score = 50;

  // ── HRV ──────────────────────────────────────────────────────────────────
  const hrvValues = hrvData.filter((d) => d.hrvAvg != null).map((d) => d.hrvAvg!);
  const latestHrv = hrvValues.length > 0 ? hrvValues[hrvValues.length - 1] : null;
  const avgHrv = hrvValues.length > 0
    ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length
    : null;

  let hrvStatus = "无数据";
  if (latestHrv != null && avgHrv != null && avgHrv > 0) {
    const diff = (latestHrv - avgHrv) / avgHrv;
    if (diff > 0.05) {
      score += 20;
      hrvStatus = "优秀（高于基线）";
    } else if (diff >= -0.05) {
      score += 10;
      hrvStatus = "正常";
    } else if (diff < -0.10) {
      score -= 10;
      hrvStatus = "偏低（恢复不足）";
    } else {
      score += 5;
      hrvStatus = "略低";
    }
  }

  // ── 睡眠 ──────────────────────────────────────────────────────────────────
  const latestSleep = sleepData.length > 0 ? sleepData[sleepData.length - 1] : null;
  const sleepScore = latestSleep?.sleepScore ?? null;

  let sleepQuality = "无数据";
  if (sleepScore != null) {
    if (sleepScore > 75) {
      score += 20;
      sleepQuality = "优秀";
    } else if (sleepScore >= 50) {
      score += 10;
      sleepQuality = "良好";
    } else {
      score -= 5;
      sleepQuality = "较差";
    }
  }

  // ── 身体电量 ──────────────────────────────────────────────────────────────
  const latestBb = bodyBattery.length > 0 ? bodyBattery[bodyBattery.length - 1] : null;
  const bbCurrent = latestBb?.current ?? null;

  if (bbCurrent != null) {
    if (bbCurrent > 70) score += 20;
    else if (bbCurrent >= 40) score += 10;
    // <40: 不加分
  }

  // ── 训练负荷 ──────────────────────────────────────────────────────────────
  const latestLoad = trainingLoad.length > 0 ? trainingLoad[trainingLoad.length - 1] : null;
  const acwr = latestLoad?.acwr ?? null;

  let fatigueLoad = "无数据";
  if (acwr != null) {
    if (acwr < 0.8) {
      score += 10;
      fatigueLoad = "较低（可加强）";
    } else if (acwr > 1.3) {
      score -= 15;
      fatigueLoad = "过高（需减量）";
    } else {
      fatigueLoad = "适中";
    }
  }

  // ── 汇总 ──────────────────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));

  let level: string;
  if (score >= 80) level = "优秀";
  else if (score >= 60) level = "良好";
  else if (score >= 40) level = "一般";
  else level = "较差";

  // 生成建议
  let suggestion: string;
  if (score >= 75) {
    suggestion = "身体状态良好，可进行中高强度训练，建议阈值跑或 M 配速长跑。";
  } else if (score >= 50) {
    suggestion = "身体状态尚可，建议中等强度有氧训练，避免高强度间歇。";
  } else if (score >= 30) {
    suggestion = "身体恢复不足，建议轻松跑或交叉训练，降低训练强度。";
  } else {
    suggestion = "身体疲劳明显，建议休息或仅做轻度活动，优先保证睡眠。";
  }

  return {
    score,
    level,
    components: {
      hrvStatus,
      sleepQuality,
      bodyBattery: bbCurrent,
      fatigueLoad,
    },
    suggestion,
  };
}
