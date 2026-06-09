import type { TrainingPlan } from "./types.js";

const SYSTEM_PROMPT = `你是一个训练计划解析助手。用户会粘贴一段自然语言描述的跑步训练计划（可能是 AI 生成的，包含多天安排、目标配速、目标心率等信息）。
请将其解析为如下 JSON 结构并仅输出 JSON，不要输出任何其他文字、不要使用 markdown 代码块：

{
  "name": "计划名称",
  "workouts": [
    {
      "date": "YYYY-MM-DD",
      "title": "训练标题，例如 周二阈值跑",
      "steps": [
        {
          "type": "warmup|interval|recovery|cooldown|easy|rest",
          "distanceMeters": 1000,
          "durationSeconds": 600,
          "targetPace": "5:30/km 或 5:55-6:10/km",
          "targetHeartRate": "150-160 或 <145，单位 bpm",
          "repeat": 6,
          "notes": "备注，如训练目的、强度说明等"
        }
      ]
    }
  ]
}

规则：
- 若文本未给出具体日期，从今天开始按"周一/周二..."顺序推算日期。
- 务必尽量提取目标配速（targetPace）和目标心率（targetHeartRate），文本中给出的区间原样保留（如 "168-174" 或 "<145"）。
- 若训练包含"N 组 X + 组间 Y 恢复"这类重复结构（如"3 组 × 8 分钟阈值跑，组间 2 分钟慢跑恢复"），
  请把 X 和 Y 拆成相邻的步骤，并给它们标注同样的 repeat: N（例如 interval 步骤和紧跟着的
  recovery 步骤都写 "repeat": 3）；不要把它们拆散到 steps 数组的不同位置，也不要展开成
  N 份重复的独立步骤——程序会根据"相邻且 repeat 相同"自动把它们合并成一个重复组。
- 每个训练步骤至少包含 distanceMeters 或 durationSeconds 之一。
- 找不到的字段直接省略，不要编造。
- rest（休息日）可以没有 steps 或 steps 为空数组，也可以用一个 rest 步骤携带备注（如可选活动）。
- 力量训练等非跑步项目，用 type "easy" 加 durationSeconds，并在 notes 中写明训练内容。`;

interface OpenAIChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export interface LlmConfig {
  /** OpenAI 兼容接口的 base URL，例如 https://api.deepseek.com/v1 或 https://dashscope.aliyuncs.com/compatible-mode/v1 */
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** LLM 调用超时（毫秒）—— 模型生成可能较慢，给 60 秒 */
const LLM_TIMEOUT_MS = 60_000;

/**
 * 从 LLM 返回的文本中提取第一个完整 JSON 对象。
 * 使用括号匹配算法，比简单的正则 `/\{[\s\S]*\}/` 更健壮——
 * 后者在文本包含多个 `{}` 或嵌套对象时可能匹配到错误的边界。
 */
function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("解析失败：未能在模型输出中找到 JSON，请检查模型是否支持结构化输出");

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  throw new Error("解析失败：JSON 结构不完整（括号未闭合），请检查模型输出");
}

async function callLlmForPlan(systemPrompt: string, userMessage: string, config: LlmConfig): Promise<TrainingPlan> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`模型接口调用超时（${LLM_TIMEOUT_MS / 1000} 秒），请检查网络或换一个响应更快的模型`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const data = (await res.json()) as OpenAIChatResponse;

  if (!res.ok) {
    throw new Error(`模型接口调用失败：${data.error?.message ?? res.statusText}`);
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("解析失败：模型未返回内容");

  const jsonStr = extractJsonObject(text);
  return JSON.parse(jsonStr) as TrainingPlan;
}

const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 返回 today 之后最近的周一（若 today 本身是周一则返回今天） */
function nextOrSameMonday(today: string): string {
  const d = new Date(today + 'T00:00:00');
  const day = d.getDay(); // 0=Sun,1=Mon,...6=Sat
  const daysToMon = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysToMon);
  return d.toISOString().slice(0, 10);
}

export async function parsePlanText(planText: string, config: LlmConfig, today: string): Promise<TrainingPlan> {
  const todayWeekday = WEEKDAY_ZH[new Date(today + 'T00:00:00').getDay()];
  const planMonday   = nextOrSameMonday(today);
  const ctx = `今天的日期是 ${today}（${todayWeekday}）。` +
    `若计划按"周一/周三/…"排列，请以 ${planMonday}（周一）为本周起点，将各训练日映射到对应的准确日期（如周三 = ${planMonday} 后第 2 天，周日 = 后第 6 天），不要偏移。` +
    `请解析以下训练计划文本：\n\n${planText}`;
  return callLlmForPlan(SYSTEM_PROMPT, ctx, config);
}

// --- 按 VDOT / 训练目的直接生成课表 ---------------------------------------
//
// 对应"佳明课表生成工具"需求文档里的模块二：用户不必自己写文字描述，
// 而是给出当前跑力（VDOT）和训练诉求，由 AI 按 Jack Daniels 训练理论
// 直接产出结构化课表（输出的 JSON 结构与 parsePlanText 完全一致，
// 因此可以直接复用现有的编辑器、校验、同步、重复组/目标类型转换逻辑）。

