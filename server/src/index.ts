import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { garminLogin, garminRestoreSession, garminExportSession, syncWorkouts, deleteWorkouts, isLoggedIn } from "./garmin.js";
import { parsePlanText, generatePlan } from "./parse.js";
import { loginLimiter, apiLimiter } from "./rate-limit.js";
import {
  validateParseBody,
  validateGenerateBody,
  validateLoginBody,
  validateRestoreBody,
  validateSyncBody,
  validateDeleteBody,
} from "./validate.js";
import healthRouter from "./health-routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ── 服务端配置（环境变量，供前端读取默认值）──────────────────────────────────

app.get("/api/config", (_req, res) => {
  res.json({
    llmBaseUrl: process.env.LLM_BASE_URL ?? "",
    llmModel: process.env.LLM_MODEL ?? "",
    // apiKey 只返回布尔值，不暴露实际 key
    hasApiKey: !!process.env.LLM_API_KEY,
  });
});

// 供 parse/generate 端点内部使用：如果请求里没带 apiKey，就用环境变量里的
const SERVER_LLM_API_KEY = process.env.LLM_API_KEY ?? "";

// ── LLM 相关 ────────────────────────────────────────────────────────────────

app.post("/api/parse", apiLimiter, async (req, res) => {
  const v = validateParseBody(req.body);
  if (!v.ok) return res.status(v.status).json({ error: v.error });
  // 如果前端没传 apiKey，用服务端配置的
  const config = { ...v.data, apiKey: v.data.apiKey || SERVER_LLM_API_KEY };
  if (!config.apiKey) return res.status(400).json({ error: "缺少 API Key（请在设置中填写或在服务端配置 LLM_API_KEY 环境变量）" });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const plan = await parsePlanText(v.data.planText, config, today);
    res.json({ plan });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/generate", apiLimiter, async (req, res) => {
  const v = validateGenerateBody(req.body);
  if (!v.ok) return res.status(v.status).json({ error: v.error });
  const config = { ...v.data, apiKey: v.data.apiKey || SERVER_LLM_API_KEY };
  if (!config.apiKey) return res.status(400).json({ error: "缺少 API Key（请在设置中填写或在服务端配置 LLM_API_KEY 环境变量）" });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const plan = await generatePlan(v.data.goalParams, config, today);
    res.json({ plan });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── 健康数据分析 ──────────────────────────────────────────────────────────────

app.use("/api/health", healthRouter);

// ── Garmin 认证 ──────────────────────────────────────────────────────────────

app.post("/api/garmin/login", loginLimiter, async (req, res) => {
  const v = validateLoginBody(req.body);
  if (!v.ok) return res.status(v.status).json({ error: v.error });
  try {
    await garminLogin(v.data.username, v.data.password, v.data.domain);
    const session = garminExportSession();
    res.json({ ok: true, session });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Restore a previous session from tokens saved client-side, so the user
// doesn't have to re-enter their Garmin password every time.
app.post("/api/garmin/restore", async (req, res) => {
  const v = validateRestoreBody(req.body);
  if (!v.ok) return res.status(v.status).json({ error: v.error });
  try {
    const ok = await garminRestoreSession(
      v.data.tokens as unknown as Parameters<typeof garminRestoreSession>[0],
      v.data.domain,
    );
    if (!ok) return res.status(401).json({ error: "会话已过期，请重新登录" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/garmin/status", (_req, res) => {
  res.json({ loggedIn: isLoggedIn() });
});

// ── Garmin 同步 / 撤销 ──────────────────────────────────────────────────────

app.post("/api/sync", async (req, res) => {
  const v = validateSyncBody(req.body);
  if (!v.ok) return res.status(v.status).json({ error: v.error });
  if (!isLoggedIn()) return res.status(401).json({ error: "请先登录 Garmin 账号" });
  try {
    const results = await syncWorkouts(v.data.workouts as Parameters<typeof syncWorkouts>[0]);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/garmin/delete-workouts", async (req, res) => {
  const v = validateDeleteBody(req.body);
  if (!v.ok) return res.status(v.status).json({ error: v.error });
  if (!isLoggedIn()) return res.status(401).json({ error: "请先登录 Garmin 账号" });
  try {
    const results = await deleteWorkouts(v.data.workoutIds);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── 静态文件托管 ─────────────────────────────────────────────────────────────

// Serve the built frontend in production (single-service deployment).
app.use(express.static(clientDist));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
