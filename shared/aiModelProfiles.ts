export type AiProviderId = 'openai' | 'minimax' | 'mittwald'
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
      description: 'GLM-OCR liest den Beleg, Qwen 3.6 übernimmt die Zuordnung.'
    },
    {
      value: 'fast',
      label: 'Schnell für große Stapel',
      description: 'GLM-OCR liest, ein kompaktes Modell ordnet zügig zu.'
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

const MITTWALD_MODEL_CANDIDATES: Record<
  Exclude<AiModelTask, never>,
  Record<Exclude<AiTaskProfile, 'custom'>, string[]>
> = {
  invoice: {
    auto: [
      'Qwen3.6-35B-A3B-FP8',
      'Ministral-3-14B-Instruct-2512',
      'Qwen3.5-122B-A10B-FP8',
      'Qwen3.5-0.8B'
    ],
    fast: ['Qwen3.5-0.8B', 'Ministral-3-14B-Instruct-2512', 'Qwen3.6-35B-A3B-FP8'],
    quality: ['Qwen3.5-122B-A10B-FP8', 'Qwen3.6-35B-A3B-FP8', 'Ministral-3-14B-Instruct-2512']
  },
  text: {
    auto: [
      'Qwen3.6-35B-A3B-FP8',
      'Qwen3.5-122B-A10B-FP8',
      'gpt-oss-120b',
      'Ministral-3-14B-Instruct-2512'
    ],
    fast: ['Qwen3.5-0.8B', 'Ministral-3-14B-Instruct-2512', 'Qwen3.6-35B-A3B-FP8'],
    quality: ['Qwen3.8-27B-NVFP4', 'Qwen3.5-122B-A10B-FP8', 'Qwen3.6-35B-A3B-FP8']
  }
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
  if (input.provider !== 'mittwald' || input.profile === 'custom') return configuredModel

  const candidates = MITTWALD_MODEL_CANDIDATES[input.task][input.profile]
  const availableModels = new Set((input.availableModels || []).map((model) => model.trim()))
  if (availableModels.size) {
    return (
      candidates.find((model) => availableModels.has(model)) || configuredModel || candidates[0]
    )
  }
  return candidates[0] || configuredModel
}

export function isMittwaldThinkingModel(model: string) {
  return /^Qwen3\.(5|6|8)-/.test(model)
}

export function toMittwaldReasoningEffort(effort: 'low' | 'medium' | 'high') {
  return effort === 'high' ? 'xhigh' : effort
}
