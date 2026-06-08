import { useState, useEffect } from 'react'
import { loadJson, saveJson, STORAGE_KEYS } from '../lib/storage'

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

export function useLlmConfig() {
  const saved = loadJson<StoredLlmConfig>(STORAGE_KEYS.LLM_CONFIG)

  const [provider, setProvider] = useState<LlmProvider>(saved?.provider ?? 'deepseek')
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? LLM_PRESETS.deepseek.baseUrl)
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? '')
  const [model, setModel] = useState(saved?.model ?? LLM_PRESETS.deepseek.model)

  // 持久化到 localStorage
  useEffect(() => {
    saveJson(STORAGE_KEYS.LLM_CONFIG, { provider, baseUrl, apiKey, model })
  }, [provider, baseUrl, apiKey, model])

  function handleProviderChange(p: LlmProvider) {
    setProvider(p)
    setBaseUrl(LLM_PRESETS[p].baseUrl)
    setModel(LLM_PRESETS[p].model)
  }

  const isConfigured = apiKey.trim().length > 0 && baseUrl.trim().length > 0 && model.trim().length > 0

  return {
    provider,
    baseUrl,
    apiKey,
    model,
    isConfigured,
    setBaseUrl,
    setApiKey,
    setModel,
    handleProviderChange,
  }
}
