import React from 'react'
import { createPortal } from 'react-dom'

export interface DonationReceiptDraft {
  id: string
  receiptType: 'MONEY' | 'IN_KIND'
  donorName: string
  donorAddress: string
  amount: number
  itemDescription: string
  itemCondition: string
  itemOrigin: 'PRIVAT' | 'BETRIEB' | 'UNBEKANNT'
  valuationMethod: string
  donationDate: string
  purpose: string
  receiptDate: string
  place: string
  waiverReimbursement: boolean
  directUse: boolean
  forwardedToOtherEntity: boolean
  forwardedRecipient: string
  signerName: string
}

interface DonationReceiptDefaults {
  orgName: string
  orgAddress: string
  cashier: string
  orgLogoDataUrl: string
  taxOffice: string
  taxNumber: string
  exemptionNoticeDate: string
}

interface DonationReceiptModalProps {
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
  defaults: DonationReceiptDefaults
  initialDraft?: DonationReceiptDraft | null
  onClose: () => void
  onSaveDraft: (draft: DonationReceiptDraft) => Promise<void>
}

function createEmptyDraft(defaults: DonationReceiptDefaults): DonationReceiptDraft {
  return {
    id: `draft-${Date.now()}`,
    receiptType: 'MONEY',
    donorName: '',
    donorAddress: '',
    amount: 0,
    itemDescription: '',
    itemCondition: '',
    itemOrigin: 'PRIVAT',
    valuationMethod: '',
    donationDate: new Date().toISOString().slice(0, 10),
    purpose: '',
    receiptDate: new Date().toISOString().slice(0, 10),
    place: (() => {
      const parts = String(defaults.orgAddress || '').trim().split(/\n+/)
      const last = parts.at(-1) || ''
      const cityMatch = last.match(/\d{4,5}\s+(.+)$/)
      return cityMatch?.[1] || ''
    })(),
    waiverReimbursement: true,
    directUse: true,
    forwardedToOtherEntity: false,
    forwardedRecipient: '',
    signerName: defaults.cashier || ''
  }
}

const RECEIPT_TABS: { key: DonationReceiptDraft['receiptType']; label: string; icon: string; description: string }[] = [
  { key: 'MONEY', label: 'Geldzuwendung', icon: '💶', description: '§ 10b EStG · Anlage 1' },
  { key: 'IN_KIND', label: 'Sachzuwendung', icon: '📦', description: '§ 10b EStG · Anlage 1' }
]

