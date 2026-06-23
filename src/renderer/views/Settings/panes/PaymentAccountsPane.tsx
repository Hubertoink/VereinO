import React from 'react'
import { PaymentAccountsPaneProps } from '../types'
import { IconTrash } from '../../../utils/icons'

type PaymentAccountDraft = {
  id?: number
  name: string
  kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'
  iban?: string | null
  color?: string | null
  sortOrder: number
  isActive: boolean
}

const KIND_LABELS: Record<PaymentAccountDraft['kind'], string> = {
  CASH: 'Kasse',
  BANK: 'Bank',
  PAYPAL: 'PayPal',
  CARD: 'Karte',
  OTHER: 'Sonstiges'
}

const ACCOUNT_PALETTE = ['#7C4DFF', '#2962FF', '#00B8D4', '#00C853', '#AEEA00', '#FFD600', '#FF9100', '#FF3D00', '#F50057', '#9C27B0']

function contrastText(bg?: string | null) {
  if (!bg) return '#000'
  const m = /^#?([0-9a-fA-F]{6})$/.exec(bg.trim())
  if (!m) return '#000'
  const hex = m[1]
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#000' : '#fff'
}

function emptyDraft(sortOrder: number): PaymentAccountDraft {
  return {
    name: '',
    kind: 'BANK',
    iban: '',
    color: null,
    sortOrder,
    isActive: true,
  }
}

