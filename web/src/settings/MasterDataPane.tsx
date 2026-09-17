import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconArchive, IconPencil, IconRestore } from '@tabler/icons-react'
import TagModal from '../../../src/renderer/components/modals/TagModal'
import CategoryModal from '../../../src/renderer/components/modals/CategoryModal'
import { PartyEditorModal } from '../../../src/renderer/components/common/PartySelector'
import type { TParty } from '../../../electron/main/ipc/schemas'
import { api, ApiError, type User } from '../api'

export type MasterKind = 'accounts' | 'categories' | 'parties' | 'tags'
type MasterRow = { id: number; version: number; name: string; isActive: boolean; color?: string | null; icon?: string | null; kind?: string; iban?: string | null; sortOrder?: number; [key: string]: unknown }
const labels = {
  accounts: { title: 'Zahlungskonten', create: 'Neues Konto' },
  categories: { title: 'Kategorien', create: 'Neue Kategorie' },
  parties: { title: 'Geschäftspartner', create: 'Neuer Geschäftspartner' },
  tags: { title: 'Tags', create: 'Neuer Tag' }
}
const kinds: Record<string, string> = { CASH: 'Kasse', BANK: 'Bank', PAYPAL: 'PayPal', CARD: 'Karte', OTHER: 'Sonstiges' }
const detailFields: Array<[string, string]> = [['legalName', 'Vollständiger Name'], ['role', 'Rolle'], ['contactName', 'Kontaktperson'], ['email', 'E-Mail'], ['phone', 'Telefon'], ['street', 'Straße'], ['postalCode', 'Postleitzahl'], ['city', 'Ort'], ['country', 'Land'], ['iban', 'IBAN'], ['bic', 'BIC'], ['taxNumber', 'Steuernummer'], ['vatId', 'USt-ID'], ['paymentTermDays', 'Zahlungsziel (Tage)'], ['note', 'Notiz'], ['sortOrder', 'Reihenfolge']]
export default function MasterDataPane({ kind, user, onSessionExpired }: { kind: MasterKind; user: User; onSessionExpired: () => void }) {
  const [rows, setRows] = useState<MasterRow[]>([])
  const [edit, setEdit] = useState<MasterRow | 'new' | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const admin = user.role === 'ADMIN'
  useEffect(() => {
    let active = true
    setLoading(true); setRows([]); setEdit(null); setError('')
    api<{ rows: MasterRow[] }>(`/settings/master-data/${kind}`).then(result => { if (active) setRows(result.rows) }).catch(cause => {
      if (!active) return
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      setError(cause instanceof Error ? cause.message : 'Stammdaten konnten nicht geladen werden.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [kind, user.id, revision, onSessionExpired])
  const saveRow = async (value: Record<string, unknown>) => {
    if (!admin) throw new Error('Keine Berechtigung.')
    const { id: _id, ...fields } = value
    const current = edit && edit !== 'new' ? edit : null
    try {
      return (await api<{ row: MasterRow }>(`/settings/master-data/${kind}${current ? `/${current.id}` : ''}`, current ? 'PATCH' : 'POST', { ...fields, ...(current ? { version: current.version } : {}) })).row
    } catch (cause) { if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); throw cause }
  }
  const saved = () => { setEdit(null); setNotice('Eintrag gespeichert.'); setRevision(value => value + 1) }
  const archive = async (row: MasterRow) => {
    if (busy || !admin) return
    setBusy(true); setError(''); setNotice('')
    try { await api(`/settings/master-data/${kind}/${row.id}`, 'PATCH', { version: row.version, isActive: !row.isActive }); setNotice(row.isActive ? 'Eintrag archiviert.' : 'Eintrag reaktiviert.'); setRevision(value => value + 1) }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onSessionExpired(); setError(cause instanceof Error ? cause.message : 'Eintrag konnte nicht geändert werden.') }
    finally { setBusy(false) }
  }
  const draft = edit && edit !== 'new' ? edit : null
  const notify = (_type: string, message: string) => setError(message)
  return <div className="settings-pane">
    <div className="settings-pane-heading"><div><div className="settings-pane-title-row"><h2 style={{ margin: 0 }}>{labels[kind].title}</h2>{!loading && <span className="chip">{rows.length}</span>}</div><p className="helper">Diese Stammdaten sind derzeit noch nicht mit Buchungen verknüpft.</p></div>{admin && <button className="btn primary" onClick={() => { setEdit('new'); setNotice('') }}>{labels[kind].create}</button>}</div>
    {kind === 'categories' && <div className="card settings-pane-card"><strong>Zusätzliche Kategorien</strong><p className="helper">Die steuerlichen Sphären Ideeller Bereich, Zweckbetrieb, Vermögensverwaltung und Wirtschaftlicher Geschäftsbetrieb bleiben unverändert. Diese Kategorien werden zusätzlich vorbereitet.</p></div>}
    {error && <div className="card" role="alert"><p>{error}</p><button className="btn" onClick={() => setRevision(value => value + 1)}>Neu laden</button></div>}
    {notice && <p role="status" style={{ color: 'var(--success)' }}>{notice}</p>}
    {loading ? <p role="status">Stammdaten werden geladen …</p> : !rows.length ? <div className="card settings-pane-card">Noch keine Einträge vorhanden.</div> : <div className="payment-account-grid">{rows.map(row => <article key={row.id} aria-label={row.name} className="payment-account-card" style={{ '--account-color': row.color || 'var(--border)', '--account-background': row.color ? `${row.color}20` : 'var(--muted)', opacity: row.isActive ? 1 : 0.65 } as React.CSSProperties}>
      <div className="payment-account-card__initial">{row.icon || row.name.charAt(0).toUpperCase()}</div><div className="payment-account-card__details"><div className="payment-account-card__name">{row.name}</div>{row.kind && <div className="helper">{kinds[row.kind]}</div>}<span className="helper">{row.isActive ? 'Aktiv' : 'Archiviert'}</span>{detailFields.some(([key]) => row[key] != null && row[key] !== '') && <details><summary>Details</summary><dl style={{ margin: '8px 0', overflowWrap: 'anywhere' }}>{detailFields.filter(([key]) => row[key] != null && row[key] !== '').map(([key, label]) => <React.Fragment key={key}><dt className="helper">{label}</dt><dd style={{ margin: '0 0 6px' }}>{String(row[key])}</dd></React.Fragment>)}</dl></details>}</div>
      {admin && <div className="payment-account-card__actions"><button className="btn btn-edit" disabled={busy} aria-label={`${row.name} bearbeiten`} onClick={() => setEdit(row)}><IconPencil size={16} /></button><button className="btn ghost" disabled={busy} aria-label={`${row.name} ${row.isActive ? 'archivieren' : 'reaktivieren'}`} onClick={() => void archive(row)}>{row.isActive ? <IconArchive size={16} /> : <IconRestore size={16} />}</button></div>}
    </article>)}</div>}
    {edit && admin && kind === 'tags' && <TagModal value={{ id: draft?.id, name: draft?.name || '', color: draft?.color }} onSave={async value => { await saveRow(value) }} onClose={() => setEdit(null)} onSaved={saved} notify={notify} />}
    {edit && admin && kind === 'categories' && <CategoryModal value={{ id: draft?.id, name: draft?.name || '', color: draft?.color, icon: draft?.icon }} onSave={async value => { await saveRow(value) }} onClose={() => setEdit(null)} onSaved={saved} notify={notify} />}
    {edit && admin && kind === 'parties' && <PartyEditorModal initial={draft ? { ...draft, isActive: draft.isActive ? 1 : 0 } as unknown as TParty : undefined} onSave={async value => (await saveRow(value)) as unknown as TParty} onClose={() => setEdit(null)} onSaved={saved} />}
    {edit && admin && kind === 'accounts' && <AccountEditor row={draft} onSave={async value => { await saveRow(value); saved() }} onClose={() => setEdit(null)} />}
  </div>
}

function AccountEditor({ row, onSave, onClose }: { row: MasterRow | null; onSave: (value: Record<string, unknown>) => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [color, setColor] = useState(row?.color || '')
  return createPortal(<div className="modal-overlay" role="dialog" aria-modal="true" aria-label={row ? 'Konto bearbeiten' : 'Konto anlegen'} onClick={() => { if (!busy) onClose() }}><form className="modal payment-account-modal" onClick={event => event.stopPropagation()} onSubmit={async event => {
    event.preventDefault(); if (busy) return
    const form = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try { await onSave({ name: String(form.get('name')).trim(), kind: form.get('kind'), iban: String(form.get('iban') || '').trim() || null, color: color || null, sortOrder: Number(form.get('sortOrder')) }) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Konto konnte nicht gespeichert werden.') } finally { setBusy(false) }
  }}><header className="payment-account-modal__header"><h2>{row ? 'Konto bearbeiten' : 'Konto anlegen'}</h2><button type="button" className="btn ghost" disabled={busy} aria-label="Schließen" onClick={onClose}>✕</button></header><fieldset disabled={busy} className="payment-account-modal__body" style={{ border: 0, minWidth: 0 }}>
    <div className="field"><label htmlFor="master-account-name">Name</label><input id="master-account-name" className="input" name="name" defaultValue={row?.name} required maxLength={255} autoFocus /></div>
    <div className="field"><label htmlFor="master-account-kind">Kontoart</label><select id="master-account-kind" className="input" name="kind" defaultValue={row?.kind || 'BANK'}>{Object.entries(kinds).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></div>
    <div className="field"><label htmlFor="master-account-iban">IBAN</label><input id="master-account-iban" className="input" name="iban" defaultValue={row?.iban || ''} maxLength={34} /></div>
    <div className="field"><label htmlFor="master-account-order">Reihenfolge</label><input id="master-account-order" className="input" type="number" name="sortOrder" min={0} step={1} defaultValue={row?.sortOrder || 0} required /></div>
    <div className="field"><label htmlFor="master-account-color">Farbe</label><div className="row"><input id="master-account-color" type="color" value={color || '#1976d2'} onChange={event => setColor(event.target.value)} /><button type="button" className="btn" onClick={() => setColor('')}>Keine Farbe</button></div></div>
    {error && <p role="alert" style={{color:'var(--danger)'}}>{error}</p>}<div className="settings-pane-actions"><button type="button" className="btn" onClick={onClose}>Abbrechen</button><button className="btn primary" type="submit">{busy ? 'Speichert…' : 'Speichern'}</button></div>
  </fieldset></form></div>, document.body)
}
