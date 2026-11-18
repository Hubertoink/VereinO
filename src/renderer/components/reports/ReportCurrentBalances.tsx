import { useEffect, useState } from 'react'
import { IconBuildingBank } from '@tabler/icons-react'
import { localIsoDate } from '../../../../shared/recurrence'
import { OpeningCaption } from '../booking/AccountOpeningChart'
import { totalAccountBalance, type CashBalance, type BalanceAccount } from '../../utils/accountBalance'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const dateLabel = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' })

export default function ReportCurrentBalances({ refreshKey, paymentAccounts }: { refreshKey: number; paymentAccounts: BalanceAccount[] }) {
  const today = localIsoDate()
  const [balances, setBalances] = useState<CashBalance | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setFailed(false)
    window.api.reports.cashBalance({ to: today }).then(result => {
      if (active) setBalances(result)
    }).catch(() => {
      if (active) { setBalances(null); setFailed(true) }
    })
    return () => { active = false }
  }, [today, refreshKey, paymentAccounts, retry])

  const openings = paymentAccounts.flatMap(a => a.openingDate && a.openingDate <= today && a.openingCents
    ? [{ date: a.openingDate, amountCents: a.openingCents }] : [])
  const accounts = balances?.accounts?.filter(a => a.id !== 0 || a.balance !== 0) ?? (balances ? [
    { id: -1, name: 'Bar', balance: balances.BAR, color: null, isActive: 1 },
    { id: -2, name: 'Bank', balance: balances.BANK, color: null, isActive: 1 }
  ] : [])
  return <section className="dp-card report-current-balances" aria-label="Aktueller Kontostand">
    <div className="report-current-total">
      <div className="report-current-heading"><IconBuildingBank size={17} aria-hidden="true" /><h2>Gesamtbestand</h2></div>
      <strong>{balances ? euro.format(totalAccountBalance(balances)) : '—'}</strong>
      <span className="helper">Stand heute · {dateLabel.format(new Date(today + 'T12:00:00'))}</span>
      {balances && <OpeningCaption entries={openings} />}
    </div>
    {failed ? <div role="status">Kontostände konnten nicht geladen werden. <button className="btn" onClick={() => setRetry(n => n + 1)}>Erneut laden</button></div>
      : <dl className="report-current-accounts" aria-label="Kontostände">{accounts.map(a => <div key={a.id}>
        <dt><i style={{ backgroundColor: a.color || 'var(--text-dim)' }} />{a.id === 0 ? 'Ohne Konto' : a.name}{a.isActive === 0 && ' (archiviert)'}</dt>
        <dd>{euro.format(a.balance)}</dd>
      </div>)}</dl>}
  </section>
}
