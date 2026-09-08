import React, { useEffect, useState } from 'react'
import FilterDropdown from '../../components/dropdowns/FilterDropdown'
import type { RendererApi } from '../../../types/api'
import type { BookingPlusRow } from './bookingPlusHelpers'

type Props = {
  kind: 'IN' | 'OUT'
  amount: string
  payload: Omit<Parameters<RendererApi['vouchers']['list']>[0], 'limit'>
  revision: number
  invalidRange: boolean
  fmtDate: (date: string) => string
  onOpenVoucher: (row: BookingPlusRow) => void
}
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export default function RecentBookingsDropdown({ kind, amount, payload, revision, invalidRange, fmtDate, onOpenVoucher }: Props) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<BookingPlusRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const label = kind === 'IN' ? 'Einnahmen' : 'Ausgaben'
  useEffect(() => {
    if (!open || invalidRange) return
    let alive = true
    setLoading(true)
    setError(false)
    setRows([])
    window.api.vouchers.list({ ...payload, type: kind, limit: 10, offset: 0, sortBy: 'date', sort: 'DESC' })
      .then(result => { if (alive) setRows(result.rows) })
      .catch(() => { if (alive) setError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open, payload, kind, revision, invalidRange, retry])
  return <FilterDropdown
    trigger={<><span>{label}</span><strong className={kind === 'IN' ? 'bp-positive' : 'bp-negative'}>{amount}</strong></>}
    title={`Letzte 10 ${label}`}
    ariaLabel={`Letzte 10 ${label} anzeigen`}
    width={430}
    alignRight
    open={open}
    onOpenChange={setOpen}
  >
    <div className="bp-recent-bookings">
      {invalidRange ? <p role="alert">Bitte einen gültigen Zeitraum wählen.</p> : loading ? <p role="status">Buchungen werden geladen …</p> : error ? <div role="alert"><p>Buchungen konnten nicht geladen werden.</p><button className="btn" onClick={() => setRetry(value => value + 1)}>Erneut versuchen</button></div> : rows.length ? <>
        <p className="bp-recent-hint">Doppelklick für Details</p>
        {rows.map(row => <button type="button" className="bp-recent-row" key={row.id}
          onDoubleClick={() => { setOpen(false); onOpenVoucher(row) }}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(false); onOpenVoucher(row) } }}
          title={row.description || row.voucherNo}>
          <time dateTime={row.date}>{fmtDate(row.date)}</time><span>{row.description || row.voucherNo}</span><strong className={kind === 'IN' ? 'bp-positive' : 'bp-negative'}>{money.format(Math.abs(row.grossAmount))}</strong>
        </button>)}
      </> : <p>Keine {label} für die aktuellen Filter gefunden.</p>}
    </div>
  </FilterDropdown>
}
