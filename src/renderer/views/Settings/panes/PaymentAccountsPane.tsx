import { cleanIpcErrorMessage } from '../../../../../shared/ipcError'
import { SettingsPageHeader } from '../components/SettingsPageHeader'
import ModalHeader from '../../../components/ModalHeader'
import MasterDataDialog, { FieldLabel } from '../../../components/common/MasterDataDialog'
import ColorField from '../../../components/common/ColorField'
import AccountOpeningFields from '../../../components/common/AccountOpeningFields'
import { openingDraft, openingLabel, openingHint, parseOpening, type OpeningDraft } from '../../../utils/accountOpening'
import React from 'react'
import { createPortal } from 'react-dom'
import { IconPencil, IconPlus, IconUser, IconBuildingBank, IconCreditCard, IconListNumbers, IconCircleDot } from '@tabler/icons-react'
import { PaymentAccountsPaneProps } from '../types'
import { IconTrash } from '../../../utils/icons'
import AppIcon from '../../../components/common/AppIcon'

type PaymentAccountDraft = {
  id?: number
  name: string
  kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'
  iban?: string | null
  color?: string | null
  sortOrder: number
  opening: OpeningDraft
  previousOpening?: OpeningDraft
  openingVoucherNo?: string
  preview?: Awaited<ReturnType<typeof window.api.paymentAccounts.previewOpeningVoucher>>
  isActive: boolean
}

const KIND_LABELS: Record<PaymentAccountDraft['kind'], string> = {
  CASH: 'Kasse',
  BANK: 'Bank',
  PAYPAL: 'PayPal',
  CARD: 'Karte',
  OTHER: 'Sonstiges'
}

function emptyDraft(sortOrder: number): PaymentAccountDraft {
  return {
    name: '',
    kind: 'BANK',
    iban: '',
    color: null,
    sortOrder,
    isActive: true,
    opening: openingDraft({}),
  }
}

