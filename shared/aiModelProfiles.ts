import { AI_PROVIDER_CONFIG, type AiProviderId } from './aiProviders'
export type { AiProviderId } from './aiProviders'
export type AiModelTask = 'invoice' | 'text'
export type AiTaskProfile = 'auto' | 'fast' | 'quality' | 'custom'

export type AiTaskProfileOption = {
  value: AiTaskProfile
  label: string
  description: string
}

export const AI_TASK_PROFILE_OPTIONS: Record<AiModelTask, AiTaskProfileOption[]> = {
  invoice: [
    {
      value: 'auto',
      label: 'Automatisch (empfohlen)',
      description: 'Für Belege und die Zuordnung zu Buchungen.'
    },
    {
      value: 'fast',
      label: 'Schnell für große Stapel',
      description: 'Ein günstiges, schnelles Modell für Standardbelege.'
    },
    {
      value: 'quality',
      label: 'Höchste Qualität',
      description: 'Für schwierige Rechnungen und anspruchsvolle Zuordnungen.'
    },
    {
      value: 'custom',
      label: 'Benutzerdefiniertes Modell',
      description: 'Technisches Modell selbst auswählen.'
    }
  ],
  text: [
    {
      value: 'auto',
      label: 'Ausgewogen (empfohlen)',
      description: 'Für VereinO-Chat, Texte und normale Agent-Aufgaben.'
    },
    {
      value: 'fast',
      label: 'Schnell',
      description: 'Für kurze Texte, Routing und einfache Klassifikation.'
    },
    {
      value: 'quality',
      label: 'Gründlicher KI-Agent',
      description: 'Für komplexe Planung und mehrstufige Aufgaben; spürbar langsamer.'
    },
    {
      value: 'custom',
      label: 'Benutzerdefiniertes Modell',
      description: 'Technisches Modell selbst auswählen.'
    }
  ]
}

type Candidates = Record<AiModelTask, Record<Exclude<AiTaskProfile, 'custom'>, string[]>>

const MITTWALD_MODEL_CANDIDATES: Candidates = {
  invoice: {
    auto: [
      'Qwen3.6-35B-A3B-FP8',
      'Ministral-3-14B-Instruct-2512',
      'Qwen3.8-27B-NVFP4',
      'Qwen3.5-0.8B'
    ],
    fast: ['Qwen3.5-0.8B', 'Ministral-3-14B-Instruct-2512', 'Qwen3.6-35B-A3B-FP8'],
    quality: ['Qwen3.8-27B-NVFP4', 'Qwen3.6-35B-A3B-FP8', 'Ministral-3-14B-Instruct-2512']
  },
  text: {
    auto: [
      'Qwen3.6-35B-A3B-FP8',
      'Qwen3.8-27B-NVFP4',
      'gpt-oss-120b',
      'Ministral-3-14B-Instruct-2512'
    ],
    fast: ['Qwen3.5-0.8B', 'Ministral-3-14B-Instruct-2512', 'Qwen3.6-35B-A3B-FP8'],
    quality: ['Qwen3.8-27B-NVFP4', 'gpt-oss-120b', 'Qwen3.6-35B-A3B-FP8']
  }
}

function tieredProfiles(economy: string, balanced: string, quality: string): Candidates {
  const fast = [economy, balanced, quality]
  const thorough = [quality, balanced, economy]
  return {
    invoice: { auto: [balanced, economy, quality], fast, quality: thorough },
    text: { auto: fast, fast, quality: thorough }
  }
}

const candidatesByProvider = {
  openai: tieredProfiles('gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.2-sol'),
  anthropic: tieredProfiles('claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'),
  mittwald: MITTWALD_MODEL_CANDIDATES
}

export function normalizeAiTaskProfile(value: unknown): AiTaskProfile {
  return value === 'fast' || value === 'quality' || value === 'custom' ? value : 'auto'
}

export function resolveAiTaskModel(input: {
  provider: AiProviderId
  task: AiModelTask
  profile: AiTaskProfile
  configuredModel: string
  availableModels?: string[]
}) {
  const configuredModel = input.configuredModel.trim()
  if (input.provider === 'minimax' || input.profile === 'custom') return configuredModel

  const candidates = candidatesByProvider[input.provider][input.task][input.profile]
  const availableModels = new Set((input.availableModels || []).map((model) => model.trim()))
  if (availableModels.size) {
    const preferred = candidates.find(model => availableModels.has(model))
    if (preferred) return preferred
    return AI_PROVIDER_CONFIG[input.provider].modelOptions.find(option =>
      availableModels.has(option.value) && option.value !== 'GLM-OCR' && option.value !== 'Qwen3.5-122B-A10B-FP8'
    )?.value ?? (input.provider === 'mittwald' ? [...availableModels].find(id => id !== 'GLM-OCR') : undefined) ?? candidates[0]
  }
  return candidates[0] || configuredModel
}

export function isMittwaldThinkingModel(model: string) {
  return /^Qwen3\.(5|6|8)-/.test(model)
}

export function supportsMittwaldVision(model: string) {
  return ['Qwen3.6-35B-A3B-FP8', 'Qwen3.8-27B-NVFP4', 'Qwen3.5-122B-A10B-FP8', 'Ministral-3-14B-Instruct-2512', 'GLM-OCR'].includes(model)
}

export function toMittwaldReasoningEffort(effort: 'low' | 'medium' | 'high') {
  return effort === 'high' ? 'xhigh' : effort
}

export function mittwaldThinkingOptions(model: string, effort?: 'low' | 'medium' | 'high', structured = false) {
  if (!isMittwaldThinkingModel(model)) return undefined
  if (structured || model !== 'Qwen3.8-27B-NVFP4') return { enable_thinking: false }
  return effort ? { reasoning_effort: toMittwaldReasoningEffort(effort) } : undefined
}
