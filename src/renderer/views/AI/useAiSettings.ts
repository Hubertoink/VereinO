import { useCallback, useMemo, useState } from 'react'
import { resolveAiTaskModel } from '../../../../shared/aiModelProfiles'
import type { TAiSettingsGetOutput } from '../../../../electron/main/ipc/schemas'
import type { Notify } from './aiViewTypes'
import {
  AI_PROVIDER_CONFIG,
  DEFAULT_AI_SETTINGS,
  getAiProviderConfig,
  normalizeAiSettings,
  type AiModelOption
} from './aiSettings'

export function useAiSettings(notify: Notify, setBusy: (busy: boolean) => void) {
  const [settings, setSettings] = useState<TAiSettingsGetOutput>(DEFAULT_AI_SETTINGS)
  const [apiKey, setApiKey] = useState('')
  const [mittwaldModels, setMittwaldModels] = useState<string[] | null>(null)
  const [connectionTest, setConnectionTest] = useState<Awaited<
    ReturnType<typeof window.api.ai.settings.testConnection>
  > | null>(null)

  const loadSettings = useCallback(async () => {
    try {
      setSettings(normalizeAiSettings(await window.api.ai.settings.get()))
    } catch (error: any) {
      notify('error', error?.message || String(error))
    }
  }, [notify])

  const saveSettings = async () => {
    setBusy(true)
    try {
      const next = await window.api.ai.settings.set({
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        model: settings.model,
        textModel: settings.textModel,
        defaultReasoningEffort: settings.defaultReasoningEffort,
        provider: settings.provider,
        invoiceProfile: settings.invoiceProfile,
        textProfile: settings.textProfile,
        proxyMode: settings.proxyMode,
        proxyUrl: settings.proxyUrl,
        proxyBypassRules: settings.proxyBypassRules
      })
      setSettings(
        normalizeAiSettings({
          hasApiKey: next.hasApiKey,
          model: next.model,
          textModel: next.textModel,
          defaultReasoningEffort: next.defaultReasoningEffort,
          provider: next.provider,
          apiBaseUrl: next.apiBaseUrl,
          invoiceProfile: next.invoiceProfile,
          textProfile: next.textProfile,
          proxyMode: next.proxyMode,
          proxyUrl: next.proxyUrl,
          proxyBypassRules: next.proxyBypassRules
        })
      )
      setApiKey('')
      notify('success', 'KI-Einstellungen gespeichert.')
    } catch (error: any) {
      notify('error', error?.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  const testConnection = async () => {
    setBusy(true)
    try {
      const result = await window.api.ai.settings.testConnection()
      setConnectionTest(result)
      if (result.ok && settings.provider === 'mittwald' && result.availableModels) {
        const availableModels = result.availableModels
        setMittwaldModels(availableModels)
        setSettings((current) => {
          if (current.provider !== 'mittwald' || !availableModels.length) return current
          const model = resolveAiTaskModel({
            provider: 'mittwald',
            task: 'invoice',
            profile: current.invoiceProfile,
            configuredModel: current.model,
            availableModels
          })
          const textModel = resolveAiTaskModel({
            provider: 'mittwald',
            task: 'text',
            profile: current.textProfile,
            configuredModel: current.textModel,
            availableModels
          })
          return {
            ...current,
            model: availableModels.includes(current.model) ? current.model : model,
            textModel: availableModels.includes(current.textModel) ? current.textModel : textModel
          }
        })
      }
      if (result.ok) {
        const modelMessage = result.availableModels
          ? ` ${result.availableModels.length} Mitwald-Modelle wurden geladen.`
          : ''
        notify('success', `KI-Verbindung funktioniert.${modelMessage}`)
      } else notify('error', result.error || 'KI-Verbindung fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const providerConfig = getAiProviderConfig(settings.provider)
  const providerModelOptions = useMemo<AiModelOption[]>(() => {
    if (settings.provider !== 'mittwald') return providerConfig.modelOptions
    const knownOptions = new Map(
      AI_PROVIDER_CONFIG.mittwald.modelOptions.map((option) => [option.value, option])
    )
    const modelIds = mittwaldModels || [
      ...AI_PROVIDER_CONFIG.mittwald.modelOptions.map((option) => option.value),
      settings.model,
      settings.textModel
    ]
    return modelIds
      .filter((modelId, index, all) => modelId && all.indexOf(modelId) === index)
      .map(
        (modelId) =>
          knownOptions.get(modelId) || {
            value: modelId,
            label: modelId,
            hint: 'Von Mitwald bereitgestellt'
          }
      )
  }, [
    mittwaldModels,
    providerConfig.modelOptions,
    settings.model,
    settings.provider,
    settings.textModel
  ])

  const handleProviderChange = (provider: TAiSettingsGetOutput['provider']) => {
    const nextConfig = getAiProviderConfig(provider)
    const allowedModels = new Set(nextConfig.modelOptions.map((option) => option.value))
    setConnectionTest(null)
    setMittwaldModels(null)
    setSettings((current) => ({
      ...current,
      provider,
      apiBaseUrl: nextConfig.apiBaseUrl,
      model: allowedModels.has(current.model) ? current.model : nextConfig.defaultModel,
      textModel: allowedModels.has(current.textModel)
        ? current.textModel
        : nextConfig.defaultTextModel
    }))
  }

  const updateApiKey = (value: string) => {
    setApiKey(value)
    setConnectionTest(null)
    setMittwaldModels(null)
  }

  return {
    settings,
    setSettings,
    apiKey,
    connectionTest,
    providerModelOptions,
    loadSettings,
    saveSettings,
    testConnection,
    handleProviderChange,
    updateApiKey,
    invalidateConnection: () => setConnectionTest(null)
  }
}
