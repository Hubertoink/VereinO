import React from 'react'
import { createPortal } from 'react-dom'
import ModalHeader from '../../components/ModalHeader'
import InvoiceActionMenu from './InvoiceActionMenu'
import type { InvoiceDetail, InvoiceStatus, InvoiceTagDef } from './types'

type Props = {
  detail: InvoiceDetail | null
  loading: boolean
  tags: InvoiceTagDef[]
  paymentAccounts?: Array<{ id: number; name: string }>
  fmtDateLocal: (value?: string) => string
  eurFmt: Intl.NumberFormat
  statusBadge: (status: InvoiceStatus) => React.ReactNode
  notify: (type: 'success' | 'error' | 'info', text: string) => void
  onClose: () => void
  onEdit: (detail: InvoiceDetail) => void
  onTagFilter: (tag: string) => void
  onDetailChange: (detail: InvoiceDetail | null) => void
}

function contrastText(bg?: string | null) {
  if (!bg) return '#000'
  const m = /^#?([0-9a-fA-F]{6})$/.exec((bg || '').trim())
  if (!m) return '#000'
  const hex = m[1]
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#000' : '#fff'
}

function renderLockIcon(color: string) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function paymentRouteLabelForKind(kind?: string | null) {
  switch (kind) {
    case 'CASH':
      return 'Bar'
    case 'BANK':
      return 'Bank'
    case 'PAYPAL':
      return 'PayPal'
    case 'CARD':
      return 'Karte'
    case 'OTHER':
      return 'Sonstiges'
    default:
      return null
  }
}

