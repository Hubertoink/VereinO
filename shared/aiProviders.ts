export const AI_PROVIDER_IDS = ['openai', 'anthropic', 'minimax', 'mittwald'] as const
export type AiProviderId = typeof AI_PROVIDER_IDS[number]

export type AiModelOption = { value: string; label: string; hint: string }

export type AiProviderConfig = {
  label: string
  apiBaseUrl: string
  defaultModel: string
  defaultTextModel: string
  modelOptions: AiModelOption[]
}

export const AI_PROVIDER_CONFIG: Record<AiProviderId, AiProviderConfig> = {
  openai: {
    label: 'OpenAI',
    apiBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-6.1-terra',
    defaultTextModel: 'gpt-6-luna',
    modelOptions: [
      { value: 'gpt-6-luna', label: 'GPT-6 Luna', hint: 'Günstig für Stapel, Texte und Routineaufgaben' },
      { value: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', hint: 'Für Belege und visuelle Zuordnung' },
      { value: 'gpt-6.2-sol', label: 'GPT-6.2 Sol', hint: 'Für komplexe Belege und Agentenaufgaben' },
      { value: 'gpt-5.5', label: 'GPT-5.5', hint: 'Für anspruchsvolle Belege' },
      { value: 'gpt-5.4', label: 'GPT-5.4', hint: 'Stark, günstiger als 5.5' },
      { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini', hint: 'Schnell und günstiger' },
      { value: 'gpt-5.4-nano', label: 'GPT-5.4 nano', hint: 'Sehr günstig für einfache Texte' }
    ]
  },
  anthropic: {
    label: 'Claude (Anthropic)',
    apiBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-5-5',
    defaultTextModel: 'claude-haiku-5-5',
    modelOptions: [
      { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', hint: 'Günstig für Stapel, Texte und Routineaufgaben' },
      { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', hint: 'Für Belege und mehrstufige Aufgaben' },
      { value: 'claude-opus-5-5', label: 'Claude Opus 5.5', hint: 'Für anspruchsvolle Analysen' }
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
        hint: 'Abschaltung am 28.12.2026'
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

export function normalizeProviderModel(provider: AiProviderId, model: string | undefined, task: 'invoice' | 'text') {
  const config = AI_PROVIDER_CONFIG[provider]
  const value = model?.trim()
  if (provider === 'mittwald' && task === 'text' && value === 'GLM-OCR') return config.defaultTextModel
  if (value && (provider === 'mittwald' || config.modelOptions.some(option => option.value === value))) return value
  return task === 'invoice' ? config.defaultModel : config.defaultTextModel
}
