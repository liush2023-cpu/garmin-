import { LLM_PRESETS, type LlmProvider } from '../hooks/useLlmConfig'

interface Props {
  provider: LlmProvider
  baseUrl: string
  apiKey: string
  model: string
  serverHasApiKey: boolean
  onProviderChange: (p: LlmProvider) => void
  onBaseUrlChange: (v: string) => void
  onApiKeyChange: (v: string) => void
  onModelChange: (v: string) => void
  onClose: () => void
}

export function SettingsPanel({
  provider,
  baseUrl,
  apiKey,
  model,
  serverHasApiKey,
  onProviderChange,
  onBaseUrlChange,
  onApiKeyChange,
  onModelChange,
  onClose,
}: Props) {
  return (
    <section className="card">
      <h2>设置：大模型接口配置</h2>
      <p className="hint">
        用于「按 VDOT 生成课表」「自然语言解析」「AI 健康分析」等入口。接口地址和模型名称会保存在浏览器本地；
        API Key 只会发送给你选择的模型服务商，不会上传到本工具的服务器。
      </p>
      {serverHasApiKey && (
        <p className="hint" style={{ color: '#22c55e' }}>
          ✓ 服务端已配置 API Key（LLM_API_KEY 环境变量），此处无需填写。
        </p>
      )}
      <label>
        模型服务商
        <select value={provider} onChange={(e) => onProviderChange(e.target.value as LlmProvider)}>
          {Object.entries(LLM_PRESETS).map(([key, p]) => (
            <option key={key} value={key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        接口地址（Base URL）
        <input
          type="text"
          placeholder="https://api.deepseek.com/v1"
          value={baseUrl}
          onChange={(e) => onBaseUrlChange(e.target.value)}
        />
      </label>
      <label>
        API Key {serverHasApiKey && '（可选，留空使用服务端配置）'}
        <input type="password" placeholder="sk-..." value={apiKey} onChange={(e) => onApiKeyChange(e.target.value)} />
      </label>
      <label>
        模型名称
        <input type="text" placeholder="deepseek-chat" value={model} onChange={(e) => onModelChange(e.target.value)} />
      </label>
      <button className="ghost" onClick={onClose}>
        完成设置
      </button>
    </section>
  )
}
