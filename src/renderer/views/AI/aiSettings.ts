import { AI_PROVIDER_CONFIG, normalizeProviderModel } from '../../../../shared/aiProviders'
import type { TAiSettingsGetOutput } from '../../../../electron/main/ipc/schemas'
import { DEFAULT_AI_MASTER_DATA_PERMISSIONS, normalizeMasterDataPermissions } from '../../../../shared/aiMasterDataPolicy'

export const DEFAULT_AI_SETTINGS: TAiSettingsGetOutput = {
  masterDataCreation: { ...DEFAULT_AI_MASTER_DATA_PERMISSIONS },
  bookingCommentsEnabled: true,
  hasApiKey: false,
  model: AI_PROVIDER_CONFIG.openai.defaultModel,
  textModel: AI_PROVIDER_CONFIG.openai.defaultTextModel,
  defaultReasoningEffort: 'medium',
  provider: 'openai',
  apiBaseUrl: AI_PROVIDER_CONFIG.openai.apiBaseUrl,
  invoiceProfile: 'auto',
  textProfile: 'auto',
  proxyMode: 'system',
  proxyUrl: '',
  proxyBypassRules: '<local>'
}

export const AI_PROVIDER_OPTIONS = Object.entries(AI_PROVIDER_CONFIG).map(([value, config]) => ({
  value,
  label: config.label
})) as Array<{ value: TAiSettingsGetOutput['provider']; label: string }>

export function normalizeAiSettings(settings: TAiSettingsGetOutput): TAiSettingsGetOutput {
  return {
    ...settings,
    bookingCommentsEnabled: settings.bookingCommentsEnabled !== false,
    masterDataCreation: normalizeMasterDataPermissions(settings.masterDataCreation),
    apiBaseUrl: AI_PROVIDER_CONFIG[settings.provider].apiBaseUrl,
    model: normalizeProviderModel(settings.provider, settings.model, 'invoice'),
    textModel: normalizeProviderModel(settings.provider, settings.textModel, 'text')
  }
}