export function PaymentAccountsPane({ paymentAccounts, setPaymentAccounts, notify, bumpDataVersion }: PaymentAccountsPaneProps) {
  const [draft, setDraft] = React.useState<PaymentAccountDraft | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [deleteConfirm, setDeleteConfirm] = React.useState<{ id: number; name: string } | null>(null)
  const [showColorPicker, setShowColorPicker] = React.useState(false)
  const [draftColor, setDraftColor] = React.useState('#1976D2')
  const [draftError, setDraftError] = React.useState('')

  const sortedAccounts = React.useMemo(
    () => [...paymentAccounts].sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name, 'de')),
    [paymentAccounts]
  )

  const refresh = React.useCallback(async () => {
    setBusy(true)
    try {
      const res = await window.api?.paymentAccounts?.list?.()
      setPaymentAccounts(res?.rows || [])
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }, [notify, setPaymentAccounts])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    if (!draft) return
    setDraftColor(draft.color || '#1976D2')
    setDraftError('')
  }, [draft])

  const closeDraft = () => {
    setDraft(null)
    setShowColorPicker(false)
    setDraftError('')
  }

  const saveDraft = async () => {
    if (!draft) return
    if (!draft.name.trim()) {
      notify('error', 'Bitte gib einen Kontonamen ein.')
      return
    }
    try {
      await window.api?.paymentAccounts?.upsert?.({
        id: draft.id,
        name: draft.name.trim(),
        kind: draft.kind,
        iban: draft.iban || null,
        color: draft.color || null,
        sortOrder: Math.max(1, Number(draft.sortOrder || 1)),
        isActive: draft.isActive,
      })
      notify('success', draft.id ? 'Konto aktualisiert' : 'Konto angelegt')
      closeDraft()
      await refresh()
      bumpDataVersion()
    } catch (e: any) {
      notify('error', e?.message || String(e))
    }
  }

  const deleteAccount = async () => {
    if (!deleteConfirm) return
    try {
      await window.api?.paymentAccounts?.delete?.({ id: deleteConfirm.id })
      notify('success', 'Konto gelöscht')
      setDeleteConfirm(null)
      await refresh()
      bumpDataVersion()
    } catch (e: any) {
      notify('error', e?.message || String(e))
    }
  }

  return (
    <div className="payment-accounts-pane">
      <div className="settings-pane-heading">
        <div>
          <div className="settings-pane-title-row">
            <strong>Zahlungskonten</strong>
            <span className="chip">{paymentAccounts.length}</span>
          </div>
          <div className="helper">Verwalte Barkasse, Vereinskonto, PayPal oder weitere Geldkonten für Buchungen und Transfers.</div>
        </div>
        <button className="btn primary" onClick={() => setDraft(emptyDraft(sortedAccounts.length + 1))}>
          + Neues Konto
        </button>
      </div>

      <div className="payment-account-grid">
        {sortedAccounts.map((account, index) => (
          <div key={account.id} className="card payment-account-card" style={{ '--account-color': account.color || 'var(--border)' } as React.CSSProperties}>
            <div className="payment-account-card__main">
              <div>
                <div className="payment-account-card__name">{account.name}</div>
                <div className="helper">{KIND_LABELS[account.kind]}{account.iban ? ` · ${account.iban}` : ''}</div>
              </div>
              <div className="payment-account-card__badges">
                <span className="chip">#{index + 1}</span>
                {!account.isActive && <span className="chip">Archiviert</span>}
              </div>
            </div>
            <div className="payment-account-card__actions">
              <button className="btn btn-edit" onClick={() => setDraft({ id: account.id, name: account.name, kind: account.kind, iban: account.iban || '', color: account.color || null, sortOrder: Math.max(1, account.sortOrder || index + 1), isActive: account.isActive !== 0 })}>✎</button>
              <button className="btn ghost btn-trash" onClick={() => setDeleteConfirm({ id: account.id, name: account.name })} title="Löschen">
                <IconTrash size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {busy && <div className="helper">Lade Konten…</div>}

      {draft && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={closeDraft}>
          <div className="modal payment-account-modal" onClick={(e) => e.stopPropagation()}>
            <header className="payment-account-modal__header">
              <h2>{draft.id ? 'Konto bearbeiten' : 'Konto anlegen'}</h2>
              <button className="btn ghost" onClick={closeDraft} aria-label="Schließen">✕</button>
            </header>
            <div className="payment-account-modal__body">
              <div className="row">
                <div className="field">
                  <label>Name</label>
                  <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
                </div>
                <div className="field">
                  <label>Typ</label>
                  <select className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as PaymentAccountDraft['kind'] })}>
                    {Object.entries(KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>IBAN</label>
                  <input className="input" value={draft.iban || ''} onChange={(e) => setDraft({ ...draft, iban: e.target.value })} />
                </div>
                <div className="field">
                  <label>Reihenfolge</label>
                  <input className="input" type="number" min="1" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Math.max(1, Number(e.target.value || 1)) })} />
                  <div className="helper">1 = zuerst in der Auswahlliste</div>
                </div>
                <div className="field">
                  <label>Status</label>
                  <select className="input" value={draft.isActive ? '1' : '0'} onChange={(e) => setDraft({ ...draft, isActive: e.target.value === '1' })}>
                    <option value="1">Aktiv</option>
                    <option value="0">Archiviert</option>
                  </select>
                </div>
                <div className="field field-full-width">
                  <label>Farbe</label>
                  <div className="color-picker-container">
                    {ACCOUNT_PALETTE.map((color) => (
                      <button key={color} type="button" className={`btn color-swatch-btn ${draft.color === color ? 'color-swatch-selected' : 'color-swatch-unselected'}`} onClick={() => setDraft({ ...draft, color })} title={color} style={{ background: color }} aria-label={`Farbe ${color}`}>
                        <span aria-hidden="true" />
                      </button>
                    ))}
                    <button type="button" className="btn custom-color-btn" onClick={() => setShowColorPicker(true)} title="Eigene Farbe" style={{ background: draft.color || 'var(--muted)', color: draft.color ? contrastText(draft.color) : 'var(--text)' }}>
                      Eigene…
                    </button>
                    <button type="button" className="btn custom-color-btn" onClick={() => setDraft({ ...draft, color: null })} title="Keine Farbe">Keine</button>
                  </div>
                </div>
              </div>
            </div>
            <footer className="payment-account-modal__footer">
              <button className="btn" onClick={closeDraft}>Abbrechen</button>
              <button className="btn primary" onClick={() => { void saveDraft() }}>Speichern</button>
            </footer>
          </div>
        </div>
      )}

      {showColorPicker && draft && (
        <div className="modal-overlay" onClick={() => setShowColorPicker(false)} role="dialog" aria-modal="true">
          <div className="modal color-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="color-picker-header">
              <h3 className="m-0">Eigene Farbe wählen</h3>
              <button className="btn ghost" onClick={() => setShowColorPicker(false)} aria-label="Schließen">✕</button>
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="payment-account-color-native">Picker</label>
                <input id="payment-account-color-native" className="color-input-native" type="color" value={draftColor} onChange={(e) => { setDraftColor(e.target.value); setDraftError('') }} />
              </div>
              <div className="field">
                <label htmlFor="payment-account-color-hex">HEX</label>
                <input id="payment-account-color-hex" className="input" value={draftColor} onChange={(e) => { setDraftColor(e.target.value); setDraftError('') }} placeholder="#1976D2" />
                {draftError && <div className="helper error-text">{draftError}</div>}
              </div>
            </div>
            <div className="card color-preview-card">
              <div className="color-preview-swatch" style={{ background: draftColor }} />
              <div className="helper">Kontrast: <span className="contrast-sample" style={{ background: draftColor, color: contrastText(draftColor) }}>{contrastText(draftColor)}</span></div>
            </div>
            <div className="delete-modal-actions">
              <button className="btn" onClick={() => setShowColorPicker(false)}>Abbrechen</button>
              <button className="btn primary" onClick={() => {
                const hex = draftColor.trim()
                const ok = /^#([0-9a-fA-F]{6})$/.test(hex)
                if (!ok) { setDraftError('Bitte gültigen HEX-Wert eingeben (z. B. #1976D2)'); return }
                setDraft({ ...draft, color: hex })
                setShowColorPicker(false)
              }}>Übernehmen</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, display: 'grid', gap: 12 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Konto löschen</h2>
              <button className="btn ghost" onClick={() => setDeleteConfirm(null)} aria-label="Schließen">✕</button>
            </header>
            <div className="helper">Möchtest du das Konto <strong>{deleteConfirm.name}</strong> wirklich löschen?</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
              <button className="btn danger" onClick={() => { void deleteAccount() }}>Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
