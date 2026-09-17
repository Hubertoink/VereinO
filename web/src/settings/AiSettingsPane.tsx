import React, { useEffect, useState } from 'react'
import { api, ApiError } from '../api'
type Settings = { version: number; enabled: boolean; provider: 'openai' | 'minimax' | 'mittwald'; model: string; textModel: string; hasApiKey: boolean }
export default function AiSettingsPane({ readOnly, onSessionExpired }: { readOnly: boolean; onSessionExpired: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [key, setKey] = useState(''), [remove, setRemove] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    api<Settings>('/ai/settings').then(result => { if (active) setSettings(result) }).catch(cause => {
      if (!active) return
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      setError(cause instanceof Error ? cause.message : 'KI-Einstellungen konnten nicht geladen werden.')
    })
    return () => { active = false }
  }, [onSessionExpired, revision])
  async function run(test: boolean) {
    if (busy || readOnly || !settings) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (test) { await api('/ai/test', 'POST', {}); setNotice('Verbindung erfolgreich geprüft.') }
      else {
        const { hasApiKey: _hasApiKey, ...input } = settings
        const saved = await api<Settings>('/ai/settings', 'PATCH', { ...input, ...(key ? { apiKey: key } : {}), ...(remove ? { removeApiKey: true } : {}) })
        setSettings(saved); setKey(''); setRemove(false); setNotice('KI-Einstellungen gespeichert.')
        window.dispatchEvent(new Event('web-ai-settings-changed'))
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      setError(cause instanceof Error ? cause.message : 'KI-Anfrage fehlgeschlagen.')
    } finally { setBusy(false) }
  }
  return <section className="card settings-card settings-pane-card">
    <div className="settings-title"><strong>KI-Anbieter</strong></div>
    <p className="settings-sub">Für KI-Assistenz und Beleganalyse. Bei einer Anfrage werden die ausgewählten Inhalte an den konfigurierten Anbieter übertragen.</p>
    {settings && <fieldset disabled={readOnly || busy} style={{ border: 0, padding: 0, display: 'grid', gap: 12 }}>
      <label className="settings-toggle-card"><span className="settings-toggle-card__copy"><strong>KI verwenden</strong></span><input className="toggle" type="checkbox" role="switch" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} /></label>
      <label className="field">Anbieter<select className="input" value={settings.provider} onChange={e => setSettings({ ...settings, provider: e.target.value as Settings['provider'] })}><option value="openai">OpenAI</option><option value="minimax">MiniMax</option><option value="mittwald">Mittwald</option></select></label>
      <label className="field">Modell für Beleganalyse<input className="input" value={settings.model} onChange={e => setSettings({ ...settings, model: e.target.value })} /></label>
      <label className="field">Modell für Assistenz<input className="input" value={settings.textModel} onChange={e => setSettings({ ...settings, textModel: e.target.value })} /></label>
      {!readOnly && <><label className="field">API-Schlüssel<input className="input" type="password" autoComplete="new-password" value={key} disabled={remove} placeholder={settings.hasApiKey ? 'Gespeichert – leer lassen zum Beibehalten' : 'Noch nicht hinterlegt'} onChange={e => setKey(e.target.value)} /></label><label><input type="checkbox" checked={remove} onChange={e => { setRemove(e.target.checked); setKey('') }} /> Gespeicherten Schlüssel entfernen</label>
      <div className="settings-pane-actions"><button type="button" className="btn primary" onClick={() => void run(false)}>KI-Einstellungen speichern</button><button type="button" className="btn" onClick={() => void run(true)}>Gespeicherte Verbindung testen</button></div></>}
    </fieldset>}
    {readOnly && <p className="helper">Die KI-Konfiguration verwaltet ein Admin.</p>}
    {error && <p role="alert" className="error-text">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!settings && <button type="button" className="btn" onClick={() => setRevision(value => value + 1)}>Erneut laden</button>}
  </section>
}
