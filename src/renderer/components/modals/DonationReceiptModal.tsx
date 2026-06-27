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
  taxExemptionConfirmed: boolean
  statuteRequirementsConfirmed: boolean
  directUse: boolean
  noMembershipContribution: boolean
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
    waiverReimbursement: false,
    taxExemptionConfirmed: true,
    statuteRequirementsConfirmed: true,
    directUse: false,
    noMembershipContribution: false,
    signerName: defaults.cashier || ''
  }
}

const RECEIPT_TABS: { key: DonationReceiptDraft['receiptType']; label: string; icon: string; description: string }[] = [
  { key: 'MONEY', label: 'Geldzuwendung', icon: '💶', description: '§ 10b EStG · Anlage 3' },
  { key: 'IN_KIND', label: 'Sachzuwendung', icon: '📦', description: '§ 10b EStG · Anlage 3' }
]

const OFFICIAL_TEMPLATE_URL = 'https://ao.bundesfinanzministerium.de/esth/2019/C-Anhaenge/Anhang-37/I/inhalt.html'

export default function DonationReceiptModal({ notify, defaults, initialDraft, onClose, onSaveDraft }: DonationReceiptModalProps) {
  const [draft, setDraft] = React.useState<DonationReceiptDraft>(() => initialDraft || createEmptyDraft(defaults))
  const [busy, setBusy] = React.useState(false)
  const [infoModal, setInfoModal] = React.useState<string | null>(null)

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

  async function openOfficialTemplate() {
    try {
      await window.api?.shell?.openExternal(OFFICIAL_TEMPLATE_URL)
    } catch {
      notify('info', 'Die Musterseite konnte nicht direkt geöffnet werden. Bitte kopieren Sie die URL manuell.')
    }
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
        cashier: draft.signerName.trim(),
        orgLogoDataUrl: defaults.orgLogoDataUrl || undefined,
        taxOffice: defaults.taxOffice,
        taxNumber: defaults.taxNumber,
        exemptionNoticeDate: defaults.exemptionNoticeDate
      }
      const res = await window.api?.donations?.exportMoneyReceipt(payload)
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

  const verwendungInfos: Record<string, { title: string; text: string }> = {
    waiverReimbursement: {
      title: 'Verzicht auf Aufwendungserstattung',
      text: 'Der Zuwendende erklärt, dass es sich um den Verzicht auf die Erstattung von Aufwendungen handelt. Das betrifft z. B. ehrenamtliche Tätigkeiten, bei denen auf eine Vergütung oder Kostenerstattung verzichtet wird.'
    },
    taxExemptionConfirmed: {
      title: 'Freistellungsbescheid / Körperschaftsteuerbescheid',
      text: 'Diesen Haken setzen Sie nur, wenn für den Verein ein passender Freistellungsbescheid oder eine Anlage zum Körperschaftsteuerbescheid für den letzten Veranlagungszeitraum vorliegt und die Formulierung im Muster deshalb zutrifft.'
    },
    statuteRequirementsConfirmed: {
      title: 'Feststellung nach § 60a AO',
      text: 'Diesen Haken setzen Sie, wenn die Einhaltung der satzungsmäßigen Voraussetzungen nach §§ 51, 59, 60 und 61 AO mit Bescheid des Finanzamts nach § 60a AO gesondert festgestellt wurde und die Aussage im Formular übernommen werden darf.'
    },
    directUse: {
      title: 'Unmittelbare Verwendung',
      text: 'Diese Option passt für den Regelfall, in dem die empfangende Organisation die Zuwendung selbst für den angegebenen steuerbegünstigten Zweck verwendet.'
    },
    noMembershipContribution: {
      title: 'Kein Mitgliedsbeitrag',
      text: 'Diesen Haken setzen Sie nur, wenn die Einrichtung zu den Fällen gehört, bei denen Mitgliedsbeiträge steuerlich nicht abziehbar sind, und die konkrete Zahlung gerade kein solcher ausgeschlossener Mitgliedsbeitrag ist. Für normale Spenden an einen gemeinnützigen Verein kann die Kassiererin oder der Kassier hier bewusst entscheiden, ob der Zusatz benötigt wird.'
    }
  }

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal modal-wide donations-modal" onClick={(e) => e.stopPropagation()}>
        <div className="donations-modal-sticky">
          <div className="modal-header">
            <div>
              <h2>Spendenbescheinigung anlegen</h2>
              <div className="helper donations-template-helper">Für gemeinnützige Vereine nach Anlage 3 der amtlichen Muster.</div>
            </div>
            <div className="flex gap-8">
              <button type="button" className="btn ghost donations-template-link" onClick={() => { void openOfficialTemplate() }}>
                Offizielle Muster
              </button>
              <button className="btn ghost" onClick={onClose} aria-label="Schließen">✕</button>
            </div>
          </div>

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
                <textarea className="input" rows={2} value={draft.donorAddress} onChange={(e) => update('donorAddress', e.target.value)} title="Anschrift des Zuwendenden" placeholder={'Straße Hausnummer\nPLZ Ort'} />
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
                    <input className="input" value={draft.itemDescription} onChange={(e) => update('itemDescription', e.target.value)} title="Bezeichnung der Sachzuwendung" placeholder="z. B. 1 Laptop, gebraucht" />
                  </div>
                  <div className="field">
                    <label>Zustand</label>
                    <input className="input" value={draft.itemCondition} onChange={(e) => update('itemCondition', e.target.value)} title="Zustand der Sachzuwendung" placeholder="z. B. gebraucht, funktionsfähig" />
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label>Herkunft</label>
                    <select className="input" value={draft.itemOrigin} onChange={(e) => update('itemOrigin', e.target.value as DonationReceiptDraft['itemOrigin'])} title="Herkunft der Sachzuwendung">
                      <option value="PRIVAT">Privatvermögen</option>
                      <option value="BETRIEB">Betriebsvermögen</option>
                      <option value="UNBEKANNT">Unbekannt / nicht angegeben</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Grundlage der Wertermittlung</label>
                    <input className="input" value={draft.valuationMethod} onChange={(e) => update('valuationMethod', e.target.value)} title="Grundlage der Wertermittlung" placeholder="z. B. Kaufbeleg vom 12.01.2025" />
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
            <strong>3) Verwendung / steuerbegünstigter Zweck</strong>
            <div className="helper">Die Angaben spiegeln den steuerbegünstigten Zweck und den Nachweis der Gemeinnützigkeit gemäß Anlage 3 wider.</div>
            <div className="donations-checks-grid donations-checks-grid-2col">
              <label className="donations-check donations-check-box">
                <input type="checkbox" checked={draft.waiverReimbursement} onChange={(e) => update('waiverReimbursement', e.target.checked)} />
                <span>Verzicht auf Aufwendungserstattung</span>
                <button type="button" className="donations-info-btn" onClick={(e) => { e.preventDefault(); setInfoModal('waiverReimbursement') }} aria-label="Info: Verzicht auf Aufwendungserstattung">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                </button>
              </label>
              <label className="donations-check donations-check-box">
                <input type="checkbox" checked={draft.taxExemptionConfirmed} onChange={(e) => update('taxExemptionConfirmed', e.target.checked)} />
                <span>Freistellungsbescheid / Anlage zum Körperschaftsteuerbescheid verwenden</span>
                <button type="button" className="donations-info-btn" onClick={(e) => { e.preventDefault(); setInfoModal('taxExemptionConfirmed') }} aria-label="Info: Freistellungsbescheid">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                </button>
              </label>
              <label className="donations-check donations-check-box">
                <input type="checkbox" checked={draft.statuteRequirementsConfirmed} onChange={(e) => update('statuteRequirementsConfirmed', e.target.checked)} />
                <span>Feststellung der satzungsmäßigen Voraussetzungen nach § 60a AO verwenden</span>
                <button type="button" className="donations-info-btn" onClick={(e) => { e.preventDefault(); setInfoModal('statuteRequirementsConfirmed') }} aria-label="Info: § 60a AO">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                </button>
              </label>
              <label className="donations-check donations-check-box">
                <input type="checkbox" checked={draft.directUse} onChange={(e) => update('directUse', e.target.checked)} />
                <span>Unmittelbar für den angegebenen steuerbegünstigten Zweck verwendet</span>
                <button type="button" className="donations-info-btn" onClick={(e) => { e.preventDefault(); setInfoModal('directUse') }} aria-label="Info: Unmittelbare Verwendung">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                </button>
              </label>
            </div>
            <div className="donations-checks-grid">
              <label className="donations-check donations-check-box">
                <input type="checkbox" checked={draft.noMembershipContribution} onChange={(e) => update('noMembershipContribution', e.target.checked)} />
                <span>Kein ausgeschlossener Mitgliedsbeitrag nach § 10b Abs. 1 EStG</span>
                <button type="button" className="donations-info-btn" onClick={(e) => { e.preventDefault(); setInfoModal('noMembershipContribution') }} aria-label="Info: Kein Mitgliedsbeitrag">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                </button>
              </label>
            </div>

            {infoModal && verwendungInfos[infoModal] && createPortal(
              <div className="modal-overlay" onClick={() => setInfoModal(null)}>
                <div className="modal donations-info-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                  <div className="modal-header">
                    <h3>{verwendungInfos[infoModal].title}</h3>
                    <button className="btn ghost" onClick={() => setInfoModal(null)} aria-label="Schließen">✕</button>
                  </div>
                  <p className="donations-info-modal-text">{verwendungInfos[infoModal].text}</p>
                  <div className="modal-actions">
                    <button className="btn primary" onClick={() => setInfoModal(null)}>Verstanden</button>
                  </div>
                </div>
              </div>,
              document.body
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