export default function DonationReceiptModal({ notify, defaults, initialDraft, onClose, onSaveDraft }: DonationReceiptModalProps) {
  const [draft, setDraft] = React.useState<DonationReceiptDraft>(() => initialDraft || createEmptyDraft(defaults))
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  function update<K extends keyof DonationReceiptDraft>(key: K, value: DonationReceiptDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function validate(): string | null {
    if (!draft.donorName.trim()) return 'Name des Zuwendenden fehlt'
    if (!draft.donorAddress.trim()) return 'Anschrift des Zuwendenden fehlt'
    if (!draft.donationDate) return 'Tag der Zuwendung fehlt'
    if (!draft.purpose.trim()) return 'Begünstigter Zweck fehlt'
    if (!(Number(draft.amount) > 0)) {
      return draft.receiptType === 'IN_KIND' ? 'Wert der Sachspende muss größer als 0 sein' : 'Betrag muss größer als 0 sein'
    }
    if (draft.receiptType === 'IN_KIND' && !draft.itemDescription.trim()) return 'Bezeichnung der Sachspende fehlt'
    if (draft.receiptType === 'IN_KIND' && !draft.itemCondition.trim()) return 'Zustand der Sachspende fehlt'
    if (draft.receiptType === 'IN_KIND' && !draft.valuationMethod.trim()) return 'Grundlage der Wertermittlung fehlt'
    if (draft.forwardedToOtherEntity && !draft.forwardedRecipient.trim()) {
      return 'Empfänger bei Weiterleitung fehlt'
    }
    return null
  }

  async function saveDraft() {
    const err = validate()
    if (err) {
      notify('error', err)
      return
    }
    setBusy(true)
    try {
      await onSaveDraft({ ...draft, amount: Number(draft.amount) })
      notify('success', 'Entwurf gespeichert')
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  async function exportPdf() {
    const err = validate()
    if (err) {
      notify('error', err)
      return
    }
    setBusy(true)
    try {
      const payload = {
        ...draft,
        amount: Number(draft.amount),
        orgName: defaults.orgName,
        orgAddress: defaults.orgAddress,
        cashier: draft.signerName || defaults.cashier,
        orgLogoDataUrl: defaults.orgLogoDataUrl || undefined,
        taxOffice: defaults.taxOffice,
        taxNumber: defaults.taxNumber,
        exemptionNoticeDate: defaults.exemptionNoticeDate
      }
      const res = await (window as any).api?.donations?.exportMoneyReceipt(payload)
      if (res?.filePath) {
        notify('success', `PDF erstellt: ${res.filePath}`)
        try {
          await window.api?.shell?.openPath(res.filePath)
        } catch {
          // ignore
        }
      }
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const isMoney = draft.receiptType === 'MONEY'

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal modal-wide donations-modal" onClick={(e) => e.stopPropagation()}>
        <div className="donations-modal-sticky">
          <div className="modal-header">
            <h2>Spendenbescheinigung anlegen</h2>
            <button className="btn ghost" onClick={onClose} aria-label="Schließen">✕</button>
          </div>

          {/* Receipt type tabs */}
          <div className="donations-type-tabs" role="tablist">
            {RECEIPT_TABS.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={draft.receiptType === tab.key}
                className={`donations-type-tab${draft.receiptType === tab.key ? ' active' : ''}`}
                onClick={() => update('receiptType', tab.key)}
              >
                <span className="donations-type-tab-icon">{tab.icon}</span>
                <span className="donations-type-tab-text">
                  <span className="donations-type-tab-label">{tab.label}</span>
                  <span className="donations-type-tab-desc">{tab.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="donations-modal-body">
        <section className="card donations-modal-section">
          <strong>1) Zuwendender</strong>
          <div className="row">
            <div className="field">
              <label>Name</label>
              <input className="input" value={draft.donorName} onChange={(e) => update('donorName', e.target.value)} title="Name des Zuwendenden" placeholder="Vorname Nachname" />
            </div>
            <div className="field">
              <label>Anschrift</label>
              <textarea className="input" rows={2} value={draft.donorAddress} onChange={(e) => update('donorAddress', e.target.value)} title="Anschrift des Zuwendenden" placeholder="Straße Hausnummer&#10;PLZ Ort" />
            </div>
          </div>
        </section>

        <section className="card donations-modal-section">
          <strong>2) {isMoney ? 'Geldzuwendung' : 'Sachzuwendung'}</strong>
          <div className="row">
            <div className="field">
              <label>{isMoney ? 'Betrag (EUR)' : 'Wert der Sachzuwendung (EUR)'}</label>
              <input className="input" type="number" min={0} step="0.01" value={String(draft.amount || '')} onChange={(e) => update('amount', Number(e.target.value))} title="Betrag in Euro" placeholder="0,00" />
            </div>
            <div className="field">
              <label>Tag der Zuwendung</label>
              <input className="input" type="date" value={draft.donationDate} onChange={(e) => update('donationDate', e.target.value)} title="Tag der Zuwendung" />
            </div>
          </div>
          {!isMoney && (
            <>
              <div className="row">
                <div className="field">
                  <label>Bezeichnung der Sachzuwendung</label>
                  <input
                    className="input"
                    value={draft.itemDescription}
                    onChange={(e) => update('itemDescription', e.target.value)}
                    title="Bezeichnung der Sachzuwendung"
                    placeholder="z. B. 1 Laptop, gebraucht"
                  />
                </div>
                <div className="field">
                  <label>Zustand</label>
                  <input
                    className="input"
                    value={draft.itemCondition}
                    onChange={(e) => update('itemCondition', e.target.value)}
                    title="Zustand der Sachzuwendung"
                    placeholder="z. B. gebraucht, funktionsfähig"
                  />
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label>Herkunft</label>
                  <select
                    className="input"
                    value={draft.itemOrigin}
                    onChange={(e) => update('itemOrigin', e.target.value as DonationReceiptDraft['itemOrigin'])}
                    title="Herkunft der Sachzuwendung"
                  >
                    <option value="PRIVAT">Privatvermögen</option>
                    <option value="BETRIEB">Betriebsvermögen</option>
                    <option value="UNBEKANNT">Unbekannt / nicht angegeben</option>
                  </select>
                </div>
                <div className="field">
                  <label>Grundlage der Wertermittlung</label>
                  <input
                    className="input"
                    value={draft.valuationMethod}
                    onChange={(e) => update('valuationMethod', e.target.value)}
                    title="Grundlage der Wertermittlung"
                    placeholder="z. B. Kaufbeleg vom 12.01.2025"
                  />
                </div>
              </div>
            </>
          )}
          <div className="row">
            <div className="field">
              <label>Begünstigter Zweck</label>
              <input className="input" value={draft.purpose} onChange={(e) => update('purpose', e.target.value)} title="Begünstigter Zweck" placeholder="z. B. Jugendförderung" />
            </div>
            <div className="field">
              <label>Ausstellungsdatum</label>
              <input className="input" type="date" value={draft.receiptDate} onChange={(e) => update('receiptDate', e.target.value)} title="Ausstellungsdatum" />
            </div>
          </div>
        </section>

        <section className="card donations-modal-section">
          <strong>3) Verwendung</strong>
          <div className="donations-checks-grid">
            <label className="donations-check"><input type="checkbox" checked={draft.waiverReimbursement} onChange={(e) => update('waiverReimbursement', e.target.checked)} /> Verzicht auf Aufwendungserstattung</label>
            <label className="donations-check"><input type="checkbox" checked={draft.directUse} onChange={(e) => update('directUse', e.target.checked)} /> Unmittelbar für den angegebenen Zweck</label>
            <label className="donations-check"><input type="checkbox" checked={draft.forwardedToOtherEntity} onChange={(e) => update('forwardedToOtherEntity', e.target.checked)} /> Weitergeleitet an andere Körperschaft</label>
          </div>
          {draft.forwardedToOtherEntity && (
            <div className="field">
              <label>Empfänger (Weiterleitung)</label>
              <input className="input" value={draft.forwardedRecipient} onChange={(e) => update('forwardedRecipient', e.target.value)} title="Empfänger bei Weiterleitung" placeholder="Name der empfangenden Körperschaft" />
            </div>
          )}
        </section>

        <section className="card donations-modal-section">
          <strong>4) Ort / Unterschrift</strong>
          <div className="row">
            <div className="field">
              <label>Ort</label>
              <input className="input" value={draft.place} onChange={(e) => update('place', e.target.value)} title="Ort der Ausstellung" placeholder="z. B. München" />
            </div>
            <div className="field">
              <label>Unterzeichner (aus Organisation)</label>
              <input className="input" value={draft.signerName} onChange={(e) => update('signerName', e.target.value)} title="Unterzeichner" placeholder="Kassierer" />
            </div>
          </div>
        </section>

        <div className="modal-actions-between">
          <div className="helper">Pflichttexte werden gesetzeskonform fest im PDF eingefügt.</div>
          <div className="flex gap-8">
            <button className="btn" onClick={saveDraft} disabled={busy}>Entwurf speichern</button>
            <button className="btn primary" onClick={exportPdf} disabled={busy}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              PDF exportieren
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
