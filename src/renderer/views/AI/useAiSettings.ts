import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AiMasterDataPermissions } from '../../../../shared/aiMasterDataPolicy'
import { AI_PROVIDER_CONFIG, type AiModelOption } from '../../../../shared/aiProviders'
import type { TAiSettingsGetOutput } from '../../../../electron/main/ipc/schemas'
import type { Notify } from './aiViewTypes'
import { DEFAULT_AI_SETTINGS, normalizeAiSettings } from './aiSettings'

function connectionConfig(settings: TAiSettingsGetOutput) {
  return [settings.provider, settings.invoiceProfile, settings.textProfile, settings.model, settings.textModel,
    settings.defaultReasoningEffort, settings.proxyMode, settings.proxyUrl, settings.proxyBypassRules].join('\n')
}

export function useAiSettings(notify: Notify, showSettings: boolean) {
  const [settings, setCommitted] = useState<TAiSettingsGetOutput>(DEFAULT_AI_SETTINGS)
  const [draft, setSettings] = useState<TAiSettingsGetOutput>(DEFAULT_AI_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [masterDataSaving, setMasterDataSaving] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const settingsGeneration = useRef(0)
  const providerRequest = useRef(0)
  const [apiKey, setApiKey] = useState('')
  const [savedConnection, setSavedConnection] = useState('')
  const [connectionTest, setConnectionTest] = useState<Awaited<
    ReturnType<typeof window.api.ai.settings.testConnection>
  > | null>(null)

  const loadSettings = useCallback(async () => {
    const generation = ++settingsGeneration.current
    setSettingsLoaded(false)
    setBusy(false)
    setCommitted(DEFAULT_AI_SETTINGS)
    setSettings(DEFAULT_AI_SETTINGS)
    setConnectionTest(null)
    setApiKey('')
    setMasterDataSaving(false)
    try {
      const loaded = await window.api.ai.settings.get()
      if (generation !== settingsGeneration.current) return
      const normalized = normalizeAiSettings(loaded)
      setSettings(normalized)
      setCommitted(normalized)
      setSavedConnection(connectionConfig(normalized))
      setApiKey('')
      setConnectionTest(null)
      setSettingsLoaded(true)
    } catch (error: any) {
      if (generation === settingsGeneration.current) notify('error', error?.message || String(error))
    }
  }, [notify])

  useEffect(() => {
    if (!showSettings) {
      providerRequest.current++
      setSettings(settings)
      setApiKey('')
      setConnectionTest(null)
    }
  }, [showSettings, settings])

  const saveSettings = async () => {
    const generation = settingsGeneration.current
    setBusy(true)
    try {
      const next = await window.api.ai.settings.set({
        bookingCommentsEnabled: draft.bookingCommentsEnabled,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        model: draft.model,
        textModel: draft.textModel,
        defaultReasoningEffort: draft.defaultReasoningEffort,
        provider: draft.provider,
        invoiceProfile: draft.invoiceProfile,
        textProfile: draft.textProfile,
        proxyMode: draft.proxyMode,
        proxyUrl: draft.proxyUrl,
        proxyBypassRules: draft.proxyBypassRules
      })
      if (generation !== settingsGeneration.current) return
      const normalized = normalizeAiSettings(next)
      setSettings(normalized)
      setCommitted(normalized)
      setSavedConnection(connectionConfig(normalized))
      setConnectionTest(null)
      setApiKey('')
      notify('success', 'KI-Einstellungen gespeichert.')
    } catch (error: any) {
      if (generation === settingsGeneration.current) notify('error', error?.message || String(error))
    } finally {
      if (generation === settingsGeneration.current) setBusy(false)
    }
  }

  const testConnection = async () => {
    const generation = settingsGeneration.current
    setBusy(true)
    try {
      const result = await window.api.ai.settings.testConnection()
      if (generation !== settingsGeneration.current) return
      if (result.availableModels) {
        const loaded = normalizeAiSettings(await window.api.ai.settings.get())
        if (generation !== settingsGeneration.current) return
        const catalog = { model: loaded.model, textModel: loaded.textModel, availableModels: loaded.availableModels }
        setSettings(current => ({ ...current, ...catalog }))
        setCommitted(loaded)
        setSavedConnection(connectionConfig(loaded))
      }
      setConnectionTest(result)
      notify(result.ok ? 'success' : 'error', result.ok ? 'KI-Verbindung funktioniert.' : result.error || 'KI-Verbindung fehlgeschlagen.')
    } catch (error: any) {
      if (generation === settingsGeneration.current) notify('error', error?.message || String(error))
    } finally {
      if (generation === settingsGeneration.current) setBusy(false)
    }
  }

  const providerModelOptions = useMemo<AiModelOption[]>(() => {
    const options = AI_PROVIDER_CONFIG[draft.provider].modelOptions
    const models = draft.availableModels || options.map(option => option.value)
    // Keep explicit choices visible even if a later catalog no longer lists them.
    return [...new Set([...models, draft.model, draft.textModel])].map(id =>
      options.find(option => option.value === id) || { value: id, label: id, hint: 'Anbietermodell' }
    )
  }, [draft.provider, draft.availableModels, draft.model, draft.textModel])

  const handleProviderChange = async (provider: TAiSettingsGetOutput['provider']) => {
    const request = ++providerRequest.current
    const generation = settingsGeneration.current
    setBusy(true)
    setConnectionTest(null)
    setApiKey('')
    try {
      const next = normalizeAiSettings(await window.api.ai.settings.get(provider))
      if (generation !== settingsGeneration.current || request !== providerRequest.current) return
      setSettings(current => ({ ...current, provider, hasApiKey: next.hasApiKey, apiBaseUrl: next.apiBaseUrl,
        model: next.model, textModel: next.textModel, invoiceProfile: next.invoiceProfile, textProfile: next.textProfile,
        availableModels: next.availableModels, keyStorage: next.keyStorage }))
    } catch (error: any) {
      if (generation === settingsGeneration.current) notify('error', error?.message || String(error))
    } finally {
      if (generation === settingsGeneration.current) setBusy(false)
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
      setCommitted(current => ({ ...current, masterDataCreation: next.masterDataCreation }))
    } catch (error: any) {
      if (generation === settingsGeneration.current) notify('error', error?.message || 'Freigabe konnte nicht gespeichert werden.')
    } finally { if (generation === settingsGeneration.current) setMasterDataSaving(false) }
  }

  return {
    saveMasterDataPermission,
    masterDataSaving: masterDataSaving || !settingsLoaded,
    settings,
    draft,
    settingsBusy: busy,
    setSettings,
    apiKey,
    connectionTest,
    connectionNeedsSave: !!apiKey.trim() || connectionConfig(draft) !== savedConnection,
    providerModelOptions,
    loadSettings,
    saveSettings,
    testConnection,
    handleProviderChange,
    updateApiKey,
    invalidateConnection: () => setConnectionTest(null)
  }
}