export function PaymentAccountsPane({ paymentAccounts, setPaymentAccounts, notify, bumpDataVersion }: PaymentAccountsPaneProps) {
  const [draft, setDraft] = React.useState<PaymentAccountDraft | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [deleteConfirm, setDeleteConfirm] = React.useState<{ id: number; name: string } | null>(null)
  const [saving, setSaving] = React.useState(false)
  const fieldId = React.useId()

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
      notify('error', cleanIpcErrorMessage(e?.message || String(e)))
    } finally {
      setBusy(false)
    }
  }, [notify, setPaymentAccounts])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const closeDraft = () => setDraft(null)

  const saveDraft = async () => {
    if (!draft || saving) return
    if (!draft.name.trim()) {
      notify('error', 'Bitte gib einen Kontonamen ein.')
      return
    }
    setSaving(true)
    try {
      const voucherNo = draft.openingVoucherNo?.trim()
      if (voucherNo && draft.id && !draft.preview) {
        const preview = await window.api.paymentAccounts.previewOpeningVoucher({ accountId: draft.id, voucherNo })
        setDraft(current => current?.id === draft.id && current?.openingVoucherNo?.trim() === voucherNo ? { ...current, preview } : current)
        return
      }
      await window.api.paymentAccounts.upsert({
        id: draft.id,
        opening: draft.preview ? { date: draft.preview.date, amountCents: draft.preview.amountCents } : parseOpening(draft.opening),
        previousOpening: draft.previousOpening ? parseOpening(draft.previousOpening) : null,
        openingVoucherNo: voucherNo || undefined,
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
      if (draft.preview) setDraft(current => current && { ...current, preview: undefined })
      notify('error', cleanIpcErrorMessage(e?.message || String(e)))
    } finally { setSaving(false) }
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
      notify('error', cleanIpcErrorMessage(e?.message || String(e)))
    }
  }

  return (
    <div className="settings-page settings-records-pane payment-accounts-pane">
      <SettingsPageHeader title="Zahlungskonten" count={paymentAccounts.length} description="Verwalte Barkasse, Bankkonto, PayPal und weitere Geldkonten für Buchungen und Transfers." meta="Für diese Organisation" actions={<button className="btn primary" onClick={() => setDraft(emptyDraft(sortedAccounts.length + 1))}>+ Neues Konto</button>} />

      <div className="payment-account-grid settings-record-list">
        {sortedAccounts.map((account, index) => (
          <div
            key={account.id}
            className="payment-account-card settings-record-row"
            style={{
              '--account-color': account.color || 'var(--border)',
              '--account-background': account.color ? `${account.color}20` : 'var(--muted)'
            } as React.CSSProperties}
          >
            <span className="settings-record-color" style={{ background: account.color || 'var(--border)' }} title={account.color || 'Keine Farbe'} />
            <div className="payment-account-card__details">
              <div className="payment-account-card__heading">
                <span className="payment-account-card__name" title={account.name}>{account.name}</span>
                {account.bookingCount != null && <span className="payment-account-card__usage" title="Zugeordnete Buchungen einschließlich Umbuchungen">
                  {account.bookingCount.toLocaleString('de-DE')} {account.bookingCount === 1 ? 'Buchung' : 'Buchungen'}
                </span>}
              </div>
              {account.openingDate && <div className="helper">{openingLabel(account)}</div>}
              <div className="helper">{KIND_LABELS[account.kind]}{account.iban ? ` · ${account.iban}` : ''}</div>
              {!account.isActive && <span className="payment-account-card__archived">Archiviert</span>}
            </div>
            <span className="chip payment-account-card__number">#{index + 1}</span>
            <div className="payment-account-card__actions">
              <button className="btn btn-edit" onClick={() => setDraft({ id: account.id, opening: openingDraft(account), previousOpening: openingDraft(account), name: account.name, kind: account.kind, iban: account.iban || '', color: account.color || null, sortOrder: Math.max(1, account.sortOrder || index + 1), isActive: account.isActive !== 0 })} title="Bearbeiten" aria-label={`${account.name} bearbeiten`}>
                <AppIcon icon={IconPencil} size="control" />
              </button>
              <button className="btn ghost btn-trash" onClick={() => {
                if ((account.bookingCount ?? 0) > 0) {
                  notify('info', `„${account.name}“ kann nicht gelöscht werden, weil dem Konto Buchungen zugeordnet sind. Du kannst es unter „Bearbeiten“ stattdessen archivieren.`)
                  return
                }
                setDeleteConfirm({ id: account.id, name: account.name })
              }} title="Löschen" aria-label={`${account.name} löschen`}>
                <IconTrash size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {!busy && sortedAccounts.length === 0 && <div className="settings-empty">Noch keine Zahlungskonten vorhanden. Lege dein erstes Konto mit dem Button oben an.</div>}
      {busy && <div className="helper">Lade Konten…</div>}

      {draft && <MasterDataDialog title={draft.id ? 'Konto bearbeiten' : 'Konto anlegen'} subtitle={draft.id ? 'Passe die wichtigsten Informationen zu diesem Konto an.' : 'Lege ein neues Konto an und hinterlege die wichtigsten Informationen.'} icon={draft.id ? <IconPencil size={22} /> : <IconPlus size={22} />} onClose={closeDraft} onSave={saveDraft} busy={saving} saveLabel={draft.openingVoucherNo?.trim() ? (draft.preview ? 'Anfangsbuchung übernehmen' : 'Beleg prüfen') : 'Speichern'} canSave={!!draft.name.trim()}>
        <div className="dialog-form-grid">
          <div className="field"><FieldLabel htmlFor={`${fieldId}-name`} icon={<IconUser size={15} />} required>Name</FieldLabel><input id={`${fieldId}-name`} className="input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="z. B. Hauptkonto" required autoFocus /></div>
          <div className="field"><FieldLabel htmlFor={`${fieldId}-kind`} icon={<IconBuildingBank size={15} />} required>Typ</FieldLabel><select id={`${fieldId}-kind`} className="input" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as PaymentAccountDraft['kind'] })} required>{Object.entries(KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          <div className="field"><FieldLabel htmlFor={`${fieldId}-iban`} icon={<IconCreditCard size={15} />}>IBAN</FieldLabel><input id={`${fieldId}-iban`} className="input" value={draft.iban || ''} onChange={e => setDraft({ ...draft, iban: e.target.value })} placeholder="z. B. DE12 3456 7890 1234 5678 90" /></div>
          <div className="field"><FieldLabel htmlFor={`${fieldId}-order`} icon={<IconListNumbers size={15} />}>Reihenfolge</FieldLabel><input id={`${fieldId}-order`} className="input" type="number" min="1" value={draft.sortOrder} onChange={e => setDraft({ ...draft, sortOrder: Math.max(1, Number(e.target.value || 1)) })} aria-describedby={`${fieldId}-order-hint`} /><div id={`${fieldId}-order-hint`} className="helper">1 = zuerst in der Auswahlliste</div></div>
        </div>
        <div className="dialog-form-section">
          <AccountOpeningFields readOnly={!!draft.openingVoucherNo?.trim()} value={draft.preview ? openingDraft({ openingDate: draft.preview.date, openingCents: draft.preview.amountCents }) : draft.opening} onChange={opening => setDraft({ ...draft, opening })} />
          <p className="helper">{openingHint}</p>
          {draft.id && !draft.previousOpening?.amount && <details><summary>Bestehende Anfangsbuchung übernehmen</summary>
            <p className="helper">Gib die Belegnummer ein und wähle „Beleg prüfen“. VereinO liest Betrag und Stichtag aus der Buchung.</p>
            <label className="field">Belegnummer<input className="input" value={draft.openingVoucherNo || ''} onChange={e => setDraft({ ...draft, openingVoucherNo: e.target.value, preview: undefined })} /></label>
            {draft.preview && <p className="helper" role="status"><strong>{draft.preview.description || 'Buchung ohne Beschreibung'}</strong><br />{openingLabel({ openingDate: draft.preview.date, openingCents: draft.preview.amountCents })}<br />Mit der Übernahme ersetzt dieser Anfangsbestand die Buchung. Die Einnahmen oder Ausgaben im damaligen Zeitraum ändern sich entsprechend.</p>}
          </details>}
        </div>
        <div className="dialog-form-section dialog-account-meta">
          <div className="field"><FieldLabel htmlFor={`${fieldId}-status`} icon={<IconCircleDot size={15} />}>Status</FieldLabel><span className={`dialog-status-select ${draft.isActive ? 'is-active' : ''}`}><select id={`${fieldId}-status`} className="input" value={draft.isActive ? '1' : '0'} onChange={e => setDraft({ ...draft, isActive: e.target.value === '1' })}><option value="1">Aktiv</option><option value="0">Archiviert</option></select></span></div>
          <ColorField value={draft.color} onChange={color => setDraft({ ...draft, color })} />
        </div>
      </MasterDataDialog>}

      {deleteConfirm && createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteConfirm(null)}>
          <div className="modal modal-inset-header" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, display: 'grid', gap: 12 }}>
            <ModalHeader
              title="Konto löschen"
              onClose={() => setDeleteConfirm(null)}
              closeLabel="Schließen"
              closeOnEscape={false}
            />
            <div className="helper">Möchtest du das Konto <strong>{deleteConfirm.name}</strong> wirklich löschen?</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
              <button className="btn danger" onClick={() => { void deleteAccount() }}>Löschen</button>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  )
}
