/**
 * 统一的 fetch 封装 —— 带超时、可取消、错误解析。
 *
 * 用法：
 *   const { data, error } = await apiFetch<{ plan: TrainingPlan }>('/api/parse', { body: {...} })
 *   // 或配合 AbortController 取消：
 *   const controller = new AbortController()
 *   const { data } = await apiFetch('/api/parse', { body: {...}, signal: controller.signal })
 *   // 组件卸载时：controller.abort()
 */

const DEFAULT_TIMEOUT_MS = 60_000;

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  timeoutMs?: number;
}

interface ApiOk<T> {
  ok: true;
  data: T;
  error: null;
}

interface ApiFail {
  ok: false;
  data: null;
  error: string;
  status?: number;
}

export type ApiResult<T> = ApiOk<T> | ApiFail;

export async function apiFetch<T = unknown>(
  url: string,
  options: ApiFetchOptions = {},
): Promise<ApiResult<T>> {
  const { body, timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...init } = options;

  const controller = new AbortController();
  // 如果外部传了 signal，联动取消
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        data: null,
        error: (data as { error?: string }).error ?? `请求失败（HTTP ${res.status}）`,
        status: res.status,
      };
    }

    return { ok: true, data: data as T, error: null };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // 区分外部取消和超时取消
      if (signal?.aborted) {
        return { ok: false, data: null, error: "请求已取消" };
      }
      return { ok: false, data: null, error: `请求超时（${timeoutMs / 1000} 秒）` };
    }
    return {
      ok: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}
