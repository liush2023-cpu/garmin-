import type { Request, Response, NextFunction } from "express";

/**
 * 内存级滑动窗口频率限制 —— 零依赖，适合单进程部署。
 *
 * 用法：
 *   app.post("/api/garmin/login", loginLimiter, handler)
 *   app.post("/api/parse",       apiLimiter,  handler)
 */

interface RateLimitOptions {
  /** 时间窗口（毫秒），默认 60 000（1 分钟） */
  windowMs: number;
  /** 窗口内允许的最大请求数 */
  max: number;
  /** 触发限制时返回的 HTTP 状态码 */
  statusCode?: number;
  /** 触发限制时返回的消息 */
  message?: string;
}

interface TimestampEntry {
  /** 该 IP 在当前窗口内每次请求的时间戳 */
  hits: number[];
}

const stores = new Map<string, Map<string, TimestampEntry>>();

/**
 * 创建一个 Express 中间件，按 IP 做滑动窗口频率限制。
 * 每个调用方（loginLimiter / apiLimiter）拥有独立的存储桶，互不影响。
 */
export function createRateLimiter(opts: RateLimitOptions) {
  const { windowMs, max, statusCode = 429, message = "请求过于频繁，请稍后再试" } = opts;

  // 每个中间件实例独占一个 store，避免 key 冲突
  const store = new Map<string, TimestampEntry>();
  stores.set(`${Date.now()}-${Math.random()}`, store);

  // 定期清理过期条目，防止内存泄漏（每 5 分钟一次）
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      // 移除窗口外的旧记录
      entry.hits = entry.hits.filter((t) => now - t < windowMs);
      if (entry.hits.length === 0) store.delete(key);
    }
  }, 5 * 60_000);

  // 允许 Node 正常退出，不被定时器阻塞
  cleanupInterval.unref();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();

    let entry = store.get(ip);
    if (!entry) {
      entry = { hits: [] };
      store.set(ip, entry);
    }

    // 移除窗口外的旧记录
    entry.hits = entry.hits.filter((t) => now - t < windowMs);

    if (entry.hits.length >= max) {
      // 返回 Retry-After 头，告知客户端何时可以重试
      const oldestInWindow = entry.hits[0];
      const retryAfterSec = Math.ceil((windowMs - (now - oldestInWindow)) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(statusCode).json({ error: message });
    }

    entry.hits.push(now);
    next();
  };
}

// ── 预置的两个限制器 ──────────────────────────────────────────────────────────

/**
 * Garmin 登录接口：同一 IP 每分钟最多 5 次。
 * 防止暴力破解 Garmin 密码。
 */
export const loginLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  message: "登录尝试过于频繁，请 1 分钟后再试",
});

/**
 * LLM 解析/生成接口：同一 IP 每分钟最多 30 次。
 * 防止 API Key 被滥用刷量。
 */
export const apiLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: "AI 接口调用过于频繁，请稍后再试",
});
