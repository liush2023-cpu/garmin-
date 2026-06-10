/**
 * AI 分析引擎 —— 复用用户已配置的 LLM（DeepSeek/通义千问等），
 * 传入健康数据，返回个性化训练建议。
 */

import type { HrvDay, SleepDay, BodyBatteryDay, TrainingLoadDay, ActivitySummary } from "./garmin-health.js";
import type { ReadinessResult } from "./readiness.js";

export interface HealthData {
  hrv: HrvDay[];
  sleep: SleepDay[];
  bodyBattery: BodyBatteryDay[];
  trainingLoad: TrainingLoadDay[];
  recentActivities: ActivitySummary[];
  readiness: ReadinessResult;
}

export interface AnalysisResult {
  readinessSummary: string;
  weeklyAdjustment: string;
  keySession: string;
  caution: string;
}

const SYSTEM_PROMPT = `你是一名遵循 Jack Daniels《丹尼尔斯跑步方程式》训练理论的跑步教练。
你会收到用户过去 14 天的健康和训练数据，需要基于数据给出个性化训练建议。

用户训练背景：
- 当前 VDOT：约 42
- 目标 VDOT：48
- 目标比赛：全程马拉松，目标成绩 3小时30分
- 当前周跑量：40-50 km/周
- 轻松跑配速：5:30-6:00/km
- 阈值跑配速：4:30/km
- 训练体系：Jack Daniels VDOT 框架
- 训练阶段：基础期（以 E 跑和 M 跑为主）
- 近期问题：膝关节后内侧轻微过负荷，注意控制 I 跑和下坡跑

请用简洁中文回答，每项不超过 3 句话。仅输出如下 JSON，不要输出其他文字：

{
  "readiness_summary": "当前身体状态评估",
  "weekly_adjustment": "本周训练量和强度调整建议",
  "key_session": "本周最重要的一次训练课次安排（含类型、距离、目标配速）",
  "caution": "需要注意的事项"
}`;

interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface OpenAIChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

/** 从 LLM 返回的文本中提取 JSON 对象 */
function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("未能在模型输出中找到 JSON");
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error("JSON 结构不完整");
}

/** 格式化健康数据为可读文本 */
function formatHealthData(data: HealthData): string {
  const lines: string[] = [];

  // HRV
  lines.push("【HRV 趋势（近 14 天）】");
  for (const d of data.hrv) {
    if (d.hrvAvg != null) lines.push(`  ${d.date}: HRV ${d.hrvAvg}ms (${d.hrvStatus ?? "—"})`);
  }

  // 睡眠
  lines.push("\n【睡眠数据（近 7 天）】");
  const recentSleep = data.sleep.slice(-7);
  for (const d of recentSleep) {
    const hrs = d.totalSleepSeconds != null ? (d.totalSleepSeconds / 3600).toFixed(1) : "—";
    lines.push(`  ${d.date}: ${hrs}h, 评分 ${d.sleepScore ?? "—"}, 深睡 ${d.deepSeconds != null ? Math.round(d.deepSeconds / 60) : "—"}min, HRV ${d.avgHrv ?? "—"}ms`);
  }

  // 身体电量
  lines.push("\n【身体电量（近 7 天）】");
  for (const d of data.bodyBattery) {
    lines.push(`  ${d.date}: ${d.current ?? "—"}`);
  }

  // 训练负荷
  lines.push("\n【训练负荷】");
  const latestLoad = data.trainingLoad.length > 0 ? data.trainingLoad[data.trainingLoad.length - 1] : null;
  if (latestLoad) {
    lines.push(`  最新急慢比: ${latestLoad.acwr ?? "—"} (急性 ${latestLoad.acuteLoad ?? "—"}, 慢性 ${latestLoad.chronicLoad ?? "—"})`);
  }

  // 近期活动
  lines.push("\n【最近 5 次跑步活动】");
  const runs = data.recentActivities.filter((a) => a.activityType === "running").slice(0, 5);
  for (const r of runs) {
    const km = (r.distance / 1000).toFixed(1);
    const min = Math.round(r.duration / 60);
    const pace = r.distance > 0 ? Math.round(r.duration / (r.distance / 1000) / 60) + ":" + String(Math.round((r.duration / (r.distance / 1000)) % 60)).padStart(2, "0") : "—";
    lines.push(`  ${r.startTimeLocal.slice(0, 10)}: ${km}km ${min}min 配速${pace}/km 心率${r.averageHR ?? "—"}bpm`);
  }

  // 准备度
  lines.push(`\n【当前准备度评分】${data.readiness.score}/100 (${data.readiness.level})`);
  lines.push(`  HRV: ${data.readiness.components.hrvStatus}`);
  lines.push(`  睡眠: ${data.readiness.components.sleepQuality}`);
  lines.push(`  身体电量: ${data.readiness.components.bodyBattery ?? "—"}`);
  lines.push(`  疲劳负荷: ${data.readiness.components.fatigueLoad}`);

  return lines.join("\n");
}

export async function analyzeWeeklyPlan(
  data: HealthData,
  llmConfig: LlmConfig,
): Promise<AnalysisResult> {
  const url = `${llmConfig.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const userMessage = `以下是用户过去 14 天的健康和训练数据：\n\n${formatHealthData(data)}\n\n请基于以上数据和用户训练背景，给出分析和建议。`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llmConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
      signal: controller.signal,
    });

    const body = (await res.json()) as OpenAIChatResponse;
    if (!res.ok) throw new Error(`模型接口调用失败：${body.error?.message ?? res.statusText}`);

    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new Error("模型未返回内容");

    const jsonStr = extractJsonObject(text);
    const parsed = JSON.parse(jsonStr) as Record<string, string>;

    return {
      readinessSummary: parsed.readiness_summary ?? "",
      weeklyAdjustment: parsed.weekly_adjustment ?? "",
      keySession: parsed.key_session ?? "",
      caution: parsed.caution ?? "",
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("AI 分析超时（60 秒），请稍后重试");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
