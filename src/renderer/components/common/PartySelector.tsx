import React from 'react'
import { createPortal } from 'react-dom'
import type { TParty, TPartyRole, TPartyUpsertInput } from '../../../../electron/main/ipc/schemas'
import { addDataChangedListener, dispatchDataChanged } from '../../utils/refresh'
import { PARTY_ROLE_LABELS } from './partyLabels'

export type PartySelection = { partyId: number | null; name: string }

type PartyEditorModalProps = {
  initial?: Partial<TParty> & { role?: TPartyRole }
  onClose: () => void
  onSaved: (party: TParty) => void
}

function nullable(value: string) {
  return value.trim() || null
}

export function PartyEditorModal({ initial, onClose, onSaved }: PartyEditorModalProps) {
  const [draft, setDraft] = React.useState<TPartyUpsertInput>({
    id: initial?.id,
    name: initial?.name || '',
    legalName: initial?.legalName || '',
    role: initial?.role || 'BOTH',
    contactName: initial?.contactName || '',
    email: initial?.email || '',
    phone: initial?.phone || '',
    street: initial?.street || '',
    postalCode: initial?.postalCode || '',
    city: initial?.city || '',
    country: initial?.country || 'DE',
    iban: initial?.iban || '',
    bic: initial?.bic || '',
    taxNumber: initial?.taxNumber || '',
    vatId: initial?.vatId || '',
    paymentTermDays: initial?.paymentTermDays ?? null,
    note: initial?.note || '',
    isActive: initial?.isActive !== 0
  })
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  const set = <K extends keyof TPartyUpsertInput>(key: K, value: TPartyUpsertInput[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }
  const floatingClass = (value: unknown, alwaysFilled = false) => `field party-floating-field${alwaysFilled || String(value ?? '').trim() ? ' party-floating-field--filled' : ''}`

  const save = async () => {
    if (!draft.name.trim() || busy) {
      if (!draft.name.trim()) setError('Bitte einen Namen angeben.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await window.api.parties.upsert({
        ...draft,
        name: draft.name.trim(),
        legalName: nullable(draft.legalName || ''),
        contactName: nullable(draft.contactName || ''),
        email: nullable(draft.email || ''),
        phone: nullable(draft.phone || ''),
        street: nullable(draft.street || ''),
        postalCode: nullable(draft.postalCode || ''),
        city: nullable(draft.city || ''),
        country: nullable(draft.country || '') || 'DE',
        iban: nullable(draft.iban || ''),
        bic: nullable(draft.bic || ''),
        taxNumber: nullable(draft.taxNumber || ''),
        vatId: nullable(draft.vatId || ''),
        note: nullable(draft.note || '')
      })
      const party = await window.api.parties.get({ id: result.id })
      dispatchDataChanged(['parties'])
      onSaved(party)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="modal-overlay party-editor-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal party-editor-modal" onClick={(event) => event.stopPropagation()}>
        <header className="party-editor-modal__header">
          <div>
            <h2>{initial?.id ? 'Geschäftspartner bearbeiten' : 'Geschäftspartner anlegen'}</h2>
            <div className="helper">Die Angaben stehen danach in Buchungen und Rechnungen zur Auswahl.</div>
          </div>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Schließen">✕</button>
        </header>
        <div className="party-editor-modal__body">
          <div className="party-editor-grid">
            <label className={floatingClass(draft.name)}><span>Name *</span><input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} autoFocus /></label>
            <label className={floatingClass(draft.role, true)}><span>Rolle</span><select className="input" value={draft.role} onChange={(e) => set('role', e.target.value as TPartyRole)}>{Object.entries(PARTY_ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className={floatingClass(draft.legalName)}><span>Rechtlicher Name</span><input className="input" value={draft.legalName || ''} onChange={(e) => set('legalName', e.target.value)} /></label>
            <label className={floatingClass(draft.contactName)}><span>Ansprechperson</span><input className="input" value={draft.contactName || ''} onChange={(e) => set('contactName', e.target.value)} /></label>
            <label className={floatingClass(draft.email)}><span>E-Mail</span><input className="input" type="email" value={draft.email || ''} onChange={(e) => set('email', e.target.value)} /></label>
            <label className={floatingClass(draft.phone)}><span>Telefon</span><input className="input" value={draft.phone || ''} onChange={(e) => set('phone', e.target.value)} /></label>
            <label className={`${floatingClass(draft.street)} party-editor-grid__wide`}><span>Straße</span><input className="input" value={draft.street || ''} onChange={(e) => set('street', e.target.value)} /></label>
            <label className={floatingClass(draft.postalCode)}><span>PLZ</span><input className="input" value={draft.postalCode || ''} onChange={(e) => set('postalCode', e.target.value)} /></label>
            <label className={floatingClass(draft.city)}><span>Ort</span><input className="input" value={draft.city || ''} onChange={(e) => set('city', e.target.value)} /></label>
            <label className={floatingClass(draft.country, true)}><span>Land</span><input className="input" value={draft.country || ''} onChange={(e) => set('country', e.target.value)} /></label>
            <label className={floatingClass(draft.paymentTermDays)}><span>Zahlungsziel (Tage)</span><input className="input" type="number" min="0" value={draft.paymentTermDays ?? ''} onChange={(e) => set('paymentTermDays', e.target.value === '' ? null : Number(e.target.value))} /></label>
            <label className={`${floatingClass(draft.iban)} party-editor-grid__wide`}><span>IBAN</span><input className="input" value={draft.iban || ''} onChange={(e) => set('iban', e.target.value)} /></label>
            <label className={floatingClass(draft.bic)}><span>BIC</span><input className="input" value={draft.bic || ''} onChange={(e) => set('bic', e.target.value)} /></label>
            <label className={floatingClass(draft.taxNumber)}><span>Steuernummer</span><input className="input" value={draft.taxNumber || ''} onChange={(e) => set('taxNumber', e.target.value)} /></label>
            <label className={floatingClass(draft.vatId)}><span>USt-IdNr.</span><input className="input" value={draft.vatId || ''} onChange={(e) => set('vatId', e.target.value)} /></label>
            <label className={floatingClass(draft.isActive, true)}><span>Status</span><select className="input" value={draft.isActive === false ? '0' : '1'} onChange={(e) => set('isActive', e.target.value === '1')}><option value="1">Aktiv</option><option value="0">Archiviert</option></select></label>
            <label className={`${floatingClass(draft.note)} party-editor-grid__full party-floating-field--textarea`}><span>Notiz</span><textarea className="input" rows={3} value={draft.note || ''} onChange={(e) => set('note', e.target.value)} /></label>
          </div>
          {error && <div className="helper error-text">{error}</div>}
        </div>
        <footer className="party-editor-modal__footer">
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Speichert…' : 'Speichern'}</button>
        </footer>
      </div>
    </div>,
    document.body
  )
}

type PartySelectorProps = {
  valueId?: number | null
  valueName: string
  role?: 'SUPPLIER' | 'CUSTOMER'
  inputId?: string
  ariaLabel?: string
  placeholder?: string
  invalid?: boolean
  menuPlacement?: 'auto' | 'top' | 'bottom'
  onChange: (selection: PartySelection) => void
}

type PartyMenuPosition = {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

export default function PartySelector({ valueId, valueName, role, inputId, ariaLabel, placeholder, invalid, menuPlacement = 'auto', onChange }: PartySelectorProps) {
  const [parties, setParties] = React.useState<TParty[]>([])
  const [open, setOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [menuPosition, setMenuPosition] = React.useState<PartyMenuPosition | null>(null)
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const menuRef = React.useRef<HTMLDivElement | null>(null)

  const load = React.useCallback(async () => {
    try {
      // Show every active partner. Role is a helpful default for creating a new
      // entry, but must never hide an existing entry from a booking form.
      const result = await window.api.parties.list({ activeOnly: true, limit: 200 })
      setParties(result.rows)
    } catch {
      setParties([])
    }
  }, [role])

  React.useEffect(() => { void load() }, [load])
  React.useEffect(() => addDataChangedListener(['parties'], () => void load()), [load])
  React.useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const syncMenuPosition = React.useCallback(() => {
    const input = inputRef.current
    if (!input) return
    const rect = input.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom
    const above = rect.top
    const menuGap = 10
    const placeAbove = menuPlacement === 'top' || (menuPlacement === 'auto' && below < 230 && above > below)
    const available = Math.max(120, (placeAbove ? above : below) - menuGap)
    setMenuPosition({
      left: rect.left,
      width: rect.width,
      ...(placeAbove ? { bottom: window.innerHeight - rect.top + menuGap } : { top: rect.bottom + menuGap }),
      maxHeight: Math.min(280, available)
    })
  }, [menuPlacement])

  React.useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null)
      return
    }
    syncMenuPosition()
    const refresh = () => syncMenuPosition()
    window.addEventListener('resize', refresh)
    document.addEventListener('scroll', refresh, true)
    return () => {
      window.removeEventListener('resize', refresh)
      document.removeEventListener('scroll', refresh, true)
    }
  }, [open, syncMenuPosition])

  const query = valueName.trim().toLocaleLowerCase('de')
  const matches = parties
    .filter((party) => !query || party.name.toLocaleLowerCase('de').includes(query) || party.legalName?.toLocaleLowerCase('de').includes(query))
    .sort((a, b) => {
      const aMatchesRole = !role || a.role === role || a.role === 'BOTH'
      const bMatchesRole = !role || b.role === role || b.role === 'BOTH'
      if (aMatchesRole !== bMatchesRole) return aMatchesRole ? -1 : 1
      return a.name.localeCompare(b.name, 'de')
    })
    .slice(0, 8)

  const updateText = (name: string) => {
    const exact = parties.find((party) => party.name.localeCompare(name.trim(), 'de', { sensitivity: 'accent' }) === 0)
    onChange({ partyId: exact?.id ?? null, name })
    setOpen(true)
  }

  const menu = open && menuPosition && createPortal(
    <div
      ref={menuRef}
      className="party-selector__menu party-selector__menu--portal"
      style={menuPosition}
    >
      {matches.map((party) => (
        <button key={party.id} type="button" className={party.id === valueId ? 'is-selected' : ''} onClick={() => { onChange({ partyId: party.id, name: party.name }); setOpen(false) }}>
          <span><strong>{party.name}</strong>{party.legalName && party.legalName !== party.name ? <small>{party.legalName}</small> : null}</span>
          <small>{PARTY_ROLE_LABELS[party.role]}</small>
        </button>
      ))}
      {!matches.length && <div className="party-selector__empty">Kein passender Geschäftspartner. Freitext bleibt möglich.</div>}
      <button type="button" className="party-selector__create" onClick={() => { setOpen(false); setCreating(true) }}>+ „{valueName.trim() || 'Neuen Partner'}“ anlegen</button>
    </div>,
    document.body
  )

  return (
    <div className="party-selector" ref={rootRef}>
      <div className="party-selector__control">
        <input
          ref={inputRef}
          id={inputId}
          className="input"
          value={valueName}
          placeholder={placeholder || 'Geschäftspartner wählen oder eingeben'}
          style={invalid ? { borderColor: 'var(--danger)' } : undefined}
          onFocus={() => { setOpen(true); void load() }}
          onChange={(event) => updateText(event.target.value)}
          aria-label={ariaLabel}
          autoComplete="off"
        />
        {valueName && <button type="button" className="btn ghost party-selector__clear" onClick={() => onChange({ partyId: null, name: '' })} aria-label="Geschäftspartner entfernen">×</button>}
        <button type="button" className="btn party-selector__add" onClick={() => setCreating(true)} title="Geschäftspartner anlegen">+</button>
      </div>
      {menu}
      {creating && <PartyEditorModal initial={{ name: valueName.trim(), role: role || 'BOTH' }} onClose={() => setCreating(false)} onSaved={(party) => { setCreating(false); void load(); onChange({ partyId: party.id, name: party.name }) }} />}
    </div>
  )
}
