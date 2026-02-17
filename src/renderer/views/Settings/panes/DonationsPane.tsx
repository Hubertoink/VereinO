import React from 'react'
import type { OrgPaneProps } from '../types'
import DonationReceiptModal, { DonationReceiptDraft } from '../../../components/modals/DonationReceiptModal'

interface DonationsDefaults {
  taxOffice: string
  taxNumber: string
  exemptionNoticeDate: string
}

function sortedDrafts(drafts: DonationReceiptDraft[]): DonationReceiptDraft[] {
  return [...drafts].sort((a, b) => String(b.receiptDate || '').localeCompare(String(a.receiptDate || '')))
}

function normalizeDraft(input: Partial<DonationReceiptDraft>): DonationReceiptDraft {
  return {
    id: String(input.id || `draft-${Date.now()}`),
    receiptType: input.receiptType === 'IN_KIND' ? 'IN_KIND' : 'MONEY',
    donorName: String(input.donorName || ''),
    donorAddress: String(input.donorAddress || ''),
    amount: Number(input.amount || 0),
    itemDescription: String(input.itemDescription || ''),
    itemCondition: String(input.itemCondition || ''),
    itemOrigin: input.itemOrigin === 'BETRIEB' || input.itemOrigin === 'UNBEKANNT' ? input.itemOrigin : 'PRIVAT',
    valuationMethod: String(input.valuationMethod || ''),
    donationDate: String(input.donationDate || ''),
    purpose: String(input.purpose || ''),
    receiptDate: String(input.receiptDate || ''),
    place: String(input.place || ''),
    waiverReimbursement: input.waiverReimbursement == null ? true : Boolean(input.waiverReimbursement),
    directUse: input.directUse == null ? true : Boolean(input.directUse),
    forwardedToOtherEntity: Boolean(input.forwardedToOtherEntity),
    forwardedRecipient: String(input.forwardedRecipient || '')
  }
}

