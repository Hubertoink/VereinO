import StackedMonthlyCard from './StackedMonthlyCard'
import HoverTooltip from '../../components/common/HoverTooltip'
import { DashboardRecentActivity } from '../Dashboard/DashboardView'
import DashboardInsights from './DashboardInsights'
import DashboardAssistant from './DashboardAssistant'
import React, { useEffect, useId, useState } from 'react'
import { IconArrowUpRight, IconArrowDownRight, IconBuildingBank, IconChevronRight, IconReceipt2, IconUsers, IconWallet } from '@tabler/icons-react'
import type { DashboardSnapshot } from '../../../../shared/dashboard'
import type { RendererApi } from '../../../types/api'
import { addDataChangedListener } from '../../utils/refresh'
import { buildDashboardMonths, dashboardMonths, type MonthRow } from './dashboardPlusModel'
import './dashboardPlus.css'

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const shortMonth = (key: string) => new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(new Date(`${key}-01T12:00:00`))
const longMonth = (key: string) => new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date(`${key}-01T12:00:00`))
const dateLabel = (date: string) => new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(`${date}T12:00:00`))
type Accounts = Awaited<ReturnType<RendererApi['paymentAccounts']['list']>>['rows']
type Data = { snapshot: DashboardSnapshot; months: MonthRow[]; accounts: Accounts; opening: number }
type Props = { generalProfile?: boolean; today: string; onGoToBookings: () => void; onGoToInvoices: () => void; onGoToMembers: () => void; onGoToBudgets: () => void; onGoToBindings: () => void; onGoToAI: () => void; onGoToVoucher: (args: { voucherId: number; recordDate?: string | null }) => void }

