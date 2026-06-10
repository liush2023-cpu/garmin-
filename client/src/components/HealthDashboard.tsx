import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'

interface ReadinessData {
  score: number
  level: string
  components: {
    hrvStatus: string
    sleepQuality: string
    bodyBattery: number | null
    fatigueLoad: string
  }
  suggestion: string
}

interface AnalysisData {
  readiness: ReadinessData
  analysis: {
    readinessSummary: string
    weeklyAdjustment: string
    keySession: string
    caution: string
  }
}

interface HrvDay { date: string; hrvAvg: number | null; hrvStatus: string | null }
interface SleepDay {
  date: string; totalSleepSeconds: number | null; deepSeconds: number | null;
  lightSeconds: number | null; remSeconds: number | null; sleepScore: number | null;
  avgHrv: number | null; restingHeartRate: number | null
}
interface ActivitySummary {
  activityId: string; activityName: string; activityType: string;
  startTimeLocal: string; distance: number; duration: number;
  averageHR: number | null; calories: number | null
}

interface Props {
  llmConfig: { baseUrl: string; apiKey: string; model: string }
}

export function HealthDashboard({ llmConfig }: Props) {
  const [readiness, setReadiness] = useState<ReadinessData | null>(null)
  const [hrv, setHrv] = useState<HrvDay[]>([])
  const [sleep, setSleep] = useState<SleepDay[]>([])
  const [activities, setActivities] = useState<ActivitySummary[]>([])
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisData['analysis'] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [r, h, s, a] = await Promise.all([
      apiFetch<ReadinessData>('/api/health/readiness'),
      apiFetch<{ data: HrvDay[] }>('/api/health/hrv?days=14'),
      apiFetch<{ data: SleepDay[] }>('/api/health/sleep?days=7'),
      apiFetch<{ data: ActivitySummary[] }>('/api/health/activities?limit=10'),
    ])
    setLoading(false)
    if (r.ok) setReadiness(r.data)
    if (h.ok) setHrv(h.data!.data)
    if (s.ok) setSleep(s.data!.data)
    if (a.ok) setActivities(a.data!.data)
    if (!r.ok) setError(r.error)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleAnalyze() {
    setAnalyzing(true)
    setAnalysis(null)
    const { ok, data, error: apiError } = await apiFetch<AnalysisData>('/api/health/analyze', {
      method: 'POST',
      body: llmConfig,
    })
    setAnalyzing(false)
    if (!ok) {
      setError(apiError)
      return
    }
    if (data?.readiness) setReadiness(data.readiness)
    if (data?.analysis) setAnalysis(data.analysis)
  }

  if (loading && !readiness) {
    return <section className="card"><p className="hint">正在加载健康数据…</p></section>
  }

  return (
    <>
      {/* 准备度 */}
      {readiness && (
        <section className="card">
          <h2>今日训练准备度</h2>
          <div className="row" style={{ alignItems: 'center', gap: 24 }}>
            <div style={{ textAlign: 'center', minWidth: 100 }}>
              <div style={{
                fontSize: 48, fontWeight: 700,
                color: readiness.score >= 60 ? '#22c55e' : readiness.score >= 40 ? '#eab308' : '#ef4444',
              }}>
                {readiness.score}
              </div>
              <div className="hint">{readiness.level}</div>
            </div>
            <div style={{ flex: 1 }}>
              <p className="hint">HRV：{readiness.components.hrvStatus}</p>
              <p className="hint">睡眠：{readiness.components.sleepQuality}</p>
              <p className="hint">身体电量：{readiness.components.bodyBattery ?? '—'}</p>
              <p className="hint">疲劳负荷：{readiness.components.fatigueLoad}</p>
            </div>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>{readiness.suggestion}</p>
          <button onClick={loadData} disabled={loading} style={{ marginTop: 8 }}>
            {loading ? '刷新中…' : '刷新数据'}
          </button>
        </section>
      )}

      {/* HRV 趋势 */}
      {hrv.length > 0 && (
        <section className="card">
          <h2>HRV 趋势（近 14 天）</h2>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 100 }}>
            {hrv.map((d, i) => {
              const max = Math.max(...hrv.filter(h => h.hrvAvg != null).map(h => h.hrvAvg!))
              const h = d.hrvAvg != null && max > 0 ? (d.hrvAvg / max) * 80 : 0
              return (
                <div key={i} title={`${d.date}: ${d.hrvAvg ?? '—'}ms`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: '100%', maxWidth: 32, height: h, borderRadius: 4,
                    background: 'var(--accent)',
                  }} />
                  <span className="hint" style={{ fontSize: 10 }}>{d.date.slice(5)}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 睡眠 */}
      {sleep.length > 0 && (
        <section className="card">
          <h2>睡眠数据（近 7 天）</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th>日期</th><th>总时长</th><th>深睡</th><th>REM</th><th>评分</th><th>HRV</th><th>静息心率</th>
                </tr>
              </thead>
              <tbody>
                {sleep.map((d, i) => (
                  <tr key={i}>
                    <td>{d.date.slice(5)}</td>
                    <td>{d.totalSleepSeconds != null ? `${Math.round(d.totalSleepSeconds / 3600 * 10) / 10}h` : '—'}</td>
                    <td>{d.deepSeconds != null ? `${Math.round(d.deepSeconds / 60)}m` : '—'}</td>
                    <td>{d.remSeconds != null ? `${Math.round(d.remSeconds / 60)}m` : '—'}</td>
                    <td>{d.sleepScore ?? '—'}</td>
                    <td>{d.avgHrv != null ? `${d.avgHrv}ms` : '—'}</td>
                    <td>{d.restingHeartRate != null ? `${d.restingHeartRate}bpm` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 近期活动 */}
      {activities.length > 0 && (
        <section className="card">
          <h2>近期活动</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th>日期</th><th>名称</th><th>类型</th><th>距离</th><th>时长</th><th>心率</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((a, i) => (
                  <tr key={i}>
                    <td>{a.startTimeLocal.slice(0, 10)}</td>
                    <td>{a.activityName || '—'}</td>
                    <td>{a.activityType}</td>
                    <td>{a.distance > 0 ? `${(a.distance / 1000).toFixed(1)}km` : '—'}</td>
                    <td>{a.duration > 0 ? `${Math.round(a.duration / 60)}min` : '—'}</td>
                    <td>{a.averageHR != null ? `${a.averageHR}bpm` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* AI 分析 */}
      <section className="card">
        <h2>AI 训练分析</h2>
        <p className="hint">基于你的健康数据，AI 会给出个性化训练建议。</p>
        <button onClick={handleAnalyze} disabled={analyzing || !llmConfig.apiKey}>
          {analyzing ? '分析中…' : '开始 AI 分析'}
        </button>
        {!llmConfig.apiKey && <p className="hint">请先在设置中配置 LLM 接口。</p>}
        {error && <p className="error">{error}</p>}
        {analysis && (
          <div style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>身体状态评估</h3>
            <p className="hint">{analysis.readinessSummary}</p>
            <h3 style={{ fontSize: 15, marginBottom: 8, marginTop: 12 }}>本周调整建议</h3>
            <p className="hint">{analysis.weeklyAdjustment}</p>
            <h3 style={{ fontSize: 15, marginBottom: 8, marginTop: 12 }}>重点课次</h3>
            <p className="hint">{analysis.keySession}</p>
            <h3 style={{ fontSize: 15, marginBottom: 8, marginTop: 12 }}>注意事项</h3>
            <p className="hint" style={{ color: '#b8860b' }}>{analysis.caution}</p>
          </div>
        )}
      </section>
    </>
  )
}
