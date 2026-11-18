import { useCallback, useMemo, useRef, useState } from 'react'
import type { AiMasterDataPermissions } from '../../../../shared/aiMasterDataPolicy'
import { AI_PROVIDER_CONFIG, type AiModelOption } from '../../../../shared/aiProviders'
import type { TAiSettingsGetOutput } from '../../../../electron/main/ipc/schemas'
import type { Notify } from './aiViewTypes'
import { DEFAULT_AI_SETTINGS, normalizeAiSettings } from './aiSettings'

function connectionConfig(settings: TAiSettingsGetOutput) {
  return [settings.provider, settings.invoiceProfile, settings.textProfile, settings.model, settings.textModel,
    settings.defaultReasoningEffort, settings.proxyMode, settings.proxyUrl, settings.proxyBypassRules].join('\n')
}

export function useAiSettings(notify: Notify, setBusy: (busy: boolean) => void) {
  const [settings, setSettings] = useState<TAiSettingsGetOutput>(DEFAULT_AI_SETTINGS)
  const [masterDataSaving, setMasterDataSaving] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const settingsGeneration = useRef(0)
  const [apiKey, setApiKey] = useState('')
  const [savedConnection, setSavedConnection] = useState('')
  const [connectionTest, setConnectionTest] = useState<Awaited<
    ReturnType<typeof window.api.ai.settings.testConnection>
  > | null>(null)

  const loadSettings = useCallback(async () => {
    const generation = ++settingsGeneration.current
    setSettingsLoaded(false)
    setMasterDataSaving(false)
    try {
      const loaded = await window.api.ai.settings.get()
      if (generation !== settingsGeneration.current) return
      const normalized = normalizeAiSettings(loaded)
      setSettings(normalized)
      setSavedConnection(connectionConfig(normalized))
      setApiKey('')
      setConnectionTest(null)
      setSettingsLoaded(true)
    } catch (error: any) {
      notify('error', error?.message || String(error))
    }
  }, [notify])

  const saveSettings = async () => {
    setBusy(true)
    try {
      const next = await window.api.ai.settings.set({
        bookingCommentsEnabled: settings.bookingCommentsEnabled,
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
      const normalized = normalizeAiSettings(next)
      setSettings(normalized)
      setSavedConnection(connectionConfig(normalized))
      setConnectionTest(null)
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
      if (result.ok) {
        if (result.availableModels) {
          const loaded = normalizeAiSettings(await window.api.ai.settings.get())
          setSettings(current => ({ ...current, model: loaded.model, textModel: loaded.textModel, availableModels: loaded.availableModels }))
          setSavedConnection(connectionConfig(loaded))
        }
        notify('success', 'KI-Verbindung funktioniert.')
      } else notify('error', result.error || 'KI-Verbindung fehlgeschlagen.')
    } catch (error: any) {
      notify('error', error?.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  const providerModelOptions = useMemo<AiModelOption[]>(() => {
    const options = AI_PROVIDER_CONFIG[settings.provider].modelOptions
    const models = settings.availableModels || options.map(option => option.value)
    // Keep explicit choices visible even if a later catalog no longer lists them.
    return [...new Set([...models, settings.model, settings.textModel])].map(id =>
      options.find(option => option.value === id) || { value: id, label: id, hint: 'Anbietermodell' }
    )
  }, [settings.provider, settings.availableModels, settings.model, settings.textModel])

  const handleProviderChange = async (provider: TAiSettingsGetOutput['provider']) => {
    setBusy(true)
    setConnectionTest(null)
    setApiKey('')
    try {
      const next = normalizeAiSettings(await window.api.ai.settings.get(provider))
      setSettings(current => ({ ...current, provider, hasApiKey: next.hasApiKey, apiBaseUrl: next.apiBaseUrl,
        model: next.model, textModel: next.textModel, invoiceProfile: next.invoiceProfile, textProfile: next.textProfile,
        availableModels: next.availableModels }))
    } catch (error: any) {
      notify('error', error?.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  const updateApiKey = (value: string) => {
    setApiKey(value)
    setConnectionTest(null)
  }

  const saveMasterDataPermission = async (key: keyof AiMasterDataPermissions, enabled: boolean) => {
    if (masterDataSaving || !settingsLoaded) return
    setMasterDataSaving(true)
    const generation = settingsGeneration.current
    try {
      const next = await window.api.ai.settings.set({ masterDataCreation: { [key]: enabled } })
      if (generation !== settingsGeneration.current) return
      setSettings(current => ({ ...current, masterDataCreation: next.masterDataCreation }))
    } catch (error: any) {
      notify('error', error?.message || 'Freigabe konnte nicht gespeichert werden.')
    } finally { if (generation === settingsGeneration.current) setMasterDataSaving(false) }
  }

  return {
    saveMasterDataPermission,
    masterDataSaving: masterDataSaving || !settingsLoaded,
    settings,
    setSettings,
    apiKey,
    connectionTest,
    connectionNeedsSave: !!apiKey.trim() || connectionConfig(settings) !== savedConnection,
    providerModelOptions,
    loadSettings,
    saveSettings,
    testConnection,
    handleProviderChange,
    updateApiKey,
    invalidateConnection: () => setConnectionTest(null)
  }
}