export default function InvoiceDetailModal({
  detail,
  loading,
  tags,
  paymentAccounts = [],
  fmtDateLocal,
  eurFmt,
  statusBadge,
  notify,
  onClose,
  onEdit,
  onTagFilter,
  onDetailChange
}: Props) {
  const [deleteConfirm, setDeleteConfirm] = React.useState<null | { fileId: number; fileName: string }>(null)
  const paymentAccountName = detail?.paymentAccountName
    ?? (detail?.paymentAccountId ? paymentAccounts.find((account) => account.id === detail.paymentAccountId)?.name : null)
  const paymentAccountKindLabel = paymentRouteLabelForKind(detail?.paymentAccountKind)
  const paymentMethodLabel = detail?.paymentMethod === 'BAR'
    ? 'Bar'
    : detail?.paymentMethod === 'BANK'
      ? 'Bank'
      : null
  const paymentRouteLabel = paymentAccountKindLabel || paymentAccountName || paymentMethodLabel || '-'

  async function deleteDetailFile(fileId: number) {
    if (!detail) return
    try {
      await window.api?.invoiceFiles?.delete?.({ fileId })
      const updated = await window.api?.invoices?.get?.({ id: detail.id })
      onDetailChange(updated || null)
      setDeleteConfirm(null)
      notify('success', 'Datei entfernt')
    } catch (error: any) {
      notify('error', error?.message || String(error))
    }
  }

  async function openDetailFile(fileId: number) {
    try {
      const result = await window.api?.invoiceFiles?.open?.({ fileId })
      if (!result?.ok) notify('error', 'Datei konnte nicht geöffnet werden')
    } catch (error: any) {
      notify('error', error?.message || String(error))
    }
  }

  async function saveDetailFile(fileId: number) {
    try {
      const result = await window.api?.invoiceFiles?.saveAs?.({ fileId })
      if (result?.filePath) notify('success', `Gespeichert: ${result.filePath}`)
    } catch (error: any) {
      const message = error?.message || String(error)
      if (!/Abbruch/i.test(message)) notify('error', message)
    }
  }

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal invoices-detail-grid" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860 }}>
        <div className="invoices-detail-header">
          <h2 style={{ margin: 0 }}>{detail?.voucherType === 'IN' ? 'Forderung' : 'Verbindlichkeit'} {detail?.invoiceNo ? `#${detail.invoiceNo}` : (detail ? `#${detail.id}` : '')}</h2>
          <div className="invoices-detail-header-actions">
            {detail && <InvoiceActionMenu actions={[{ label: 'Bearbeiten', onClick: () => onEdit(detail) }]} />}
            <button className="btn ghost" onClick={onClose}>×</button>
          </div>
        </div>
        {loading && <div className="helper">Lade Details...</div>}
        {!loading && detail && (
          <div className="invoices-detail-grid">
            <div className="card" style={{ padding: 12 }}>
              <div className="invoices-detail-overview">
                <div className="invoices-detail-overview-left">
                  <div style={{ fontWeight: 600 }}>{detail.party}</div>
                  <div className="helper">{detail.description || '-'}</div>
                </div>
                <div>{statusBadge(detail.status)}</div>
              </div>
              <div className="invoices-detail-info-grid">
                <div><div className="helper">Datum</div><div>{fmtDateLocal(detail.date)}</div></div>
                <div><div className="helper">Fällig</div><div>{fmtDateLocal(detail.dueDate || '')}</div></div>
                <div><div className="helper">Sphäre</div><div>{detail.sphere}</div></div>
                <div><div className="helper">Zahlweg</div><div>{paymentRouteLabel}</div></div>
                <div><div className="helper">Zahlkonto</div><div>{paymentAccountName || (detail.paymentAccountId ? `#${detail.paymentAccountId}` : '-')}</div></div>
                <div><div className="helper">Betrag</div><div>{eurFmt.format(detail.grossAmount)}</div></div>
                <div><div className="helper">Bezahlt</div><div>{eurFmt.format(detail.paidSum || 0)}</div></div>
                <div><div className="helper">Rest</div><div className={Math.max(0, Math.round((detail.grossAmount - (detail.paidSum || 0)) * 100) / 100) > 0 ? 'invoices-rest-danger' : 'invoices-rest-success'}>{eurFmt.format(Math.max(0, Math.round((detail.grossAmount - (detail.paidSum || 0)) * 100) / 100))}</div></div>
                <div><div className="helper">Auto-Buchung</div><div>{(detail.autoPost ?? 0) ? 'ja' : 'nein'}</div></div>
                <div><div className="helper">Buchungstyp</div><div>{detail.voucherType}</div></div>
                <div>
                  <div className="helper">Verknüpfte Buchung</div>
                  <div>
                    {(detail.postedVoucherNo || detail.postedVoucherId) ? (
                      <button
                        className="chip"
                        title="Zur Buchung springen"
                        onClick={() => {
                          const voucherNo = detail.postedVoucherNo || ''
                          if (voucherNo) {
                            try { window.dispatchEvent(new CustomEvent('apply-voucher-jump', { detail: { q: voucherNo } })) } catch {}
                          } else if (detail.postedVoucherId) {
                            try { window.dispatchEvent(new CustomEvent('apply-voucher-jump', { detail: { voucherId: detail.postedVoucherId } })) } catch {}
                          }
                          onClose()
                        }}
                        style={{ color: '#fff' }}
                      >
                        {detail.postedVoucherNo ? detail.postedVoucherNo : `#${detail.postedVoucherId}`}
                      </button>
                    ) : '-'}
                  </div>
                </div>
              </div>
              {((detail.budgets && detail.budgets.length > 0) || (detail.earmarks && detail.earmarks.length > 0)) && (
                <div className="invoices-detail-split" style={{ marginTop: 10 }}>
                  <div className="card" style={{ padding: 12 }}>
                    <strong>Budgets</strong>
                    <table cellPadding={6} className="invoices-table" style={{ marginTop: 6 }}>
                      <thead><tr><th align="left">Budget-ID</th><th align="right">Betrag</th></tr></thead>
                      <tbody>
                        {(detail.budgets || []).map((item, index) => <tr key={`budget-${index}`}><td>{item.budgetId}</td><td align="right">{eurFmt.format(item.amount || 0)}</td></tr>)}
                        {(detail.budgets || []).length === 0 && <tr><td colSpan={2} className="helper">Keine Budgets.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="card" style={{ padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <strong>Zweckbindungen</strong>
                      {(detail.earmarks || []).length > 0 ? <span title="Zweckbindungs-Zuordnungen">{renderLockIcon('currentColor')}</span> : null}
                    </div>
                    <table cellPadding={6} className="invoices-table" style={{ marginTop: 6 }}>
                      <thead><tr><th align="left">Zweckbindung-ID</th><th align="right">Betrag</th></tr></thead>
                      <tbody>
                        {(detail.earmarks || []).map((item, index) => <tr key={`earmark-${index}`}><td>{item.earmarkId}</td><td align="right">{eurFmt.format(item.amount || 0)}</td></tr>)}
                        {(detail.earmarks || []).length === 0 && <tr><td colSpan={2} className="helper">Keine Zweckbindungen.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {(detail.tags || []).length > 0 && (
                <div className="invoices-detail-tags">
                  {(detail.tags || []).map((tag) => {
                    const def = tags.find((tagDef) => (tagDef.name || '').toLowerCase() === (tag || '').toLowerCase())
                    const bg = def?.color || undefined
                    const fg = bg ? contrastText(bg) : undefined
                    return (
                      <button key={tag} className="chip" onClick={() => onTagFilter(tag)} title={`Nach Tag "${tag}" filtern`} style={bg ? { background: bg, color: fg, borderColor: bg } : undefined}>
                        {tag}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="invoices-detail-split">
              <div className="card" style={{ padding: 12 }}>
                <strong>Zahlungen</strong>
                <table cellPadding={6} className="invoices-table" style={{ marginTop: 6 }}>
                  <thead><tr><th align="left">Datum</th><th align="right">Betrag</th></tr></thead>
                  <tbody>
                    {(detail.payments || []).map((payment) => <tr key={payment.id}><td>{fmtDateLocal(payment.date)}</td><td align="right">{eurFmt.format(payment.amount)}</td></tr>)}
                    {detail.payments.length === 0 && <tr><td colSpan={2} className="helper">Keine Zahlungen.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="card" style={{ padding: 12 }}>
                <strong>Dateien</strong>
                <table cellPadding={6} className="invoices-table" style={{ marginTop: 6 }}>
                  <thead><tr><th align="left">Datei</th><th align="right">Größe</th><th align="left">Datum</th><th align="center">Aktion</th></tr></thead>
                  <tbody>
                    {(detail.files || []).map((file) => {
                      const sizeMB = file.size != null ? Number(file.size) / 1024 / 1024 : null
                      return (
                        <tr key={file.id}>
                          <td title={file.fileName}>
                            <span style={{ display: 'block', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {file.fileName}
                            </span>
                          </td>
                          <td align="right">{sizeMB != null ? `${sizeMB >= 0.01 ? sizeMB.toFixed(2) : sizeMB.toFixed(4)} MB` : '-'}</td>
                          <td>{file.createdAt || '-'}</td>
                          <td align="center">
                            <InvoiceActionMenu
                              actions={[
                                { label: 'Öffnen', onClick: () => void openDetailFile(file.id) },
                                { label: 'Speichern...', onClick: () => void saveDetailFile(file.id) },
                                { label: 'Entfernen', tone: 'danger', onClick: () => setDeleteConfirm({ fileId: file.id, fileName: file.fileName }) }
                              ]}
                            />
                          </td>
                        </tr>
                      )
                    })}
                    {detail.files.length === 0 && <tr><td colSpan={4} className="helper">Keine Dateien.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="invoices-detail-footer">
              <button className="btn" onClick={onClose}>Schließen</button>
            </div>
          </div>
        )}
      </div>
      {deleteConfirm && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
            <ModalHeader title="Datei entfernen" subtitle={deleteConfirm.fileName} onClose={() => setDeleteConfirm(null)} />
            <div>Diese Datei wirklich aus der Verbindlichkeit entfernen?</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
              <button className="btn danger" onClick={() => void deleteDetailFile(deleteConfirm.fileId)}>Ja, entfernen</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
