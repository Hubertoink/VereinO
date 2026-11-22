import { forwardRef } from 'react'
import ModalHeader from '../../components/ModalHeader'
import { AI_TASK_PROFILE_OPTIONS, resolveAiTaskModel } from '../../../../shared/aiModelProfiles'
import type { TAiSettingsGetOutput } from '../../../../electron/main/ipc/schemas'

type ModelOption = { value: string; label: string; hint: string }
type ProviderOption = { value: string; label: string }
type ConnectionTest = Awaited<ReturnType<typeof window.api.ai.settings.testConnection>> | null

type Props = {
  settings: TAiSettingsGetOutput
  apiKey: string
  modelOptions: ModelOption[]
  providerOptions: ProviderOption[]
  connectionTest: ConnectionTest
  busy: boolean
  connectionNeedsSave: boolean
  onClose: () => void
  onApiKeyChange: (value: string) => void
  onSettingsChange: (settings: TAiSettingsGetOutput) => void
  onProviderChange: (provider: TAiSettingsGetOutput['provider']) => void
  onInvalidateConnection: () => void
  onSave: () => void
  onTestConnection: () => void
}

export const AiSettingsDrawer = forwardRef<HTMLElement, Props>(function AiSettingsDrawer({
  settings,
  apiKey,
  modelOptions,
  providerOptions,
  connectionTest,
  connectionNeedsSave,
  busy,
  onClose,
  onApiKeyChange,
  onSettingsChange,
  onProviderChange,
  onInvalidateConnection,
  onSave,
  onTestConnection
}, ref) {
  const usesProfiles = settings.provider !== 'minimax'
  const update = <K extends keyof TAiSettingsGetOutput>(key: K, value: TAiSettingsGetOutput[K]) => {
    onInvalidateConnection()
    onSettingsChange({ ...settings, [key]: value })
  }
  const modelLabel = (task: 'invoice' | 'text') => {
    const id = resolveAiTaskModel({ provider: settings.provider, task,
      profile: task === 'invoice' ? settings.invoiceProfile : settings.textProfile,
      configuredModel: task === 'invoice' ? settings.model : settings.textModel,
      availableModels: settings.availableModels })
    return modelOptions.find(option => option.value === id)?.label || id
  }

  return <section ref={ref} className="card ai-settings-card ai-settings-drawer">
    <ModalHeader title="Einstellungen" onClose={onClose} closeOnEscape={false} />
    <fieldset className="ai-form-grid" disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <label className="field ai-field-wide">
        <span>API-Key</span>
        <input className="input" type="password" value={apiKey} onChange={(event) => onApiKeyChange(event.target.value)} placeholder={settings.hasApiKey ? 'Gespeichert - leer lassen zum Beibehalten' : 'API-Key für diesen Anbieter eingeben'} />
      </label>
      {settings.keyStorage === 'session' && <p className="helper ai-field-wide">Der sichere Betriebssystemspeicher ist nicht verfügbar. Der API-Schlüssel gilt nur bis zum Beenden von VereinO.</p>}
      {settings.migratedPlainKey && <p className="helper ai-field-wide">Diese Datenbank enthielt früher unverschlüsselte API-Schlüssel. Wenn du Sicherungen weitergegeben hast, ersetze die betroffenen Schlüssel beim Anbieter.</p>}
      <label className="field">
        <span>Anbieter</span>
        <select className="input" value={settings.provider} onChange={(event) => onProviderChange(event.target.value as TAiSettingsGetOutput['provider'])}>
          {providerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{usesProfiles ? 'Beleganalyse' : 'Beleganalyse-Modell'}</span>
        {usesProfiles ? <select className="input" value={settings.invoiceProfile} onChange={(event) => update('invoiceProfile', event.target.value as TAiSettingsGetOutput['invoiceProfile'])}>
          {AI_TASK_PROFILE_OPTIONS.invoice.map((option) => <option key={option.value} value={option.value} title={option.description}>{option.label}</option>)}
        </select> : <select className="input" value={settings.model} onChange={(event) => update('model', event.target.value)}>
          {modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label} - {option.hint}</option>)}
        </select>}
      </label>
      <label className="field">
        <span>{usesProfiles ? 'Text & KI-Agent' : 'Textmodell'}</span>
        {usesProfiles ? <select className="input" value={settings.textProfile} onChange={(event) => update('textProfile', event.target.value as TAiSettingsGetOutput['textProfile'])}>
          {AI_TASK_PROFILE_OPTIONS.text.map((option) => <option key={option.value} value={option.value} title={option.description}>{option.label}</option>)}
        </select> : <select className="input" value={settings.textModel} onChange={(event) => update('textModel', event.target.value)}>
          {modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label} - {option.hint}</option>)}
        </select>}
      </label>
      <label className="field">
        <span>{usesProfiles ? 'Reasoning für Text & KI-Agent' : 'Reasoning'}</span>
        <select className="input" value={settings.defaultReasoningEffort} onChange={(event) => update('defaultReasoningEffort', event.target.value as TAiSettingsGetOutput['defaultReasoningEffort'])}>
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
        </select>
      </label>
      {usesProfiles && settings.invoiceProfile === 'custom' && <label className="field">
        <span>Eigenes Beleganalyse-Modell</span>
        <select className="input" value={settings.model} onChange={(event) => update('model', event.target.value)}>
          {modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label} - {option.hint}</option>)}
        </select>
      </label>}
      {usesProfiles && settings.textProfile === 'custom' && <label className="field">
        <span>Eigenes Text- &amp; Agentenmodell</span>
        <select className="input" value={settings.textModel} onChange={(event) => update('textModel', event.target.value)}>
          {modelOptions.filter(option => option.value !== 'GLM-OCR').map((option) => <option key={option.value} value={option.value}>{option.label} - {option.hint}</option>)}
        </select>
      </label>}
      {usesProfiles && <p className="helper ai-model-profile-note ai-field-wide">
        <span>Beleganalyse: {settings.provider === 'mittwald' && modelLabel('invoice') !== 'GLM-OCR' ? 'GLM-OCR → ' : ''}{modelLabel('invoice')}</span>
        <span>Text &amp; KI-Agent: {modelLabel('text')}</span>
      </p>}
      <div className="ai-settings-divider ai-field-wide"><strong>Buchungsentwürfe</strong></div>
      <label className="ai-field-wide" style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <input type="checkbox" checked={settings.bookingCommentsEnabled === true} disabled={busy}
          onChange={event => update('bookingCommentsEnabled', event.target.checked)} />
        <span>KI-Kommentare in Buchungsentwürfe übernehmen
          <small className="helper" style={{ display: 'block', marginTop: 5 }}>Standardmäßig an. Die KI darf hilfreiche Kommentare vorschlagen. Über den KI-Regelkatalog kannst du deren Inhalt steuern oder die Übernahme hier ausschalten. Gilt für neue KI-Entwürfe, auch beim Bankimport.</small>
        </span>
      </label>
      <div className="ai-settings-divider ai-field-wide"><strong>Netzwerk &amp; Proxy</strong><span>Gilt nur für KI-Anfragen.</span></div>
      <label className="field">
        <span>Verbindungsmodus</span>
        <select className="input" value={settings.proxyMode} onChange={(event) => update('proxyMode', event.target.value as TAiSettingsGetOutput['proxyMode'])}>
          <option value="system">Systemproxy (empfohlen)</option><option value="direct">Direkt, ohne Proxy</option><option value="manual">Manueller Proxy</option>
        </select>
      </label>
      <p className="helper ai-network-help">Der Systemmodus übernimmt Betriebssystem, PAC und Firmenrichtlinien. Zugangsdaten bleiben in der Systemanmeldung und werden nicht in VereinO gespeichert.</p>
      {settings.proxyMode === 'manual' && <>
        <label className="field ai-field-wide"><span>Proxy-Adresse</span><input className="input" value={settings.proxyUrl} onChange={(event) => update('proxyUrl', event.target.value)} placeholder="http://proxy.firma.local:8080" spellCheck={false} /></label>
        <label className="field ai-field-wide"><span>Proxy-Ausnahmen</span><input className="input" value={settings.proxyBypassRules} onChange={(event) => update('proxyBypassRules', event.target.value)} placeholder="<local>;localhost;*.firma.local" spellCheck={false} /></label>
      </>}
      {connectionTest && <div className={`ai-network-result ai-field-wide ${connectionTest.ok ? 'is-success' : 'is-error'}`} role="status">
        <strong>{connectionTest.ok ? 'Verbindung erfolgreich' : 'Verbindung fehlgeschlagen'}</strong>
        {!connectionTest.ok && <span>{connectionTest.error}</span>}
        {connectionTest.ok && connectionTest.availableModels && <span>{connectionTest.availableModels.length} passende Modelle geladen.</span>}
        <small>Ziel: {connectionTest.targetUrl || settings.apiBaseUrl} · Route: {connectionTest.resolvedProxy || 'nicht ermittelt'}{connectionTest.errorCode ? ` · ${connectionTest.errorCode}` : ''}</small>
      </div>}
      {connectionNeedsSave && <small className="helper ai-field-wide">Für den Verbindungstest zuerst die Einstellungen speichern.</small>}
    </fieldset>
    <div className="ai-settings-actions">
      <button className="btn primary" disabled={busy} onClick={onSave}>Speichern</button>
      <button className="btn" disabled={busy || !settings.hasApiKey || connectionNeedsSave} onClick={onTestConnection}>Verbindung testen</button>
    </div>
  </section>
})
