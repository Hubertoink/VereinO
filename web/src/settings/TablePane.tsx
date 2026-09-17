import React, { useEffect, useState } from 'react'
import { ApiError, type User } from '../api'
import { loadWebTable, saveWebTable, type WebTableSettings } from '../settingsApi'

const columns: Array<[string, string]> = [
  ['actions', 'Aktionen'], ['date', 'Datum'], ['voucherNo', 'Belegnummer'], ['type', 'Art'], ['sphere', 'Sphäre'],
  ['description', 'Beschreibung'], ['note', 'Notiz'], ['earmark', 'Zweckbindung'], ['budget', 'Budget'],
  ['paymentMethod', 'Zahlungsweg'], ['attachments', 'Belege'], ['net', 'Netto'], ['vat', 'Steuer'], ['gross', 'Brutto']
]
export default function TablePane({ user, onSessionExpired }: { user: User; onSessionExpired: () => void }) {
  const [settings, setSettings] = useState<WebTableSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    loadWebTable().then(value => { if (active) setSettings(value) }).catch(cause => {
      if (!active) return
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      setError(cause instanceof Error ? cause.message : 'Tabelleneinstellungen konnten nicht geladen werden.')
    })
    return () => { active = false }
  }, [user.id, reload, onSessionExpired])
  const update = (change: Partial<WebTableSettings>) => { setSettings(current => current && { ...current, ...change }); setNotice('') }
  const move = (index: number, delta: -1 | 1) => {
    if (!settings) return
    const next = [...settings.columnOrder], target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    update({ columnOrder: next })
  }
  const reset = () => update({ journalLimit: 50, journalRowStyle: 'both', journalRowDensity: 'normal', columns: Object.fromEntries(columns.map(([key]) => [key, ['actions','date','type','sphere','description','note','earmark','budget','paymentMethod','attachments','gross'].includes(key)])), columnOrder: columns.map(([key]) => key) })
  const save = async () => {
    if (!settings || busy || user.role === 'USER') return
    setBusy(true); setError(''); setNotice('')
    try { const saved = await saveWebTable(settings); setSettings(saved); window.dispatchEvent(new CustomEvent('vereino-table-changed', { detail: saved })); setNotice('Tabelleneinstellungen gespeichert.') }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); setError(cause instanceof Error ? cause.message : 'Tabelleneinstellungen konnten nicht gespeichert werden.') }
    finally { setBusy(false) }
  }
  if (error) return <div className="card settings-card"><p role="alert">{error}</p><button className="btn" onClick={() => setReload(value => value + 1)}>Neu laden</button></div>
  if (!settings) return <p role="status">Tabelleneinstellungen werden geladen …</p>
  return <div className="settings-pane"><div className="card settings-card settings-pane-card"><div className="settings-title"><strong>Tabelle</strong></div><p className="settings-sub">Spalten, Dichte, Zeilenstil, Datumsformat und Seitenlänge werden für deinen Zugang gespeichert und in der klassischen Buchungsliste direkt verwendet.</p><fieldset disabled={busy || user.role === 'USER'} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <div className="settings-layout-grid settings-layout-grid--wide">
      <div className="settings-layout-control"><label>Zeilen pro Seite</label><div className="btn-group" role="group" aria-label="Zeilen pro Seite">{([20, 50, 100] as const).map(value => <button type="button" key={value} className={`btn-option ${settings.journalLimit === value ? 'active' : ''}`} aria-pressed={settings.journalLimit === value} onClick={() => update({ journalLimit: value })}>{value}</button>)}</div></div>
      <div className="settings-layout-control"><label>Datumsformat</label><div className="btn-group" role="group" aria-label="Datumsformat"><button type="button" className={`btn-option ${settings.dateFormat === 'de' ? 'active' : ''}`} onClick={() => update({ dateFormat: 'de' })}>Deutsch</button><button type="button" className={`btn-option ${settings.dateFormat === 'iso' ? 'active' : ''}`} onClick={() => update({ dateFormat: 'iso' })}>ISO</button></div></div>
      <div className="settings-layout-control"><label>Zeilenstil</label><select className="input" value={settings.journalRowStyle} onChange={event => update({ journalRowStyle: event.target.value as WebTableSettings['journalRowStyle'] })}><option value="both">Linien und Zebra</option><option value="lines">Linien</option><option value="zebra">Zebra</option><option value="none">Keine Hervorhebung</option></select></div>
      <div className="settings-layout-control"><label>Zeilendichte</label><select className="input" value={settings.journalRowDensity} onChange={event => update({ journalRowDensity: event.target.value as WebTableSettings['journalRowDensity'] })}><option value="normal">Normal</option><option value="compact">Kompakt</option></select></div>
    </div>
    <div className="settings-layout-control" style={{ marginTop: 18 }}><label>Spalten</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8 }}>{columns.map(([key, label]) => <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={settings.columns[key] !== false} onChange={event => update({ columns: { ...settings.columns, [key]: event.target.checked } })} />{label}</label>)}</div></div>
    <div className="settings-layout-control" style={{ marginTop: 18 }}><label>Reihenfolge</label><div style={{ display: 'grid', gap: 6 }}>{settings.columnOrder.map((key, index) => <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ flex: 1 }}>{columns.find(([candidate]) => candidate === key)?.[1] || key}</span><button type="button" className="btn" aria-label={`${key} nach oben`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" className="btn" aria-label={`${key} nach unten`} disabled={index === settings.columnOrder.length - 1} onClick={() => move(index, 1)}>↓</button></div>)}</div></div>
    {user.role !== 'USER' && <div className="settings-pane-actions"><button type="button" className="btn" onClick={reset}>Zurücksetzen</button><button type="button" className="btn primary" onClick={() => void save()}>{busy ? 'Wird gespeichert …' : 'Tabelle speichern'}</button></div>}
  </fieldset></div>{notice && <p role="status" style={{ color: 'var(--success)' }}>{notice}</p>}</div>
}
