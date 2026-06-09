import { useState, useEffect } from 'react'
import { loadJson, saveJson, STORAGE_KEYS } from '../lib/storage'
import { apiFetch } from '../lib/api'

const LLM_PRESETS = {
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  qwen: {
    label: '通义千问（阿里云百炼）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  moonshot: { label: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  custom: { label: '自定义（OpenAI 兼容接口）', baseUrl: '', model: '' },
} as const

export type LlmProvider = keyof typeof LLM_PRESETS

export interface StoredLlmConfig {
  provider: LlmProvider
  baseUrl: string
  apiKey: string
  model: string
}

export { LLM_PRESETS }

interface ServerConfig {
  llmBaseUrl: string
  llmModel: string
  hasApiKey: boolean
}

export function useLlmConfig() {
  const saved = loadJson<StoredLlmConfig>(STORAGE_KEYS.LLM_CONFIG)

  const [provider, setProvider] = useState<LlmProvider>(saved?.provider ?? 'deepseek')
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? '')
  const [model, setModel] = useState(saved?.model ?? '')
  const [serverHasApiKey, setServerHasApiKey] = useState(false)
  const [serverReady, setServerReady] = useState(false)

  // 启动时从服务端读取配置，作为 localStorage 为空时的默认值
  useEffect(() => {
    apiFetch<ServerConfig>('/api/config').then(({ ok, data }) => {
      if (ok && data) {
        setServerHasApiKey(data.hasApiKey)
        // 只在 localStorage 为空时用服务端默认值
        if (!saved) {
          if (data.llmBaseUrl) setBaseUrl(data.llmBaseUrl)
          if (data.llmModel) setModel(data.llmModel)
        }
      }
      setServerReady(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 持久化到 localStorage
  useEffect(() => {
    if (!serverReady) return // 避免初始化阶段用空值覆盖
    saveJson(STORAGE_KEYS.LLM_CONFIG, { provider, baseUrl, apiKey, model })
  }, [provider, baseUrl, apiKey, model, serverReady])

  function handleProviderChange(p: LlmProvider) {
    setProvider(p)
    setBaseUrl(LLM_PRESETS[p].baseUrl)
    setModel(LLM_PRESETS[p].model)
  }

  // 前端有 apiKey，或者服务端配了 LLM_API_KEY 环境变量，都算"已配置"
  const isConfigured = (
    (apiKey.trim().length > 0 || serverHasApiKey) &&
    baseUrl.trim().length > 0 &&
    model.trim().length > 0
  )

  return {
    provider,
    baseUrl,
    apiKey,
    model,
    isConfigured,
    serverHasApiKey,
    setBaseUrl,
    setApiKey,
    setModel,
    handleProviderChange,
  }
}
