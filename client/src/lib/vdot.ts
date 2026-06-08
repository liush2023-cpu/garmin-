// --- VDOT 估算（Jack Daniels / Daniels-Gilbert 公式） ----------------------
//
// 给定一次比赛的距离（米）和完赛时间（分钟），按《丹尼尔斯跑步方程式》
// 里的经验公式精确计算 VDOT，避免用户去外部网站查表。
//
//   v        = 配速，单位 米/分钟
//   VO2      = -4.60 + 0.182258·v + 0.000104·v²            （该配速消耗的摄氧量）
//   %VO2max  = 0.8 + 0.1894393·e^(-0.012778·t) + 0.2989558·e^(-0.1932605·t)
//              （完赛时间 t 分钟时，全程平均用到的最大摄氧量百分比）
//   VDOT     = VO2 / %VO2max

export function estimateVdot(distanceMeters: number, timeMinutes: number): number | null {
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(timeMinutes)) return null
  if (distanceMeters <= 0 || timeMinutes <= 0) return null

  const v = distanceMeters / timeMinutes
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v
  const pctMax =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * timeMinutes) +
    0.2989558 * Math.exp(-0.1932605 * timeMinutes)
  if (pctMax <= 0) return null

  const vdot = vo2 / pctMax
  return Number.isFinite(vdot) && vdot > 0 ? vdot : null
}

export const RACE_PRESETS = {
  '5k': { label: '5 公里', meters: 5000 },
  '10k': { label: '10 公里', meters: 10000 },
  half: { label: '半程马拉松', meters: 21097.5 },
  full: { label: '全程马拉松', meters: 42195 },
  custom: { label: '自定义距离', meters: 0 },
} as const
