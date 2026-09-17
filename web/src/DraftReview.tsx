import EntryAttachments from './EntryAttachments'
import React, { useEffect, useRef, useState } from 'react'
import {
  IconReceipt2,
  IconCalendar,
  IconBuildingBank,
  IconCash,
  IconArrowUp,
  IconArrowDown,
  IconTag,
  IconInfoCircle,
  IconX,
  IconUser
} from '@tabler/icons-react'
import { money, type Entry } from './api'
import { useTagOptions } from './useTagOptions'
import { getContrastTextColor, resolveTagDisplayColor } from '../../src/renderer/utils/tagColors'
import './bookingDialogs.css'
const spheres = {
  IDEELL: 'Ideeller Bereich',
  ZWECK: 'Zweckbetrieb',
  VERMOEGEN: 'Vermögensverwaltung',
  WGB: 'Wirtschaftlicher Geschäftsbetrieb'
}
export default function DraftReview({
  entry,
  busy,
  error,
  onClose,
  onApprove,
  onEdit,
  onReturn,
  onAttachmentsChanged,
  onSessionExpired
}: {
  onAttachmentsChanged?: () => void
  entry: Entry
  busy: boolean
  error: string
  onClose: () => void
  onEdit: () => void
  onApprove: () => void
  onReturn: (reason: string) => void
  onSessionExpired: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState('')
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const { tags } = useTagOptions(onSessionExpired)
  useEffect(() => {
    const dialog = ref.current
    if (!attachmentsOpen) dialog?.showModal()
    return () => dialog?.close()
  }, [attachmentsOpen])
  const type = entry.type === 'IN' ? 'Einnahme' : 'Ausgabe',
    payment = entry.paymentMethod === 'BANK' ? 'Bank' : 'Kasse',
    statusLabel = entry.status === 'SUBMITTED' ? 'Zur Prüfung eingereicht' : entry.status === 'RETURNED' ? 'Zur Korrektur zurückgegeben' : 'Entwurf'
  const classification =
    entry.primaryClassificationName || spheres[entry.sphere] || 'Keine Kategorie'
  return (
    <>
    <dialog
      ref={ref}
      className="web-draft-review"
      aria-labelledby="draft-review-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <header className="web-draft-review__header">
        <div>
          <h2 id="draft-review-title">
            <IconReceipt2 />
            Entwurf prüfen
          </h2>
          <p>Angaben prüfen und als Buchung übernehmen</p>
        </div>
        <button
          className="btn ghost booking-modal-icon-btn"
          aria-label="Schließen"
          onClick={onClose}
          disabled={busy}
        >
          <IconX />
        </button>
      </header>
      <div className="web-draft-review__body">
        <section className="card voucher-info-card voucher-info-summary">
          <div className="voucher-info-summary__main">
            <div className={`voucher-info-amount voucher-info-amount--${entry.type.toLowerCase()}`}>
              <span className="voucher-info-eyebrow">Betrag</span>
              <strong>
                <span className="voucher-info-amount__icon">
                  {entry.type === 'IN' ? <IconArrowUp /> : <IconArrowDown />}
                </span>
                {money(entry.grossAmountCents)}
              </strong>
              <span className={`badge ${entry.type.toLowerCase()}`}>{type}</span>
            </div>
            <div className="voucher-info-purpose">
              <div className="voucher-info-purpose__heading">
                <span className="voucher-info-eyebrow">Verwendungszweck</span>
                <span className="voucher-info-classification">
                  <IconTag size={14} />
                  {classification}
                </span>
              </div>
              <h3>{entry.description}</h3>
              {entry.counterparty && (
                <p>
                  <IconUser size={16} /> {entry.counterparty}
                </p>
              )}
            </div>
          </div>
          <div className="voucher-info-facts">
            <div>
              <IconCalendar />
              <span>
                <small>Datum</small>
                <strong>{entry.date.slice(0, 10)}</strong>
              </span>
            </div>
            <div>
              <IconReceipt2 />
              <span>
                <small>Status</small>
                <strong>{statusLabel}</strong>
              </span>
            </div>
            <div>
              {entry.paymentMethod === 'BANK' ? <IconBuildingBank /> : <IconCash />}
              <span>
                <small>Zahlweg</small>
                <strong>{payment}</strong>
              </span>
            </div>
          </div>
        </section>
        <section className="card voucher-info-card voucher-info-information">
          <h3 className="voucher-info-section-title">
            <IconInfoCircle size={18} />
            Entwurfsinformationen
          </h3>
          <div className="voucher-info-detail-row">
            <span>Erstellt von</span>
            <span>{entry.createdByEmail || '–'}</span>
          </div>
          <div className="voucher-info-detail-row">
            <span>{entry.primaryClassificationValueId ? 'Kategorie' : 'Sphäre'}</span>
            <span>{classification}</span>
          </div>
          <div className="voucher-info-detail-row">
            <span>Tags</span>
            <div className="web-draft-review__tags">
              {entry.tags?.length
                ? entry.tags.map((tag) => {
                    const color = resolveTagDisplayColor(tag, tags)
                    return (
                      <span
                        className="chip"
                        key={tag}
                        style={{
                          background: color || undefined,
                          color: color ? getContrastTextColor(color) : undefined
                        }}
                      >
                        {tag}
                      </span>
                    )
                  })
                : '–'}
            </div>
          </div>
          <div className="voucher-info-detail-row">
            <span>Budgets</span>
            <span>{entry.budgets?.length ? entry.budgets.map(item => `${item.label || `#${item.budgetId}`} · ${money(Math.round(item.amount * 100))}`).join(', ') : '–'}</span>
          </div>
          <div className="voucher-info-detail-row">
            <span>Zweckbindungen</span>
            <span>{entry.earmarksAssigned?.length ? entry.earmarksAssigned.map(item => `${item.code || item.name || `#${item.earmarkId}`} · ${money(Math.round(item.amount * 100))}`).join(', ') : '–'}</span>
          </div>
        </section>
        <section className="card voucher-info-card">
          <h3 className="voucher-info-section-title">Anhänge</h3>
          <button type="button" className="btn" onClick={() => setAttachmentsOpen(true)}>Anhänge ansehen / hinzufügen</button>
        </section>
        <form
          id="draft-return-form"
          className="card voucher-info-card"
          onSubmit={(event) => {
            event.preventDefault()
            if (reason.trim()) onReturn(reason.trim())
          }}
        >
          <label htmlFor="draft-return-reason">Korrekturhinweis</label>
          <textarea
            id="draft-return-reason"
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            maxLength={2000}
            rows={3}
            disabled={busy}
          />
          <p className="helper">Nur für die Rückgabe zur Korrektur erforderlich.</p>
        </form>
        <p className="muted">Mit der Freigabe wird daraus eine verbindliche Buchung.</p>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="web-draft-review__footer">
        <button className="btn" disabled={busy} onClick={onEdit}>
          Bearbeiten
        </button>
        <button className="btn" type="submit" form="draft-return-form" disabled={busy}>
          Zur Korrektur zurückgeben
        </button>
        <button className="btn primary" disabled={busy} onClick={onApprove}>
          Validieren und übernehmen
        </button>
      </footer>
    </dialog>
    {attachmentsOpen && <EntryAttachments entry={entry} kind="drafts" onChanged={onAttachmentsChanged} onSessionExpired={onSessionExpired} onClose={() => setAttachmentsOpen(false)} />}
    </>
  )
}
