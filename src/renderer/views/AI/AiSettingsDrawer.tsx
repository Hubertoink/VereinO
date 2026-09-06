import { forwardRef } from 'react'
import { AI_TASK_PROFILE_OPTIONS } from '../../../../shared/aiModelProfiles'
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
  busy,
  onClose,
  onApiKeyChange,
  onSettingsChange,
  onProviderChange,
  onInvalidateConnection,
  onSave,
  onTestConnection
}, ref) {
  const update = <K extends keyof TAiSettingsGetOutput>(key: K, value: TAiSettingsGetOutput[K]) =>
    onSettingsChange({ ...settings, [key]: value })

  return <section ref={ref} className="card ai-settings-card ai-settings-drawer">
    <div className="ai-section-head">
      <strong>Einstellungen</strong>
      <button className="btn ghost" onClick={onClose} aria-label="Schließen">×</button>
    </div>
    <div className="ai-form-grid">
      <label className="field ai-field-wide">
        <span>API-Key</span>
        <input className="input" type="password" value={apiKey} onChange={(event) => onApiKeyChange(event.target.value)} placeholder={settings.hasApiKey ? 'Gespeichert - leer lassen zum Beibehalten' : 'sk-...'} />
      </label>
      <label className="field">
        <span>Anbieter</span>
        <select className="input" value={settings.provider} onChange={(event) => onProviderChange(event.target.value as TAiSettingsGetOutput['provider'])}>
          {providerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{settings.provider === 'mittwald' ? 'Beleganalyse' : 'Beleganalyse-Modell'}</span>
        {settings.provider === 'mittwald' ? <select className="input" value={settings.invoiceProfile} onChange={(event) => update('invoiceProfile', event.target.value as TAiSettingsGetOutput['invoiceProfile'])}>
          {AI_TASK_PROFILE_OPTIONS.invoice.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select> : <select className="input" value={settings.model} onChange={(event) => update('model', event.target.value)}>
          {modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label} - {option.hint}</option>)}
        </select>}
      </label>
      <label className="field">
        <span>{settings.provider === 'mittwald' ? 'Text & KI-Agent' : 'Textmodell'}</span>
        {settings.provider === 'mittwald' ? <select className="input" value={settings.textProfile} onChange={(event) => update('textProfile', event.target.value as TAiSettingsGetOutput['textProfile'])}>
          {AI_TASK_PROFILE_OPTIONS.text.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select> : <select className="input" value={settings.textModel} onChange={(event) => update('textModel', event.target.value)}>
          {modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label} - {option.hint}</option>)}
        </select>}
      </label>
      <label className="field">
        <span>{settings.provider === 'mittwald' ? 'Reasoning für Text & KI-Agent' : 'Reasoning'}</span>
        <select className="input" value={settings.defaultReasoningEffort} onChange={(event) => update('defaultReasoningEffort', event.target.value as TAiSettingsGetOutput['defaultReasoningEffort'])}>
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
        </select>
      </label>
      {settings.provider === 'mittwald' && settings.invoiceProfile === 'custom' && <label className="field">
        <span>Eigenes Beleganalyse-Modell</span>
        <select className="input" value={settings.model} onChange={(event) => update('model', event.target.value)}>
          {modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label} - {option.hint}</option>)}
        </select>
      </label>}
      {settings.provider === 'mittwald' && settings.textProfile === 'custom' && <label className="field">
        <span>Eigenes Text- &amp; Agentenmodell</span>
        <select className="input" value={settings.textModel} onChange={(event) => update('textModel', event.target.value)}>
          {modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label} - {option.hint}</option>)}
        </select>
      </label>}
      {settings.provider === 'mittwald' && <p className="helper ai-model-profile-note ai-field-wide">
        <span>Beleganalyse: {AI_TASK_PROFILE_OPTIONS.invoice.find((option) => option.value === settings.invoiceProfile)?.description}</span>
        <span>Text &amp; KI-Agent: {AI_TASK_PROFILE_OPTIONS.text.find((option) => option.value === settings.textProfile)?.description}</span>
      </p>}
      <div className="ai-settings-divider ai-field-wide"><strong>Netzwerk &amp; Proxy</strong><span>Gilt nur für KI-Anfragen.</span></div>
      <label className="field">
        <span>Verbindungsmodus</span>
        <select className="input" value={settings.proxyMode} onChange={(event) => { onInvalidateConnection(); update('proxyMode', event.target.value as TAiSettingsGetOutput['proxyMode']) }}>
          <option value="system">Systemproxy (empfohlen)</option><option value="direct">Direkt, ohne Proxy</option><option value="manual">Manueller Proxy</option>
        </select>
      </label>
      <p className="helper ai-network-help">Der Systemmodus übernimmt Betriebssystem, PAC und Firmenrichtlinien. Zugangsdaten bleiben in der Systemanmeldung und werden nicht in VereinO gespeichert.</p>
      {settings.proxyMode === 'manual' && <>
        <label className="field ai-field-wide"><span>Proxy-Adresse</span><input className="input" value={settings.proxyUrl} onChange={(event) => { onInvalidateConnection(); update('proxyUrl', event.target.value) }} placeholder="http://proxy.firma.local:8080" spellCheck={false} /></label>
        <label className="field ai-field-wide"><span>Proxy-Ausnahmen</span><input className="input" value={settings.proxyBypassRules} onChange={(event) => { onInvalidateConnection(); update('proxyBypassRules', event.target.value) }} placeholder="<local>;localhost;*.firma.local" spellCheck={false} /></label>
      </>}
      {connectionTest && <div className={`ai-network-result ai-field-wide ${connectionTest.ok ? 'is-success' : 'is-error'}`} role="status">
        <strong>{connectionTest.ok ? 'Verbindung erfolgreich' : 'Verbindung fehlgeschlagen'}</strong>
        {!connectionTest.ok && <span>{connectionTest.error}</span>}
        {connectionTest.ok && connectionTest.availableModels && <span>{connectionTest.availableModels.length} Mitwald-Modelle geladen.</span>}
        <small>Ziel: {connectionTest.targetUrl || settings.apiBaseUrl} · Route: {connectionTest.resolvedProxy || 'nicht ermittelt'}{connectionTest.errorCode ? ` · ${connectionTest.errorCode}` : ''}</small>
      </div>}
    </div>
    <div className="ai-settings-actions">
      <button className="btn primary" disabled={busy} onClick={onSave}>Speichern</button>
      <button className="btn" disabled={busy || !settings.hasApiKey} onClick={onTestConnection}>Verbindung testen</button>
    </div>
  </section>
})
