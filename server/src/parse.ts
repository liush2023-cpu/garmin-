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

export async function parsePlanText(planText: string, config: LlmConfig, today: string): Promise<TrainingPlan> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `今天的日期是 ${today}。请解析以下训练计划文本：\n\n${planText}` },
      ],
    }),
  });

  const data = (await res.json()) as OpenAIChatResponse;

  if (!res.ok) {
    throw new Error(`模型接口调用失败：${data.error?.message ?? res.statusText}`);
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("解析失败：模型未返回内容");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("解析失败：未能在模型输出中找到 JSON，请检查模型是否支持结构化输出");
  }

  return JSON.parse(jsonMatch[0]) as TrainingPlan;
}
