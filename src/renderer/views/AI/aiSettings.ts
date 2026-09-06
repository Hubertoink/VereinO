import type { TAiSettingsGetOutput } from '../../../../electron/main/ipc/schemas'

export const DEFAULT_AI_SETTINGS: TAiSettingsGetOutput = {
  hasApiKey: false,
  model: 'gpt-5.5',
  textModel: 'gpt-5.4-mini',
  defaultReasoningEffort: 'medium',
  provider: 'openai',
  apiBaseUrl: 'https://api.openai.com/v1',
  invoiceProfile: 'auto',
  textProfile: 'auto',
  proxyMode: 'system',
  proxyUrl: '',
  proxyBypassRules: '<local>'
}

export type AiModelOption = { value: string; label: string; hint: string }

export type AiProviderConfig = {
  label: string
  apiBaseUrl: string
  defaultModel: string
  defaultTextModel: string
  modelOptions: AiModelOption[]
}

export const AI_PROVIDER_CONFIG: Record<TAiSettingsGetOutput['provider'], AiProviderConfig> = {
  openai: {
    label: 'OpenAI',
    apiBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.5',
    defaultTextModel: 'gpt-5.4-mini',
    modelOptions: [
      { value: 'gpt-5.5', label: 'GPT-5.5', hint: 'Beste Qualität für Belege' },
      { value: 'gpt-5.4', label: 'GPT-5.4', hint: 'Stark, günstiger als 5.5' },
      { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini', hint: 'Schnell und günstiger' },
      { value: 'gpt-5.4-nano', label: 'GPT-5.4 nano', hint: 'Sehr günstig für einfache Texte' }
    ]
  },
  minimax: {
    label: 'Minimax',
    apiBaseUrl: 'https://api.minimaxi.com/v1',
    defaultModel: 'MiniMax-M3',
    defaultTextModel: 'MiniMax-M3',
    modelOptions: [
      { value: 'MiniMax-M3', label: 'MiniMax-M3', hint: 'Aktuelles Agent- und Reasoning-Modell' },
      { value: 'MiniMax-M1', label: 'MiniMax-M1', hint: 'Starkes Reasoning für längere Aufgaben' },
      {
        value: 'MiniMax-Text-01',
        label: 'MiniMax-Text-01',
        hint: 'Klassisches Textmodell für Standardaufgaben'
      }
    ]
  },
  mittwald: {
    label: 'Mittwald AI Hosting',
    apiBaseUrl: 'https://llm.aihosting.mittwald.de/v1',
    defaultModel: 'Qwen3.6-35B-A3B-FP8',
    defaultTextModel: 'Qwen3.6-35B-A3B-FP8',
    modelOptions: [
      { value: 'GLM-OCR', label: 'GLM-OCR', hint: 'Empfohlen für Rechnungen, PDFs und Tabellen' },
      {
        value: 'Ministral-3-14B-Instruct-2512',
        label: 'Ministral 3 14B',
        hint: 'Schnelles Allzweckmodell mit Vision'
      },
      {
        value: 'Qwen3.5-122B-A10B-FP8',
        label: 'Qwen 3.5 122B',
        hint: 'Empfohlen für Batch: GLM-OCR liest PDFs, Qwen bewertet sie'
      },
      {
        value: 'Qwen3.6-35B-A3B-FP8',
        label: 'Qwen 3.6 35B',
        hint: 'Ausgewogen für Beleganalyse und KI-Agenten'
      },
      {
        value: 'Qwen3.8-27B-NVFP4',
        label: 'Qwen 3.8 27B',
        hint: 'Gründlicher KI-Agent, deutlich langsamer'
      },
      { value: 'gpt-oss-120b', label: 'gpt-oss-120b', hint: 'Präzise Texte und Tool-Aufrufe' },
      {
        value: 'Qwen3.5-0.8B',
        label: 'Qwen 3.5 0.8B',
        hint: 'Schnell für Standardtexte und Klassifizierung'
      }
    ]
  }
}

export const AI_PROVIDER_OPTIONS = Object.entries(AI_PROVIDER_CONFIG).map(([value, config]) => ({
  value,
  label: config.label
})) as Array<{ value: TAiSettingsGetOutput['provider']; label: string }>

export function getAiProviderConfig(provider: TAiSettingsGetOutput['provider']) {
  return AI_PROVIDER_CONFIG[provider] || AI_PROVIDER_CONFIG.openai
}

export function normalizeAiSettings(settings: TAiSettingsGetOutput): TAiSettingsGetOutput {
  const providerConfig = getAiProviderConfig(settings.provider)
  const allowedModels = new Set<string>(providerConfig.modelOptions.map((option) => option.value))
  const usesDiscoveredMittwaldModel = settings.provider === 'mittwald'
  return {
    ...settings,
    apiBaseUrl: providerConfig.apiBaseUrl,
    model:
      (usesDiscoveredMittwaldModel && settings.model.trim()) || allowedModels.has(settings.model)
        ? settings.model
        : providerConfig.defaultModel,
    textModel:
      (usesDiscoveredMittwaldModel && settings.textModel.trim()) || allowedModels.has(settings.textModel)
      ? settings.textModel
      : providerConfig.defaultTextModel
  }
}