export function DonationsPane({ notify }: OrgPaneProps) {
  const [busy, setBusy] = React.useState(false)
  const [defaults, setDefaults] = React.useState<DonationsDefaults>({
    taxOffice: '',
    taxNumber: '',
    exemptionNoticeDate: ''
  })
  const [orgDefaults, setOrgDefaults] = React.useState({
    orgName: '',
    orgAddress: '',
    cashier: '',
    orgLogoDataUrl: ''
  })
  const [drafts, setDrafts] = React.useState<DonationReceiptDraft[]>([])
  const [editingDraft, setEditingDraft] = React.useState<DonationReceiptDraft | null>(null)
  const [showModal, setShowModal] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [
          taxOffice,
          taxNumber,
          exemptionNoticeDate,
          savedDrafts,
          orgName,
          orgAddress,
          cashier,
          orgLogoDataUrl
        ] = await Promise.all([
          window.api?.settings?.get({ key: 'donation.taxOffice' }),
          window.api?.settings?.get({ key: 'donation.taxNumber' }),
          window.api?.settings?.get({ key: 'donation.exemptionNoticeDate' }),
          window.api?.settings?.get({ key: 'donation.moneyReceiptDrafts' }),
          window.api?.settings?.get({ key: 'org.name' }),
          window.api?.settings?.get({ key: 'org.address' }),
          window.api?.settings?.get({ key: 'org.cashier' }),
          window.api?.settings?.get({ key: 'org.logoDataUrl' })
        ])
        if (cancelled) return

        setDefaults({
          taxOffice: String(taxOffice?.value || ''),
          taxNumber: String(taxNumber?.value || ''),
          exemptionNoticeDate: String(exemptionNoticeDate?.value || '')
        })
        setOrgDefaults({
          orgName: String(orgName?.value || ''),
          orgAddress: String(orgAddress?.value || ''),
          cashier: String(cashier?.value || ''),
          orgLogoDataUrl: String(orgLogoDataUrl?.value || '')
        })

        const rawDrafts = Array.isArray(savedDrafts?.value) ? savedDrafts?.value : []
        const normalized = rawDrafts.map((entry) => normalizeDraft(entry as Partial<DonationReceiptDraft>))
        setDrafts(sortedDrafts(normalized))
      } catch (e: any) {
        notify('error', e?.message || String(e))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [notify])

  async function saveDefaults() {
    setBusy(true)
    try {
      await Promise.all([
        window.api?.settings?.set({ key: 'donation.taxOffice', value: defaults.taxOffice }),
        window.api?.settings?.set({ key: 'donation.taxNumber', value: defaults.taxNumber }),
        window.api?.settings?.set({ key: 'donation.exemptionNoticeDate', value: defaults.exemptionNoticeDate })
      ])
      notify('success', 'Spenden-Standards gespeichert')
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  async function persistDrafts(nextDrafts: DonationReceiptDraft[]) {
    const sorted = sortedDrafts(nextDrafts)
    setDrafts(sorted)
    await window.api?.settings?.set({ key: 'donation.moneyReceiptDrafts', value: sorted })
  }

  async function saveDraft(draft: DonationReceiptDraft) {
    const exists = drafts.some((d) => d.id === draft.id)
    const next = exists ? drafts.map((d) => (d.id === draft.id ? draft : d)) : [draft, ...drafts]
    await persistDrafts(next)
  }

  async function deleteDraft(id: string) {
    try {
      await persistDrafts(drafts.filter((d) => d.id !== id))
      notify('success', 'Entwurf gelöscht')
    } catch (e: any) {
      notify('error', e?.message || String(e))
    }
  }

  return (
    <div className="settings-pane donations-pane">
      <section className="card settings-pane-card">
        <strong>💝 Spendenbescheinigung</strong>
        <div className="helper">Assistent für Geld- und Sachzuwendungen nach § 10b EStG mit PDF- und Word-Export.</div>
      </section>

      <section className="card settings-pane-card donations-defaults">
        <strong>Standarddaten</strong>
        <div className="helper">Diese Angaben werden in neue Bescheinigungen übernommen.</div>
        <div className="row">
          <div className="field">
            <label>Finanzamt</label>
            <input className="input" value={defaults.taxOffice} onChange={(e) => setDefaults((p) => ({ ...p, taxOffice: e.target.value }))} title="Finanzamt" placeholder="z. B. Finanzamt Musterstadt" />
          </div>
          <div className="field">
            <label>Steuernummer</label>
            <input className="input" value={defaults.taxNumber} onChange={(e) => setDefaults((p) => ({ ...p, taxNumber: e.target.value }))} title="Steuernummer" placeholder="z. B. 123/456/78901" />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Datum Feststellungsbescheid (§ 60a AO)</label>
            <input className="input" type="date" value={defaults.exemptionNoticeDate} onChange={(e) => setDefaults((p) => ({ ...p, exemptionNoticeDate: e.target.value }))} title="Datum Feststellungsbescheid" />
          </div>
          <div className="field" />
        </div>
        <div className="settings-pane-actions">
          <button className="btn primary" disabled={busy} onClick={saveDefaults}>Speichern</button>
        </div>
      </section>

      <section className="card settings-pane-card donations-drafts">
        <div className="donations-drafts-header">
          <div>
            <strong>Bescheinigungen</strong>
            <div className="helper">Entwürfe speichern, später öffnen und als PDF exportieren.</div>
          </div>
          <button
            className="btn primary"
            onClick={() => {
              setEditingDraft(null)
              setShowModal(true)
            }}
          >
            + Bescheinigung anlegen
          </button>
        </div>

        {drafts.length === 0 ? (
          <div className="helper">Noch keine Entwürfe vorhanden.</div>
        ) : (
          <div className="donations-draft-list">
            {drafts.map((draft) => (
              <div key={draft.id} className="card donations-draft-item">
                <div>
                  <div className="donations-draft-title">{draft.donorName || 'Ohne Name'}</div>
                  <div className="helper">
                    {draft.receiptType === 'IN_KIND' ? 'Sachspende' : 'Geldzuwendung'} · {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(draft.amount) || 0)} · {draft.donationDate || '—'}
                  </div>
                </div>
                <div className="flex gap-8">
                  <button className="btn" onClick={() => { setEditingDraft(draft); setShowModal(true) }}>Bearbeiten</button>
                  <button className="btn danger" onClick={() => deleteDraft(draft.id)}>Löschen</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showModal && (
        <DonationReceiptModal
          notify={notify}
          defaults={{
            ...orgDefaults,
            ...defaults
          }}
          initialDraft={editingDraft}
          onClose={() => {
            setShowModal(false)
            setEditingDraft(null)
          }}
          onSaveDraft={saveDraft}
        />
      )}
    </div>
  )
}