function BalanceLine({ rows }: { rows: MonthRow[] }) {
  const values = rows.map(row => row.balance)
  const id = useId().replace(/:/g, '')
  const min = Math.min(...values)
  const max = Math.max(...values)
  const points = values.map((value, index) => `${8 + index * 384 / Math.max(1, values.length - 1)},${max === min ? 76 : 122 - (value - min) / (max - min) * 100}`)
  const last = points[points.length - 1].split(',')
  return <div className="dp-balance-chart"><svg viewBox="0 0 400 145" className="dp-balance-line" role="img" aria-label="Verlauf des gebuchten Gesamtbestands an den Monatsenden">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".25" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
    <path d={`M8,145 L${points.join(' L')} L392,145 Z`} fill={`url(#${id})`} />
    <polyline points={points.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <circle cx={last[0]} cy={last[1]} r="3.5" fill="currentColor" />
  </svg><div className="dp-balance-targets">{rows.map(row => <HoverTooltip key={row.month} className="dp-tooltip" content={<><strong>{longMonth(row.month)}</strong><span>Gebuchter Bestand <b>{money.format(row.balance)}</b></span><span>Monatssaldo <b>{money.format(row.net)}</b></span></>}>{({ ref, props }) => <button type="button" ref={ref} {...props} aria-label={`${longMonth(row.month)}: Bestand ${money.format(row.balance)}`} />}</HoverTooltip>)}</div></div>
}

function ProgressRing({ value, label, caption, gauge = false }: { value: number; label: string; caption: string; gauge?: boolean }) {
  const fraction = Math.max(0, Math.min(value, 1))
  return <div className={`dp-ring${gauge ? ' dp-ring--gauge' : ''}`}>
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle className="dp-ring-track" cx="100" cy="100" r="80" pathLength="100" fill="none" strokeWidth="9" strokeDasharray={gauge ? '75 25' : undefined} transform={`rotate(${gauge ? 135 : -90} 100 100)`} />
      <circle cx="100" cy="100" r="80" pathLength="100" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${fraction * (gauge ? 75 : 100)} 100`} transform={`rotate(${gauge ? 135 : -90} 100 100)`} />
    </svg><div><strong>{label}</strong><span>{caption}</span></div>
  </div>
}

export default function DashboardPlusView({ today: initialToday, generalProfile = false, onGoToBookings, onGoToInvoices, onGoToMembers, onGoToBudgets, onGoToBindings, onGoToAI, onGoToVoucher }: Props) {
  const [today, setToday] = useState(initialToday)
  const [coverageMonth, setCoverageMonth] = useState(initialToday.slice(0, 7))
  useEffect(() => {
    const update = () => setToday(new Date().toISOString().slice(0, 10))
    const timer = window.setInterval(update, 60000)
    window.addEventListener('focus', update)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update) }
  }, [])
  const [tab, setTab] = useState<'overview' | 'activity'>('overview')
  const [range, setRange] = useState<3 | 6 | 12 | 'all'>('all')
  const [metric, setMetric] = useState<'income' | 'expense' | 'net'>('income')
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7))
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => addDataChangedListener(['vouchers', 'members', 'invoices', 'budgets', 'earmarks', 'settings', 'organizations'], () => setRevision(value => value + 1)), [])
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    Promise.all([
      window.api.reports.monthly({ to: today, type: 'IN' }),
      window.api.reports.monthly({ to: today, type: 'OUT' }),
      window.api.budgets.list({ includeArchived: true })
    ]).then(async ([income, expense, budgets]) => {
      const first = [...income.buckets.map(row => row.month), ...expense.buckets.map(row => row.month), ...budgets.rows.map(row => (row.startDate || `${row.year}-01-01`).slice(0, 7))].filter(month => month <= today.slice(0, 7)).sort()[0] || today.slice(0, 7)
      const count = (Number(today.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(first.slice(5, 7)) + 1
      const keys = dashboardMonths(today, Math.max(12, count))
      const [snapshot, accounts] = await Promise.all([
        window.api.app.dashboardSnapshot({ from: `${keys[0]}-01`, to: today, today }),
        window.api.paymentAccounts.list({ activeOnly: true })
      ])
      if (alive) setData({ snapshot, months: buildDashboardMonths(keys, income.buckets, expense.buckets, 0), accounts: accounts.rows, opening: 0 })
    }).catch(() => { if (alive) setError(true) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [today, revision])
  const months = (range === 'all' ? data?.months : data?.months.slice(-range)) || []
  const rangeLabel = range === 'all' ? 'Gesamter Zeitraum' : `${range} Monate`
  const rangeFrom = `${months[0]?.month || today.slice(0, 7)}-01`
  const selected = months.find(row => row.month === selectedMonth) || months[months.length - 1]
  const current = data?.months[data.months.length - 1]
  const previous = data?.months[data.months.length - 2]
  const total = months.reduce((sum, row) => sum + row[metric], 0)
  const maxBar = Math.max(1, ...months.flatMap(row => [Math.abs(row[metric])]))
  const heading = metric === 'income' ? 'Einnahmen' : metric === 'expense' ? 'Ausgaben' : 'Saldo'
  const selectRange = (value: 3 | 6 | 12 | 'all') => { setRange(value); setSelectedMonth(today.slice(0, 7)) }
  const snapshot = data?.snapshot
  const membershipShare = snapshot?.members.total ? snapshot.members.active / snapshot.members.total : 0
  const covered = coverageMonth === 'period' ? { income: months.reduce((sum, row) => sum + row.income, 0), expense: months.reduce((sum, row) => sum + row.expense, 0), net: months.reduce((sum, row) => sum + row.net, 0) } : data?.months.find(row => row.month === coverageMonth) || current
  const coverage = covered && covered.expense > 0 ? covered.income / covered.expense : 0
  const overdueShare = snapshot?.invoices.open.remaining ? snapshot.invoices.overdue.remaining / snapshot.invoices.open.remaining : 0

  return <section className="dashboard-plus" aria-label="Dashboard">
    <header className="dp-page-heading"><div><h1>Dashboard</h1></div>{snapshot?.organization.logoDataUrl && <img className="dp-org-logo" src={snapshot.organization.logoDataUrl} alt="Organisationslogo" />}</header>
    <div className="dp-navigation"><div className="dp-segments" role="tablist" aria-label="Dashboardansicht" onKeyDown={event => {
      const tabs = ['overview', 'activity'] as const
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(tabs.indexOf(tab) + (event.key === 'ArrowLeft' ? tabs.length - 1 : 1)) % tabs.length]
      setTab(next); document.getElementById(`dp-${next}-tab`)?.focus()
    }}>{(['overview', 'activity'] as const).map(value => <button key={value} role="tab" id={`dp-${value}-tab`} tabIndex={tab === value ? 0 : -1} aria-controls="dp-content" aria-selected={tab === value} onClick={() => setTab(value)}>{value === 'overview' ? 'Übersicht' : 'Letzte Aktionen'}</button>)}</div><div className="dp-segments dp-range" aria-label="Dashboard-Zeitraum">{([3, 6, 12, 'all'] as const).map(value => <button key={value} aria-pressed={range === value} onClick={() => selectRange(value)}>{value === 'all' ? 'Gesamt' : `${value}M`}</button>)}</div></div>
    {error ? <div className="dp-state" role="alert"><h2>Dashboard konnte nicht geladen werden</h2><p>Bitte versuche es erneut.</p><button className="btn" onClick={() => setRevision(value => value + 1)}>Erneut versuchen</button></div> : !data || !selected || !current || !snapshot ? <div className="dp-state" role="status">Dashboard wird geladen …</div> : <div id="dp-content" role="tabpanel" aria-labelledby={`dp-${tab}-tab`} aria-busy={loading}>
      {tab === 'activity' ? <DashboardRecentActivity table onGoToVoucher={onGoToVoucher} /> : <><div className="dp-grid">
        {tab === 'overview' && <article className="dp-card dp-balance"><div className="dp-card-heading"><span className="dp-icon"><IconBuildingBank size={21} /></span><h2>{generalProfile ? 'Gebuchte Mittel' : 'Vereinsmittel'}</h2><span className="dp-currency">EUR</span></div><div className="dp-balance-value"><span>Gebuchter Gesamtbestand</span><strong>{money.format(current.balance)}</strong><p>{current.net < 0 ? <IconArrowDownRight size={14} /> : <IconArrowUpRight size={14} />}{money.format(current.net)} <span>im laufenden Monat</span></p></div><BalanceLine rows={months} /><div className="dp-balance-caption">{rangeLabel} · laufender Monat bis heute</div><footer><div className="dp-account-dots">{data.accounts.slice(0, 3).map(account => <i key={account.id} title={account.name} style={{ background: account.color || 'var(--dp-accent)' }} />)}<span>{data.accounts.length} aktive Konten</span></div><button onClick={onGoToBookings}>Buchungen <IconArrowUpRight size={16} /></button></footer></article>}
        <article className="dp-card dp-monthly"><div className="dp-card-heading"><h2>Monatliche Entwicklung</h2><span className="dp-card-period">{rangeLabel}</span></div>
          <div className="dp-chart-summary"><div><strong>{money.format(total)}</strong><span>{heading} · {rangeLabel} bis heute</span></div>{tab === 'overview' && <div className="dp-metric-select">{(['income', 'expense', 'net'] as const).map(value => <button key={value} aria-pressed={metric === value} onClick={() => setMetric(value)}>{value === 'income' ? 'Einnahmen' : value === 'expense' ? 'Ausgaben' : 'Saldo'}</button>)}</div>}</div>
          <div className="dp-chart" aria-label="Monatswerte"><div className="dp-chart-grid" aria-hidden="true"><span>{money.format(maxBar)}</span><span>{money.format(maxBar / 2)}</span><span>0</span></div><div className="dp-bars" style={{ minWidth: months.length > 12 ? months.length * 46 : undefined }}>{months.map(row => <HoverTooltip key={row.month} className="dp-tooltip" content={<><strong>{longMonth(row.month)}</strong><span>Einnahmen <b>{money.format(row.income)}</b></span><span>Ausgaben <b>{money.format(row.expense)}</b></span><span>Saldo <b>{money.format(row.net)}</b></span>{row.month === today.slice(0, 7) && <small>Laufender Monat bis {dateLabel(today)}</small>}</>}>{({ ref, props }) => <button ref={ref} {...props} className={`dp-month${row.month === today.slice(0, 7) ? ' is-current' : ''}${row.month === selected.month ? ' is-selected' : ''}`} aria-pressed={row.month === selected.month} aria-label={`${longMonth(row.month)}: Einnahmen ${money.format(row.income)}, Ausgaben ${money.format(row.expense)}, Saldo ${money.format(row.net)}`} onClick={() => setSelectedMonth(row.month)}><span className="dp-bar-space">{[metric].map(value => <i key={value} className={`dp-bar dp-bar--${value}${row[value] < 0 ? ' is-negative' : ''}`} style={{ height: `${Math.abs(row[value]) / maxBar * 100}%`, minHeight: row[value] !== 0 ? 3 : 0 }} />)}</span><span className="dp-month-label">{shortMonth(row.month)}{row.month === today.slice(0, 7) ? '*' : ''}</span></button>}</HoverTooltip>)}</div></div>
          <div className="dp-chart-legend"><span><i />{heading}{metric === 'net' && tab === 'overview' ? ' · Balkenhöhe = absoluter Betrag' : ''}</span><small>* Laufender Monat bis {dateLabel(today)}</small></div>
          <div className="dp-month-caption">{longMonth(selected.month)}{selected.month === today.slice(0, 7) ? ' · bisher' : ''}</div><dl className="dp-month-facts"><div><dt>Einnahmen</dt><dd>{money.format(selected.income)}</dd></div><div><dt>Ausgaben</dt><dd>{money.format(selected.expense)}</dd></div><div><dt>Monatssaldo</dt><dd className={selected.net < 0 ? 'dp-negative' : 'dp-positive'}>{money.format(selected.net)}</dd></div></dl>
        </article>
        {tab === 'overview' && <>
          <article className="dp-card dp-coverage"><div className="dp-card-heading"><h2>Ausgaben gedeckt</h2><IconWallet size={18} /></div><select className="input dp-coverage-select" aria-label="Monat der Ausgabendeckung" value={coverageMonth} onChange={event => setCoverageMonth(event.target.value)}><option value="period">{rangeLabel}</option>{[...data.months].reverse().map(row => <option key={row.month} value={row.month}>{longMonth(row.month)}</option>)}</select><ProgressRing gauge value={coverage} label={(covered?.expense || 0) > 0 ? `${Math.round(coverage * 100)} %` : '—'} caption={(covered?.expense || 0) > 0 ? 'durch Einnahmen' : 'Keine Ausgaben'} /><p className="dp-card-note">{coverageMonth === 'period' ? rangeLabel : longMonth(coverageMonth)}{coverageMonth === today.slice(0, 7) ? ' · bisher' : ''}</p><footer><span>{coverageMonth === 'period' ? 'Zeitraumsaldo' : 'Monatssaldo'}</span><strong className={(covered?.net || 0) < 0 ? 'dp-negative' : 'dp-positive'}>{money.format((covered?.net || 0))}</strong></footer></article>
          {generalProfile ? <article className="dp-card dp-members"><div className="dp-card-heading"><h2>Konten im Überblick</h2><small>Aktuell</small><IconBuildingBank size={18} /></div><div className="dp-members-body"><ProgressRing value={data.accounts.length ? 1 : 0} label={String(data.accounts.length)} caption="aktive Konten" /><div>{data.accounts.map(account => <p key={account.id}>{account.name}</p>)}</div></div><footer><button onClick={onGoToBookings}>Buchungen ansehen ↗</button></footer></article> : <article className="dp-card dp-members"><div className="dp-card-heading"><h2>Menschen im Verein</h2><small>Aktuell</small><IconUsers size={18} /></div><div className="dp-members-body"><ProgressRing value={membershipShare} label={String(snapshot.members.active)} caption={`von ${snapshot.members.total}`} /><div><h3>Aktive Mitglieder</h3><p>{snapshot.members.new} neu · {snapshot.members.paused} pausiert</p><span>{snapshot.tasks.dueMembershipFees.dueMembers ? `${snapshot.tasks.dueMembershipFees.dueMembers} mit fälligen Beiträgen` : 'Keine fälligen Beiträge'}</span></div></div><footer><button onClick={onGoToMembers}>Mitglieder ansehen <IconArrowUpRight size={16} /></button></footer></article>}
          <article className="dp-card dp-open"><div className="dp-card-heading"><h2>Offene Posten</h2><small>Aktuell</small><IconReceipt2 size={20} /></div><strong className="dp-open-value">{money.format(snapshot.invoices.open.remaining)}</strong><p className="dp-card-note">aus {snapshot.invoices.open.count} offenen Rechnungen / Forderungen</p><div className="dp-open-track" aria-hidden="true"><i style={{ flex: snapshot.invoices.open.remaining ? 1 - overdueShare : 0 }} /><i style={{ flex: overdueShare }} /></div><div className="dp-overdue"><span>{snapshot.invoices.overdue.count} überfällig</span><strong>{money.format(snapshot.invoices.overdue.remaining)}</strong></div><p className="dp-card-note">{snapshot.invoices.dueSoon.count} in den nächsten 5 Tagen fällig</p><footer><button onClick={onGoToInvoices}>Offene Posten prüfen <IconArrowUpRight size={16} /></button></footer></article>
        </>}
      </div>
      <StackedMonthlyCard from={rangeFrom} to={today} months={months.map(row => row.month)} general={generalProfile} revision={revision} />
      <DashboardInsights from={rangeFrom} to={today} revision={revision} onBudgets={onGoToBudgets} onBindings={onGoToBindings} />
      </>}
      <DashboardAssistant context={JSON.stringify({ from: rangeFrom, to: today, months, membersAsOfToday: snapshot.members, invoicesAsOfToday: snapshot.invoices, activeBudgets: snapshot.activeBudgets })} onSetup={onGoToAI} />
      <p className="dp-footnote">Gebuchte Werte bis {dateLabel(today)}. Offene Posten sind nicht im Bestand enthalten.{previous && ` Vormonatssaldo: ${money.format(previous.net)}.`}</p>
    </div>}
  </section>
}
