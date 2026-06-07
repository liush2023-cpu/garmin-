import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { garminLogin, syncWorkouts, deleteWorkouts, isLoggedIn } from "./garmin.js";
import { parsePlanText } from "./parse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.post("/api/parse", async (req, res) => {
  try {
    const { planText, baseUrl, apiKey, model } = req.body as {
      planText?: string;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
    };
    if (!planText || !baseUrl || !apiKey || !model) {
      return res.status(400).json({ error: "缺少 planText / baseUrl / apiKey / model" });
    }
    const today = new Date().toISOString().slice(0, 10);
    const plan = await parsePlanText(planText, { baseUrl, apiKey, model }, today);
    res.json({ plan });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/garmin/login", async (req, res) => {
  try {
    const { username, password, domain } = req.body as { username?: string; password?: string; domain?: "garmin.com" | "garmin.cn" };
    if (!username || !password) {
      return res.status(400).json({ error: "缺少 username 或 password" });
    }
    await garminLogin(username, password, domain);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/garmin/status", (_req, res) => {
  res.json({ loggedIn: isLoggedIn() });
});

app.post("/api/sync", async (req, res) => {
  try {
    const { plan } = req.body as { plan?: { workouts: Parameters<typeof syncWorkouts>[0] } };
    if (!plan?.workouts) {
      return res.status(400).json({ error: "缺少训练计划数据" });
    }
    if (!isLoggedIn()) {
      return res.status(401).json({ error: "请先登录 Garmin 账号" });
    }
    const results = await syncWorkouts(plan.workouts);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/garmin/delete-workouts", async (req, res) => {
  try {
    const { workoutIds } = req.body as { workoutIds?: string[] };
    if (!Array.isArray(workoutIds) || workoutIds.length === 0) {
      return res.status(400).json({ error: "缺少 workoutIds" });
    }
    if (!isLoggedIn()) {
      return res.status(401).json({ error: "请先登录 Garmin 账号" });
    }
    const results = await deleteWorkouts(workoutIds);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Serve the built frontend in production (single-service deployment).
app.use(express.static(clientDist));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
