import React from 'react'
import { createPortal } from 'react-dom'
import { buildDonationReceiptHtml } from '../../../../shared/donationReceiptTemplate'
import DonationReceiptPreview from './DonationReceiptPreview'

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

const OFFICIAL_TEMPLATE_URL = 'https://ao.bundesfinanzministerium.de/esth/2019/C-Anhaenge/Anhang-37/I/inhalt.html'

export default function DonationReceiptModal({ notify, defaults, initialDraft, onClose, onSaveDraft }: DonationReceiptModalProps) {
  const [draft, setDraft] = React.useState<DonationReceiptDraft>(() => initialDraft || createEmptyDraft(defaults))
  const [busy, setBusy] = React.useState(false)
  const [submitted, setSubmitted] = React.useState(false)
  const formRef = React.useRef<HTMLDivElement>(null)
  const [infoModal, setInfoModal] = React.useState<string | null>(null)

  React.useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !busy) {
        if (infoModal) setInfoModal(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose, infoModal])

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

  const errors: Partial<Record<keyof DonationReceiptDraft, string>> = {}
  for (const [key, message] of Object.entries({
    donorName: 'Bitte den Namen des Zuwendenden eingeben.',
    donorAddress: 'Bitte die Anschrift des Zuwendenden eingeben.',
    donationDate: 'Bitte den Tag der Zuwendung angeben.',
    purpose: 'Bitte den begünstigten Zweck eingeben.',
    receiptDate: 'Bitte das Ausstellungsdatum angeben.',
    place: 'Bitte den Ort der Ausstellung eingeben.',
    signerName: 'Bitte den Unterzeichner eingeben.',
    ...(draft.receiptType === 'IN_KIND' ? {
      itemDescription: 'Bitte die Sachzuwendung bezeichnen.',
      itemCondition: 'Bitte den Zustand angeben.',
      valuationMethod: 'Bitte die Grundlage der Wertermittlung angeben.'
    } : {})
  })) {
    if (!String(draft[key as keyof DonationReceiptDraft] || '').trim()) errors[key as keyof DonationReceiptDraft] = message
  }
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) errors.amount = 'Bitte einen Betrag größer als 0 eingeben.'

  function fieldProps(key: keyof DonationReceiptDraft) {
    return { id: `donation-${key}`, 'aria-required': true,
      'aria-invalid': submitted && !!errors[key],
      'aria-describedby': submitted && errors[key] ? `donation-${key}-error` : undefined }
  }
  function fieldError(key: keyof DonationReceiptDraft) {
    return submitted && errors[key] ? <div className="helper donations-field-error" id={`donation-${key}-error`}>{errors[key]}</div> : null
  }
  function validate() {
    setSubmitted(true)
    if (!Object.keys(errors).length) return true
    requestAnimationFrame(() => {
      const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
      first?.focus()
      first?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
    return false
  }

  const payload = React.useMemo(() => ({
    ...draft, ...defaults, cashier: draft.signerName.trim(),
    orgLogoDataUrl: defaults.orgLogoDataUrl || undefined
  }), [draft, defaults])
  const previewHtml = React.useMemo(() => buildDonationReceiptHtml(payload), [payload])

  async function saveDraft() {
    if (busy || !validate()) return
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
    if (busy || !validate()) return
    setBusy(true)
    try {
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
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="donations-title" onClick={() => { if (!busy) onClose() }}>
      <div className="modal modal-wide donations-modal" onClick={(e) => e.stopPropagation()}>
        <div className="donations-modal-sticky">
          <div className="modal-header">
            <div>
              <div className="donations-title-row">
                <h2 id="donations-title">Spendenbescheinigung anlegen</h2>
                <div className="donations-type-select">
                  <select id="donation-receipt-type" aria-label="Art der Zuwendung" className="input" value={draft.receiptType}
                    disabled={busy} onChange={(event) => update('receiptType', event.target.value as DonationReceiptDraft['receiptType'])}>
                    <option value="MONEY">Geldzuwendung</option>
                    <option value="IN_KIND">Sachzuwendung</option>
                  </select>
                </div>
              </div>
              <div className="helper donations-template-helper">Für gemeinnützige Vereine nach Anlage 3 der amtlichen Muster.</div>
            </div>
            <div className="flex gap-8">
              <button type="button" className="btn ghost donations-template-link" title="Offizielle Muster im Browser öffnen" aria-label="Offizielle Muster (externer Link)" onClick={() => { void openOfficialTemplate() }}>
                Offizielle Muster
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 3h6v6M10 14 21 3" />
                  <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                </svg>
              </button>
              <button className="btn ghost" onClick={onClose} disabled={busy} aria-label="Schließen">✕</button>
            </div>
          </div>

        </div>
        <div className="donations-workspace">
        <div className="donations-modal-body" ref={formRef}>
          <section className="card donations-modal-section">
            <h3 className="donations-section-title"><span>1</span>Zuwendender</h3>
            <div className="row">
              <div className="field">
                <label htmlFor="donation-donorName">Name <span className="donations-required" aria-hidden="true">*</span></label>
                <input className="input" {...fieldProps('donorName')} value={draft.donorName} onChange={(e) => update('donorName', e.target.value)} title="Name des Zuwendenden" placeholder="Vorname Nachname" />
                {fieldError('donorName')}
              </div>
              <div className="field">
                <label htmlFor="donation-donorAddress">Anschrift <span className="donations-required" aria-hidden="true">*</span></label>
                <textarea className="input" {...fieldProps('donorAddress')} rows={2} value={draft.donorAddress} onChange={(e) => update('donorAddress', e.target.value)} title="Anschrift des Zuwendenden" placeholder={'Straße Hausnummer\nPLZ Ort'} />
                {fieldError('donorAddress')}
              </div>
            </div>
          </section>

          <section className="card donations-modal-section">
            <h3 className="donations-section-title"><span>2</span>{isMoney ? 'Geldzuwendung' : 'Sachzuwendung'}</h3>
            <div className="row">
              <div className="field">
                <label htmlFor="donation-amount">{isMoney ? 'Betrag (EUR)' : 'Wert der Sachzuwendung (EUR)'} <span className="donations-required" aria-hidden="true">*</span></label>
                <input className="input" {...fieldProps('amount')} type="number" min={0} step="0.01" value={String(draft.amount || '')} onChange={(e) => update('amount', Number(e.target.value))} title="Betrag in Euro" placeholder="0,00" />
                {fieldError('amount')}
              </div>
              <div className="field">
                <label htmlFor="donation-donationDate">Tag der Zuwendung <span className="donations-required" aria-hidden="true">*</span></label>
                <input className="input" {...fieldProps('donationDate')} type="date" value={draft.donationDate} onChange={(e) => update('donationDate', e.target.value)} title="Tag der Zuwendung" />
                {fieldError('donationDate')}
              </div>
            </div>

            {!isMoney && (
              <>
                <div className="row">
                  <div className="field">
                    <label htmlFor="donation-itemDescription">Bezeichnung der Sachzuwendung <span className="donations-required" aria-hidden="true">*</span></label>
                    <input className="input" {...fieldProps('itemDescription')} value={draft.itemDescription} onChange={(e) => update('itemDescription', e.target.value)} title="Bezeichnung der Sachzuwendung" placeholder="z. B. 1 Laptop, gebraucht" />
                {fieldError('itemDescription')}
                  </div>
                  <div className="field">
                    <label htmlFor="donation-itemCondition">Zustand <span className="donations-required" aria-hidden="true">*</span></label>
                    <input className="input" {...fieldProps('itemCondition')} value={draft.itemCondition} onChange={(e) => update('itemCondition', e.target.value)} title="Zustand der Sachzuwendung" placeholder="z. B. gebraucht, funktionsfähig" />
                {fieldError('itemCondition')}
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
                    <label htmlFor="donation-valuationMethod">Grundlage der Wertermittlung <span className="donations-required" aria-hidden="true">*</span></label>
                    <input className="input" {...fieldProps('valuationMethod')} value={draft.valuationMethod} onChange={(e) => update('valuationMethod', e.target.value)} title="Grundlage der Wertermittlung" placeholder="z. B. Kaufbeleg vom 12.01.2025" />
                {fieldError('valuationMethod')}
                  </div>
                </div>
              </>
            )}

            <div className="row">
              <div className="field">
                <label htmlFor="donation-purpose">Begünstigter Zweck <span className="donations-required" aria-hidden="true">*</span></label>
                <input className="input" {...fieldProps('purpose')} value={draft.purpose} onChange={(e) => update('purpose', e.target.value)} title="Begünstigter Zweck" placeholder="z. B. Jugendförderung" />
                {fieldError('purpose')}
              </div>
              <div className="field">
                <label htmlFor="donation-receiptDate">Ausstellungsdatum <span className="donations-required" aria-hidden="true">*</span></label>
                <input className="input" {...fieldProps('receiptDate')} type="date" value={draft.receiptDate} onChange={(e) => update('receiptDate', e.target.value)} title="Ausstellungsdatum" />
                {fieldError('receiptDate')}
              </div>
            </div>
          </section>

          <section className="card donations-modal-section">
            <h3 className="donations-section-title"><span>3</span>Verwendung / steuerbegünstigter Zweck</h3>
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
            <h3 className="donations-section-title"><span>4</span>Ort / Unterschrift</h3>
            <div className="row">
              <div className="field">
                <label htmlFor="donation-place">Ort <span className="donations-required" aria-hidden="true">*</span></label>
                <input className="input" {...fieldProps('place')} value={draft.place} onChange={(e) => update('place', e.target.value)} title="Ort der Ausstellung" placeholder="z. B. München" />
                {fieldError('place')}
              </div>
              <div className="field">
                <label htmlFor="donation-signerName">Unterzeichner (aus Organisation) <span className="donations-required" aria-hidden="true">*</span></label>
                <input className="input" {...fieldProps('signerName')} value={draft.signerName} onChange={(e) => update('signerName', e.target.value)} title="Unterzeichner" placeholder="Kassierer" />
                {fieldError('signerName')}
              </div>
            </div>
          </section>

        </div>
        <DonationReceiptPreview html={previewHtml} />
        </div>
          <div className="modal-actions-between donations-footer">
            <div className="helper">* Pflichtfelder · Die Vorschau verwendet die PDF-Vorlage.</div>
            <div className="flex gap-8">
              <button className="btn" onClick={saveDraft} disabled={busy}>Entwurf speichern</button>
              <button className="btn primary" onClick={exportPdf} disabled={busy}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                PDF exportieren
              </button>
            </div>
          </div>
      </div>
    </div>,
    document.body
  )
}