const GENERATE_SYSTEM_PROMPT = `你是一名遵循 Jack Daniels《丹尼尔斯跑步方程式》训练理论的跑步教练兼训练计划生成助手。
用户会给出当前跑力（VDOT）和训练诉求，你需要据此生成结构化训练计划，并仅输出如下 JSON，不要输出任何其他文字、不要使用 markdown 代码块：

{
  "name": "计划名称",
  "workouts": [
    {
      "date": "YYYY-MM-DD",
      "title": "训练标题，例如 周二阈值跑",
      "steps": [
        {
          "type": "warmup|interval|recovery|cooldown|easy|rest",
          "distanceMeters": 1000,
          "durationSeconds": 600,
          "targetPace": "5:30/km 或 5:55-6:10/km",
          "targetHeartRate": "150-160 或 <145，单位 bpm",
          "repeat": 6,
          "notes": "备注，如训练目的、强度说明等"
        }
      ]
    }
  ]
}

规则：
- 必须根据用户给出的 VDOT，按 Jack Daniels 训练理论换算出对应强度的训练配速区间（E/M/T/I/R 配速），并填入 targetPace；
  同时给出与该强度匹配的目标心率区间，填入 targetHeartRate。
- 每次训练都要包含合理的热身（warmup）和放松（cooldown）步骤，并标注其时长与心率区间（通常为低强度，如 E 配速 / 心率 1-2 区）。
- 主体训练若包含"N 组 X + 组间 Y 恢复"这类重复结构（如"3 组 × 8 分钟阈值跑，组间 2 分钟慢跑恢复"），
  请把 X 和 Y 拆成相邻的步骤，并给它们标注同样的 repeat: N（例如 interval 步骤和紧跟着的
  recovery 步骤都写 "repeat": 3）；不要把它们拆散到 steps 数组的不同位置，也不要展开成
  N 份重复的独立步骤——程序会根据"相邻且 repeat 相同"自动把它们合并成一个重复组。
- 【重要：数值必须自洽】每个训练步骤都必须同时给出 distanceMeters 与 durationSeconds，且二者必须与 targetPace 互相匹配
  （duration ≈ distance ÷ 配速对应的速度，三者换算误差应在 5% 以内），不允许出现"配速很慢但用很短时间跑了很长距离"
  这类不自洽的数据（例如 8 公里配速跑不可能只用 20 分钟完成——那相当于 2:30/km 的配速，远超人类正常跑步速度）。
  生成前请先选定 distanceMeters 或 durationSeconds 中的一个合理值，再用 targetPace 算出另一个，三者保持一致。
- 数值要符合常识与该 VDOT 跑者的真实能力：配速、心率、距离、时长的组合必须是现实中可达成的（如轻松跑配速通常在
  5:30-7:00/km 区间，不会快于该跑者的 M 配速；间歇/速度训练单次距离一般不超过 1-2 公里）。生成后请自行核对一遍每个
  步骤"距离 ÷ 时长"算出的实际配速是否落在 targetPace 区间内，不一致则修正数值而不是修改区间。
- 每个训练步骤都不能省略 distanceMeters 或 durationSeconds；找不到的字段直接省略，不要编造无意义的内容；
  但 targetPace / targetHeartRate 必须基于 VDOT 给出，不能省略。
- 若用户要求生成"一周计划"，需安排训练日和休息日（rest，可以没有 steps），训练日数量应与用户给出的"每周可训练天数"一致，
  并参考用户给出的"当前周跑量"合理分配每天的训练量，使一周总量与之匹配、循序渐进。
- 若用户只要求"单次训练课表"，只生成一天（workouts 数组长度为 1）即可，date 使用今天的日期。`;

export type SingleWorkoutGoal = "aerobic" | "marathon" | "threshold" | "speed";

const GOAL_LABELS: Record<SingleWorkoutGoal, string> = {
  aerobic: "有氧耐力（低强度长距离，对应 E 配速，心率区间 2 区）",
  marathon: "马拉松配速（模拟比赛强度，对应 VDOT 的 M 配速）",
  threshold: "乳酸阈值（阈值配速间歇，对应 VDOT 的 T 配速）",
  speed: "无氧 / 速度（高强度短间歇，对应 VDOT 的 I/R 配速）",
};

export interface GenerateSingleWorkoutParams {
  mode: "single";
  vdot: number;
  goal: SingleWorkoutGoal;
}

export interface GenerateWeekPlanParams {
  mode: "week";
  vdot: number;
  daysPerWeek: number;
  weeklyDistanceKm: number;
}

export type GeneratePlanParams = GenerateSingleWorkoutParams | GenerateWeekPlanParams;

export async function generatePlan(params: GeneratePlanParams, config: LlmConfig, today: string): Promise<TrainingPlan> {
  const todayWeekday = WEEKDAY_ZH[new Date(today + "T00:00:00").getDay()];
  const planMonday   = nextOrSameMonday(today);
  const userMessage =
    params.mode === "single"
      ? `今天的日期是 ${today}（${todayWeekday}）。我当前的跑力 VDOT 约为 ${params.vdot}。
请为我生成一份"单次训练课表"，训练目的是：${GOAL_LABELS[params.goal]}。
日期请填今天（${today}）。`
      : `今天的日期是 ${today}（${todayWeekday}）。本周的周一为 ${planMonday}，请以此为起点安排 7 天日期（周一=${planMonday}，周二=${planMonday} 后+1天，以此类推）。
我当前的跑力 VDOT 约为 ${params.vdot}，每周可训练 ${params.daysPerWeek} 天，目前每周跑量约为 ${params.weeklyDistanceKm} 公里。
请为我生成一份完整的"一周训练计划"（从 ${planMonday} 开始的 7 天），包含训练日和休息日安排，
每个训练日对应一份具体课表，整体符合 Jack Daniels 训练理论。`;

  return callLlmForPlan(GENERATE_SYSTEM_PROMPT, userMessage, config);
}
