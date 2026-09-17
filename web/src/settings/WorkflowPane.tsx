import React, { useEffect, useState } from 'react'
import { ApiError, type User } from '../api'
import { loadWebWorkflow, saveWebWorkflow, type WebWorkflowSettings } from '../settingsApi'

export default function WorkflowPane({ user, onSessionExpired }: { user: User; onSessionExpired: () => void }) {
  const [settings, setSettings] = useState<WebWorkflowSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setError('')
    loadWebWorkflow().then(value => { if (active) setSettings(value) }).catch(cause => {
      if (!active) return
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      setError(cause instanceof Error ? cause.message : 'Arbeitsweise konnte nicht geladen werden.')
    })
    return () => { active = false }
  }, [user.id, reload, onSessionExpired])
  const update = <K extends keyof WebWorkflowSettings>(key: K, value: WebWorkflowSettings[K]) => {
    setSettings(current => current && { ...current, [key]: value }); setNotice('')
  }
  const save = async () => {
    if (!settings || busy || user.role === 'USER') return
    setBusy(true); setError(''); setNotice('')
    try { const saved = await saveWebWorkflow(settings); setSettings(saved); window.dispatchEvent(new CustomEvent('vereino-workflow-changed', { detail: saved })); setNotice('Arbeitsweise gespeichert.') }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); setError(cause instanceof Error ? cause.message : 'Arbeitsweise konnte nicht gespeichert werden.') }
    finally { setBusy(false) }
  }
  if (error) return <div className="card settings-card"><p role="alert">{error}</p><button className="btn" onClick={() => setReload(value => value + 1)}>Neu laden</button></div>
  if (!settings) return <p role="status">Arbeitsweise wird geladen …</p>
  return <div className="settings-workflow-pane settings-pane">
    <div className="card settings-card settings-pane-card">
      <div className="settings-title"><strong>Arbeitsweise</strong></div>
      <p className="settings-sub">Diese Einstellungen werden für deinen Zugang gespeichert. Buchungsansicht und Buchungsreiter werden direkt angewendet. Weitere Darstellungsoptionen folgen schrittweise.</p>
      <fieldset disabled={busy || user.role === 'USER'} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="settings-layout-grid settings-layout-grid--wide">
          <div className="settings-layout-control"><label>Buchungsansicht</label><div className="btn-group" role="group" aria-label="Buchungsansicht">
            <button type="button" className={`btn-option ${settings.bookingView === 'classic' ? 'active' : ''}`} aria-pressed={settings.bookingView === 'classic'} onClick={() => update('bookingView', 'classic')}>Buchungen klassisch</button>
            <button type="button" className={`btn-option ${settings.bookingView === 'plus' ? 'active' : ''}`} aria-pressed={settings.bookingView === 'plus'} onClick={() => update('bookingView', 'plus')}>Buchungen Plus</button>
          </div></div>
          <label className="settings-toggle-card"><span className="settings-toggle-card__copy"><strong>Buchungsreiter</strong><span>Geschlossene Flyouts als Reiter parken. Neue Buchung öffnet einen weiteren Reiter; ein Reiter holt die Eingaben zurück.</span></span><input className="toggle" role="switch" type="checkbox" checked={settings.showBookingDraftTabs} onChange={event => update('showBookingDraftTabs', event.target.checked)} /></label>
          <label className="settings-toggle-card"><span className="settings-toggle-card__copy"><strong>Bearbeitungen als Reiter</strong><span>Mehrere geöffnete Buchungen gleichzeitig bearbeiten.</span></span><input className="toggle" role="switch" type="checkbox" checked={settings.showBookingEditTabs} onChange={event => update('showBookingEditTabs', event.target.checked)} /></label>
          <div className="settings-layout-control"><label>Darstellung der Buchungserfassung</label><div className="btn-group" role="group" aria-label="Darstellung der Buchungserfassung">
            {([['modal', 'Dialog'], ['flyout', 'Kompakt-Flyout'], ['detached', 'Eigenes Fenster']] as const).map(([value, label]) => <button type="button" key={value} className={`btn-option ${settings.bookingEntryPresentation === value ? 'active' : ''}`} aria-pressed={settings.bookingEntryPresentation === value} onClick={() => update('bookingEntryPresentation', value)}>{label}</button>)}
          </div></div>
          <div className="settings-layout-control"><label>Nach dem Speichern</label><div className="btn-group" role="group" aria-label="Nach dem Speichern"><button type="button" className={`btn-option ${settings.quickAddAfterSave === 'close' ? 'active' : ''}`} onClick={() => update('quickAddAfterSave', 'close')}>Schließen</button><button type="button" className={`btn-option ${settings.quickAddAfterSave === 'new' ? 'active' : ''}`} onClick={() => update('quickAddAfterSave', 'new')}>Neue Buchung</button></div></div>
          <label className="settings-toggle-card"><span className="settings-toggle-card__copy"><strong>Buchungen dauerhaft löschen</strong><span>Ausgeschaltet bleibt Storno der sichere Standard.</span></span><input className="toggle" role="switch" type="checkbox" checked={settings.allowVoucherDeletion} onChange={event => update('allowVoucherDeletion', event.target.checked)} /></label>
        </div>
        {user.role !== 'USER' && <div className="settings-pane-actions"><button className="btn primary" type="button" onClick={() => void save()}>{busy ? 'Wird gespeichert …' : 'Arbeitsweise speichern'}</button></div>}
      </fieldset>
    </div>
    {notice && <p role="status" style={{ color: 'var(--success)' }}>{notice}</p>}
  </div>
}
