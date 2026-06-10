import { useState } from 'react'
import { estimateVdot, RACE_PRESETS } from '../lib/vdot'

interface Props {
  onEstimate: (vdot: number) => void
}

export function VdotEstimator({ onEstimate }: Props) {
  const [raceDistKey, setRaceDistKey] = useState<keyof typeof RACE_PRESETS>('10k')
  const [raceCustomKm, setRaceCustomKm] = useState('10')
  const [raceHours, setRaceHours] = useState('0')
  const [raceMinutes, setRaceMinutes] = useState('45')
  const [raceSeconds, setRaceSeconds] = useState('0')
  const [vdotEstimate, setVdotEstimate] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleEstimate() {
    setError(null)
    setVdotEstimate(null)
    const distanceMeters =
      raceDistKey === 'custom' ? Number(raceCustomKm) * 1000 : RACE_PRESETS[raceDistKey].meters
    const timeMinutes =
      (Number(raceHours) || 0) * 60 + (Number(raceMinutes) || 0) + (Number(raceSeconds) || 0) / 60
    if (!distanceMeters || distanceMeters <= 0) {
      setError('请输入有效的比赛距离')
      return
    }
    if (!timeMinutes || timeMinutes <= 0) {
      setError('请输入有效的完赛时间')
      return
    }
    const vdot = estimateVdot(distanceMeters, timeMinutes)
    if (vdot == null) {
      setError('无法根据该成绩估算 VDOT，请检查距离和时间是否合理')
      return
    }
    setVdotEstimate(vdot)
    onEstimate(vdot)
  }

  return (
    <div className="card" style={{ background: 'var(--code-bg)', boxShadow: 'none', margin: '0 0 16px' }}>
      <h2 style={{ fontSize: 15 }}>不知道自己的 VDOT？用近期比赛成绩估算</h2>
      <p className="hint">
        按 Jack Daniels《丹尼尔斯跑步方程式》里的 VDOT 公式精确计算（与官方对照表、主流在线计算器同源），
        填入一次近期全力跑的比赛/测试成绩（距离 + 完赛时间）即可。
      </p>
      <div className="row">
        <label style={{ flex: 1, minWidth: 160 }}>
          比赛距离
          <select value={raceDistKey} onChange={(e) => setRaceDistKey(e.target.value as keyof typeof RACE_PRESETS)}>
            {Object.entries(RACE_PRESETS).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {raceDistKey === 'custom' && (
          <label style={{ flex: 1, minWidth: 120 }}>
            距离（公里）
            <input type="number" min={0} step="0.1" value={raceCustomKm} onChange={(e) => setRaceCustomKm(e.target.value)} />
          </label>
        )}
      </div>
      <div className="row">
        <label style={{ flex: 1, minWidth: 80 }}>
          小时
          <input type="number" min={0} value={raceHours} onChange={(e) => setRaceHours(e.target.value)} />
        </label>
        <label style={{ flex: 1, minWidth: 80 }}>
          分钟
          <input type="number" min={0} max={59} value={raceMinutes} onChange={(e) => setRaceMinutes(e.target.value)} />
        </label>
        <label style={{ flex: 1, minWidth: 80 }}>
          秒
          <input type="number" min={0} max={59} value={raceSeconds} onChange={(e) => setRaceSeconds(e.target.value)} />
        </label>
      </div>
      <button className="ghost" onClick={handleEstimate}>
        估算 VDOT
      </button>
      {error && <p className="error">{error}</p>}
      {vdotEstimate != null && (
        <p className="hint">
          估算结果：<strong>VDOT ≈ {vdotEstimate.toFixed(1)}</strong>（已自动填入下方"当前跑力"）
        </p>
      )}
    </div>
  )
}
