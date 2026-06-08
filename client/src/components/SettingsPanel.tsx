import { LLM_PRESETS, type LlmProvider } from '../hooks/useLlmConfig'

interface Props {
  provider: LlmProvider
  baseUrl: string
  apiKey: string
  model: string
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
        用于「按 VDOT 生成课表」「自然语言解析」两个入口。接口地址、API Key、模型名称会保存在你浏览器的本地存储中，
        下次打开自动填好；它们只会发送给你选择的模型服务商，不会上传到本工具的服务器。
      </p>
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
        API Key
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
