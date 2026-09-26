import React from 'react'
import type { VoucherRow } from '../../views/Journal/types'
import './bookingTable.css'

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
export default function BookingRowDetails({ row, onOpen }: { row: VoucherRow; onOpen?: () => void }) {
  return <section className="booking-row-details" aria-label={`Buchungsdetails ${row.voucherNo}`}>
    <header><div><strong>{row.description || 'Ohne Beschreibung'}</strong><small>{row.voucherNo} · {row.date.split('-').reverse().join('.')}</small></div>{onOpen && <button type="button" className="btn" onClick={onOpen}>Vollständige Buchungsinfo</button>}</header>
    <dl><div><dt>Gegenpartei</dt><dd>{row.counterparty || '—'}</dd></div><div><dt>Zahlweg</dt><dd>{row.type === 'TRANSFER' ? `${row.transferFromAccountName || row.transferFrom || '—'} → ${row.transferToAccountName || row.transferTo || '—'}` : row.type === 'INTERNAL' ? 'Interne Umbuchung' : row.paymentAccountName || (row.paymentMethod === 'BAR' ? 'Bar' : row.paymentMethod === 'BANK' ? 'Bank' : '—')}</dd></div><div><dt>Netto / Umsatzsteuer</dt><dd>{money.format(row.netAmount)} / {money.format(row.vatAmount)}</dd></div><div><dt>Belege</dt><dd>{row.fileCount || 0} Anhänge</dd></div></dl>
    <dl><div><dt>Budgets</dt><dd>{row.budgets?.length ? row.budgets.map(b => `${b.label || `#${b.budgetId}`} (${money.format(b.amount)})`).join(' · ') : row.budgetLabel || (row.budgetId ? `#${row.budgetId}` : 'Keine Zuordnung')}</dd></div><div><dt>Zweckbindungen</dt><dd>{row.earmarksAssigned?.length ? row.earmarksAssigned.map(e => `${e.code || e.name || `#${e.earmarkId}`} (${money.format(e.amount)})`).join(' · ') : row.earmarkCode || (row.earmarkId ? `#${row.earmarkId}` : 'Keine Zuordnung')}</dd></div></dl>
    {!!row.tags?.length && <p><strong>Tags:</strong> {row.tags.join(' · ')}</p>}
    {row.note && <p className="booking-row-note"><strong>Notiz:</strong> {row.note}</p>}
    {(row.originalId || row.reversedById) && <p className="helper">{row.originalId ? `Stornobuchung zu ${row.originalVoucherNo || `#${row.originalId}`}` : `Storniert durch ${row.reversedByVoucherNo || `#${row.reversedById}`}`}</p>}
  </section>
}
