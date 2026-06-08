import { useState } from 'react'
import { useLlmConfig } from './hooks/useLlmConfig'
import { useGarminSession } from './hooks/useGarminSession'
import { useSyncLog } from './hooks/useSyncLog'
import { SettingsPanel } from './components/SettingsPanel'
import { PlanGenerator } from './components/PlanGenerator'
import { PlanParser } from './components/PlanParser'
import { PlanImporter } from './components/PlanImporter'
import { PlanPreview } from './components/PlanPreview'
import { GarminSync } from './components/GarminSync'
import type { TrainingPlan, SyncResult } from './types'
import './App.css'

function App() {
  const llm = useLlmConfig()
  const garmin = useGarminSession()
  const syncLog = useSyncLog()

  const [showSettings, setShowSettings] = useState(!llm.isConfigured)
  const [plan, setPlan] = useState<TrainingPlan | null>(null)

  const llmConfig = { baseUrl: llm.baseUrl, apiKey: llm.apiKey, model: llm.model }

  function handleSyncComplete(results: SyncResult[]) {
    syncLog.appendSyncLog(results, plan?.name)
  }

  function handleUndoComplete(workoutIds: string[]) {
    syncLog.removeFromSyncLog(workoutIds)
  }

  return (
    <div className="page">
      <div className="row">
        <div>
          <h1>Garmin AI 训练计划导入工具</h1>
          <p className="hint">
            选一种方式生成训练计划，预览确认后一键同步到你的 Garmin Connect 账号。
            所有数据仅在本地处理，不会上传到任何第三方服务器。
          </p>
        </div>
        <button className="ghost" onClick={() => setShowSettings((v) => !v)} title="模型接口设置">
          ⚙️ 设置
        </button>
      </div>

      {showSettings && (
        <SettingsPanel
          provider={llm.provider}
          baseUrl={llm.baseUrl}
          apiKey={llm.apiKey}
          model={llm.model}
          onProviderChange={llm.handleProviderChange}
          onBaseUrlChange={llm.setBaseUrl}
          onApiKeyChange={llm.setApiKey}
          onModelChange={llm.setModel}
          onClose={() => setShowSettings(false)}
        />
      )}

      <PlanGenerator isConfigured={llm.isConfigured} llmConfig={llmConfig} onPlanReady={setPlan} />

      <PlanParser isConfigured={llm.isConfigured} llmConfig={llmConfig} onPlanReady={setPlan} />

      <PlanImporter onPlanReady={setPlan} />

      {plan && <PlanPreview plan={plan} />}

      {plan && (
        <GarminSync
          plan={plan}
          domain={garmin.domain}
          username={garmin.username}
          password={garmin.password}
          loggedIn={garmin.loggedIn}
          loggingIn={garmin.loggingIn}
          restoringSession={garmin.restoringSession}
          loginError={garmin.loginError}
          onDomainChange={garmin.setDomain}
          onUsernameChange={garmin.setUsername}
          onPasswordChange={garmin.setPassword}
          onLoginErrorClear={() => garmin.setLoginError(null)}
          onLogin={garmin.login}
          onLogout={garmin.logout}
          onSyncComplete={handleSyncComplete}
          onUndoComplete={handleUndoComplete}
        />
      )}
    </div>
  )
}

export default App
