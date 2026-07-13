import React, { useEffect, useMemo, useState } from 'react'
import BalanceAreaChart from './BalanceAreaChart'
import IncomeExpenseBars from './IncomeExpenseBars'
import ReportsMonthlyChart from './charts/ReportsMonthlyChart'
import ReportsCashBars from './charts/ReportsCashBars'
// EarmarksUsageBars removed to avoid duplicate tile – combined in detail card
// BudgetDeviationList (older Sphären‑Anteile donut) removed in favor of SphereShareCard
// WorkQueueCard removed (Offene Aufgaben) per dashboard simplification request
import EarmarkDetailCard from './EarmarkDetailCard'
import BudgetDetailCard from './BudgetDetailCard'
import SphereShareCard from './SphereShareCard'
// LiquidityForecastArea removed per request
import type { CommonFilters } from './types'
import { addDataChangedListener } from '../../utils/refresh'

type GoToVoucherArgs = { voucherId: number; recordDate?: string | null }
type DashboardTaskTone = 'danger' | 'warning' | 'info' | 'success'

type DashboardTaskItem = {
  key: string
  label: string
  value: string
  detail: string
  tone: DashboardTaskTone
  onClick?: () => void
}

function dayBefore(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function dashboardRange(
  period: 'MONAT' | 'JAHR' | 'DREI_JAHRE' | 'GESAMT',
  yearSel: number | null,
  years: number[],
  today: string
) {
  const now = new Date()
  const todayIso = String(today || '').slice(0, 10)
  const clampToToday = (iso: string) => (todayIso && iso > todayIso ? todayIso : iso)
  const year = ((period === 'JAHR' || period === 'DREI_JAHRE') && yearSel)
    ? yearSel
    : now.getUTCFullYear()
  if (period === 'GESAMT') {
    const minYear = years.length > 0 ? Math.min(...years) : year
    const maxYear = years.length > 0 ? Math.max(...years) : year
    return {
      from: new Date(Date.UTC(minYear, 0, 1)).toISOString().slice(0, 10),
      to: clampToToday(new Date(Date.UTC(maxYear, 11, 31)).toISOString().slice(0, 10))
    }
  }
  if (period === 'MONAT') {
    return {
      from: new Date(Date.UTC(year, now.getUTCMonth(), 1)).toISOString().slice(0, 10),
      to: clampToToday(new Date(Date.UTC(year, now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10))
    }
  }
  if (period === 'DREI_JAHRE') {
    return {
      from: new Date(Date.UTC(year - 2, 0, 1)).toISOString().slice(0, 10),
      to: clampToToday(new Date(Date.UTC(year, 11, 31)).toISOString().slice(0, 10))
    }
  }
  return {
    from: new Date(Date.UTC(year, 0, 1)).toISOString().slice(0, 10),
    to: clampToToday(new Date(Date.UTC(year, 11, 31)).toISOString().slice(0, 10))
  }
}

function buildBankImportReminder(
  status: { total: number; lastBookingDate: string | null; lastImportAt: string | null },
  today: string
) {
  const parseDate = (value?: string | null) => {
    if (!value) return null
    const [year, month, day] = value.split('-').map(Number)
    const parsed = new Date(year, month - 1, day)
    return year && month && day && !Number.isNaN(parsed.getTime()) ? parsed : null
  }
  if (status.total === 0) {
    return { summary: 'Erster Import offen', detail: 'Es wurden noch keine Bankbelege importiert.' }
  }
  const lastDate = parseDate(status.lastBookingDate)
  const todayDate = parseDate(String(today || '').slice(0, 10)) || new Date()
  const previousMonthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0)
  if (!lastDate || lastDate >= previousMonthEnd) return null
  const from = new Date(lastDate)
  from.setDate(from.getDate() + 1)
  if (from > previousMonthEnd) return null
  const dateFormat = new Intl.DateTimeFormat('de-DE')
  const monthFormat = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })
  const fromMonth = monthFormat.format(from)
  const toMonth = monthFormat.format(previousMonthEnd)
  const lastImport = status.lastImportAt
    ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' })
        .format(new Date(status.lastImportAt.replace(' ', 'T') + (status.lastImportAt.includes('T') ? '' : 'Z')))
    : '—'
  return {
    summary: fromMonth === toMonth ? `${fromMonth} fehlt` : `${fromMonth} bis ${toMonth} fehlt`,
    detail: `Letzter Import: ${lastImport} · fehlender Zeitraum: ${dateFormat.format(from)} bis ${dateFormat.format(previousMonthEnd)}`
  }
}

export default function DashboardView({
  today,
  onGoToInvoices,
  onGoToBankImport,
  onGoToMembers,
  onGoToSubmissions,
  onGoToVoucher
}: {
  today: string
  onGoToInvoices: () => void
  onGoToBankImport?: () => void
  onGoToMembers?: () => void
  onGoToSubmissions?: () => void
  onGoToVoucher?: (args: GoToVoucherArgs) => void
}) {
  const [quote, setQuote] = useState<{ text: string; author?: string; source?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [cashier, setCashier] = useState<string>('')
  const [orgLogo, setOrgLogo] = useState<string>('')
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api?.quotes.weekly?.({ date: today }).then((q) => { if (!cancelled) setQuote(q) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [today])

  const [yearsAvail, setYearsAvail] = useState<number[]>([])

  const [period, setPeriod] = useState<'MONAT' | 'JAHR' | 'DREI_JAHRE' | 'GESAMT'>(() => {
    try { return (localStorage.getItem('dashPeriod') as any) || 'JAHR' } catch { return 'JAHR' }
  })
  useEffect(() => { try { localStorage.setItem('dashPeriod', period) } catch { } }, [period])

  const [includePrevSaldo, setIncludePrevSaldo] = useState<boolean>(() => {
    try { return (localStorage.getItem('dashIncludePrevSaldo') === '1') } catch { return false }
  })
  useEffect(() => { try { localStorage.setItem('dashIncludePrevSaldo', includePrevSaldo ? '1' : '0') } catch { } }, [includePrevSaldo])

  const [yearSel, setYearSel] = useState<number | null>(null)
  useEffect(() => {
    if ((period === 'JAHR' || period === 'DREI_JAHRE') && yearsAvail.length > 0 && (yearSel == null || !yearsAvail.includes(yearSel))) {
      setYearSel(yearsAvail[0])
    }
  }, [yearsAvail, period])

  const [sum, setSum] = useState<null | { inGross: number; outGross: number; diff: number }>(null)
  const [openingSaldo, setOpeningSaldo] = useState<number>(0)
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

  const [invOpenCount, setInvOpenCount] = useState<number>(0)
  const [invOpenRemaining, setInvOpenRemaining] = useState<number>(0)
  const [invDueSoonCount, setInvDueSoonCount] = useState<number>(0)
  const [invDueSoonRemaining, setInvDueSoonRemaining] = useState<number>(0)
  const [invOverdueCount, setInvOverdueCount] = useState<number>(0)
  const [invOverdueRemaining, setInvOverdueRemaining] = useState<number>(0)
  const [invTopDue, setInvTopDue] = useState<Array<{ id: number; party: string; dueDate?: string | null; remaining: number }>>([])
  const [bankOpenCount, setBankOpenCount] = useState(0)
  const [bankImportReminder, setBankImportReminder] = useState<{ summary: string; detail: string } | null>(null)
  const [dueMembershipFees, setDueMembershipFees] = useState<{ dueMembers: number; duePeriods: number }>({ dueMembers: 0, duePeriods: 0 })
  const [pendingSubmissions, setPendingSubmissions] = useState(0)

  // Member statistics
  const [memberStats, setMemberStats] = useState<{ total: number; active: number; new: number; paused: number; left: number }>({ total: 0, active: 0, new: 0, paused: 0, left: 0 })
  
  const taskItems = useMemo<DashboardTaskItem[]>(() => {
    const items: DashboardTaskItem[] = []
    if (bankOpenCount > 0 || bankImportReminder) {
      items.push({
        key: 'bank',
        label: 'Bankimport',
        value: bankOpenCount > 0 ? String(bankOpenCount) : '!',
        detail: bankOpenCount > 0
          ? `${bankOpenCount} offene Bankbelege${bankImportReminder ? ` · ${bankImportReminder.summary}` : ''}`
          : bankImportReminder?.detail || 'Import empfohlen',
        tone: bankOpenCount > 0 ? 'danger' : 'warning',
        onClick: onGoToBankImport
      })
    }
    if (dueMembershipFees.dueMembers > 0) {
      items.push({
        key: 'members',
        label: 'Mitgliedsbeiträge',
        value: String(dueMembershipFees.dueMembers),
        detail: `${dueMembershipFees.duePeriods} fällige Periode(n)`,
        tone: 'warning',
        onClick: onGoToMembers
      })
    }
    if (invOverdueCount > 0 || invDueSoonCount > 0) {
      const overdue = invOverdueCount > 0
      items.push({
        key: 'invoices',
        label: overdue ? 'Überfällige Verbindlichkeiten' : 'Bald fällige Verbindlichkeiten',
        value: String(overdue ? invOverdueCount : invDueSoonCount),
        detail: eur.format(overdue ? invOverdueRemaining : invDueSoonRemaining),
        tone: overdue ? 'danger' : 'warning',
        onClick: onGoToInvoices
      })
    }
    if (pendingSubmissions > 0) {
      items.push({
        key: 'submissions',
        label: 'Einreichungen',
        value: String(pendingSubmissions),
        detail: 'wartet auf Prüfung',
        tone: 'info',
        onClick: onGoToSubmissions
      })
    }
    return items
  }, [bankImportReminder, bankOpenCount, dueMembershipFees, eur, invDueSoonCount, invDueSoonRemaining, invOverdueCount, invOverdueRemaining, onGoToBankImport, onGoToInvoices, onGoToMembers, onGoToSubmissions, pendingSubmissions])

  // Active Zweckbindungen (earmarks) & Budgets for dashboard cards (max 2 each, exclude ended)
  const [activeEarmarks, setActiveEarmarks] = useState<Array<{ id: number; code: string; name: string; endDate?: string | null; color?: string | null }>>([])
  const [activeBudgets, setActiveBudgets] = useState<Array<{ id: number; name?: string | null; amountPlanned: number; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; startDate?: string | null; endDate?: string | null; color?: string | null }>>([])
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const range = dashboardRange(period, yearSel, yearsAvail, today)
        const snapshot = await window.api.app.dashboardSnapshot({
          ...range,
          openingTo: includePrevSaldo && period !== 'GESAMT' ? dayBefore(range.from) : undefined,
          today: String(today || '').slice(0, 10)
        })
        if (cancelled) return
        setSum(snapshot.financial)
        setOpeningSaldo(snapshot.openingSaldo)
        setYearsAvail((current) => (
          current.length === snapshot.years.length && current.every((year, index) => year === snapshot.years[index])
            ? current
            : snapshot.years
        ))
        setCashier(snapshot.organization.cashier)
        setOrgLogo(snapshot.organization.logoDataUrl)
        setMemberStats(snapshot.members)
        setInvOpenCount(snapshot.invoices.open.count)
        setInvOpenRemaining(snapshot.invoices.open.remaining)
        setInvDueSoonCount(snapshot.invoices.dueSoon.count)
        setInvDueSoonRemaining(snapshot.invoices.dueSoon.remaining)
        setInvOverdueCount(snapshot.invoices.overdue.count)
        setInvOverdueRemaining(snapshot.invoices.overdue.remaining)
        setInvTopDue(snapshot.invoices.topDue)
        setBankOpenCount(snapshot.tasks.bankOpenCount)
        setBankImportReminder(buildBankImportReminder(snapshot.tasks.bankImportStatus, today))
        setDueMembershipFees(snapshot.tasks.dueMembershipFees)
        setPendingSubmissions(snapshot.tasks.pendingSubmissions)
        setActiveBudgets(snapshot.activeBudgets)
        setActiveEarmarks(snapshot.activeEarmarks)
      } catch {
        if (!cancelled) setSum(null)
      }
    }
    void load()
    const removeDataChangedListener = addDataChangedListener(
      ['vouchers', 'members', 'invoices', 'submissions', 'bank-imports', 'budgets', 'earmarks', 'settings', 'organizations'],
      () => { void load() }
    )
    return () => { cancelled = true; removeDataChangedListener() }
  }, [includePrevSaldo, period, today, yearSel, yearsAvail])

  return (
    <div className="card dashboard-card">
      <div className="dashboard-header">
        <div className="dashboard-header-left">
          {orgLogo && <img src={orgLogo} alt="Vereinslogo" className="dashboard-header-logo" />}
          <div>
            <div className="dashboard-title">Hallo{cashier ? ` ${cashier}` : ''}</div>
            <div className="helper">Willkommen zurück – hier ist dein Überblick.</div>
          </div>
        </div>
        <div className="dashboard-quote">
          <div className="helper">Satz der Woche</div>
          <div className="dashboard-quote-text">{loading ? '…' : (quote?.text || '—')}</div>
          <div className="helper">{quote?.author || quote?.source || ''}</div>
        </div>
      </div>
      <DashboardTaskStrip items={taskItems} />
        <div className="dashboard-grid-auto">
          <div className="dashboard-period-row card" style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5, flexShrink: 0 }}><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/></svg>
          <div className="btn-group" role="group" aria-label="Zeitraum">
              <button className={`btn ghost ${period === 'MONAT' ? 'btn-period-active' : ''}`} onClick={() => setPeriod('MONAT')}>Monat</button>
              <button className={`btn ghost ${period === 'JAHR' ? 'btn-period-active' : ''}`} onClick={() => setPeriod('JAHR')}>Jahr</button>
              <button className={`btn ghost ${period === 'DREI_JAHRE' ? 'btn-period-active' : ''}`} onClick={() => setPeriod('DREI_JAHRE')}>3 Jahre</button>
              <button className={`btn ghost ${period === 'GESAMT' ? 'btn-period-active' : ''}`} onClick={() => setPeriod('GESAMT')}>Gesamt</button>
          </div>
          {(period === 'JAHR' || period === 'DREI_JAHRE') && yearsAvail.length > 1 && (
            <select className="input" value={String((yearSel ?? yearsAvail[0]))} onChange={(e) => setYearSel(Number(e.target.value))} aria-label={period === 'DREI_JAHRE' ? 'Endjahr auswählen' : 'Jahr auswählen'}>
              {yearsAvail.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          )}

          {(period === 'MONAT' || period === 'JAHR' || period === 'DREI_JAHRE') && (
            <div className="label-row" style={{ marginLeft: 8 }} title="Wenn aktiv: Saldo startet mit dem kumulierten Saldo vor dem gewählten Zeitraum.">
              <label htmlFor="toggle-prev-saldo" className="helper" style={{ cursor: 'pointer' }}>Vorheriger Zeitraumssaldo</label>
              <input
                id="toggle-prev-saldo"
                type="checkbox"
                role="switch"
                className="toggle"
                checked={includePrevSaldo}
                onChange={(e) => setIncludePrevSaldo(e.target.checked)}
              />
            </div>
          )}
        </div>
          <div className="card card--success summary-card">
          <div className="helper">Einnahmen ({period === 'MONAT' ? 'Monat' : period === 'JAHR' ? 'Jahr' : period === 'DREI_JAHRE' ? '3 Jahre' : 'Gesamt'})</div>
            <div className="summary-value">{eur.format(sum?.inGross || 0)}</div>
        </div>
          <div className="card card--danger summary-card">
          <div className="helper">Ausgaben ({period === 'MONAT' ? 'Monat' : period === 'JAHR' ? 'Jahr' : period === 'DREI_JAHRE' ? '3 Jahre' : 'Gesamt'})</div>
            <div className="summary-value">{eur.format(sum?.outGross || 0)}</div>
        </div>
          <div className="card card--accent summary-card">
          <div className="helper">Saldo ({period === 'MONAT' ? 'Monat' : period === 'JAHR' ? 'Jahr' : period === 'DREI_JAHRE' ? '3 Jahre' : 'Gesamt'}{(includePrevSaldo && period !== 'GESAMT') ? ' inkl. Anfangsbestand' : ''})</div>
            {(() => {
              const base = (includePrevSaldo && period !== 'GESAMT') ? (openingSaldo || 0) : 0
              const val = Math.round(((sum?.diff || 0) + base) * 100) / 100
              return <div className="summary-value" style={{ color: val >= 0 ? 'var(--success)' : 'var(--danger)' }}>{eur.format(val)}</div>
            })()}
        </div>
      </div>
        <div className="card card--accent chart-card-overflow">
          <div className="chart-header-baseline">
            <div className="legend-container">
            <strong>Offene Verbindlichkeiten</strong>
          </div>
        </div>
          <div className="dashboard-grid-wide">
            <div className="card invoice-card-warning">
            <div className="helper">Offen gesamt</div>
              <div className="summary-value-overflow">{eur.format(invOpenRemaining || 0)} <span className="helper">({invOpenCount})</span></div>
          </div>
            <div className="card invoice-card-warning">
            <div className="helper">Fällig in ≤ 5 Tagen</div>
              <div className="summary-value-overflow" style={{ color: '#f9a825' }}>{eur.format(invDueSoonRemaining || 0)} <span className="helper">({invDueSoonCount})</span></div>
          </div>
            <div className="card invoice-card-danger">
            <div className="helper">Überfällig</div>
              <div className="summary-value-overflow" style={{ color: 'var(--danger)' }}>{eur.format(invOverdueRemaining || 0)} <span className="helper">({invOverdueCount})</span></div>
          </div>
        </div>
          <div className="overflow-container-mt">
          <div className="helper">Nächste Fälligkeiten</div>
          {invTopDue.length > 0 ? (
              <div className="invoice-list-container">
              {invTopDue.map((r) => {
                const onOpen = () => {
                  try { onGoToInvoices() } catch {}
                  window.setTimeout(() => { window.dispatchEvent(new CustomEvent('open-invoice-details', { detail: { id: r.id } })) }, 0)
                }
                return (
                    <div key={r.id} onClick={onOpen} title="Details öffnen" className="invoice-item-row">
                    <div style={{ color: 'var(--text-dim)' }}>{r.dueDate || '—'}</div>
                <div className="text-overflow-ellipsis">{r.party || '—'}</div>
                <div className="text-right-bold">{eur.format(r.remaining || 0)}</div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="helper" style={{ marginTop: 6 }}>—</div>
          )}
        </div>
      </div>

      {/* Mitgliederübersicht */}
      <div className="card card--accent chart-card-overflow">
        <div className="chart-header-baseline">
          <div className="legend-container">
            <strong>Mitglieder</strong>
          </div>
        </div>
        <div className="dashboard-grid-wide">
          <div className="card summary-card">
            <div className="helper">Gesamt</div>
            <div className="summary-value-overflow">{memberStats.total}</div>
          </div>
          <div className="card summary-card card--success">
            <div className="helper">Aktiv</div>
            <div className="summary-value-overflow">{memberStats.active}</div>
          </div>
          <div className="card summary-card">
            <div className="helper">Neu</div>
            <div className="summary-value-overflow">{memberStats.new}</div>
          </div>
          <div className="card summary-card">
            <div className="helper">Pause</div>
            <div className="summary-value-overflow">{memberStats.paused}</div>
          </div>
          <div className="card summary-card">
            <div className="helper">Ausgetreten</div>
            <div className="summary-value-overflow">{memberStats.left}</div>
          </div>
        </div>
      </div>

      {(() => {
        const now = new Date()
        const todayIso = String(today || '').slice(0, 10)
        const clampToToday = (iso: string) => (todayIso && iso > todayIso) ? todayIso : iso
        const y = ((period === 'JAHR' || period === 'DREI_JAHRE') && yearSel) ? yearSel : now.getUTCFullYear()
        
        // Jahresbereich für Jahres-Charts
        const yearFrom = new Date(Date.UTC(y, 0, 1)).toISOString().slice(0, 10)
        const yearTo = clampToToday(new Date(Date.UTC(y, 11, 31)).toISOString().slice(0, 10))
        const yearFilters: CommonFilters = { from: yearFrom, to: yearTo }

        // 3-Jahresbereich (für Charts)
        const threeFrom = new Date(Date.UTC(y - 2, 0, 1)).toISOString().slice(0, 10)
        const threeTo = clampToToday(new Date(Date.UTC(y, 11, 31)).toISOString().slice(0, 10))
        const threeYearFilters: CommonFilters = { from: threeFrom, to: threeTo }

        // Monatsbereich (für Tagesverlauf im Kassenstand, wenn "Monat" gewählt ist)
        const curMonthFrom = new Date(Date.UTC(y, now.getUTCMonth(), 1)).toISOString().slice(0, 10)
        const curMonthTo = clampToToday(new Date(Date.UTC(y, now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10))
        
        // Gesamtbereich über alle Jahre
        const minYear = yearsAvail.length > 0 ? Math.min(...yearsAvail) : y
        const maxYear = yearsAvail.length > 0 ? Math.max(...yearsAvail) : y
        const gesamtFrom = new Date(Date.UTC(minYear, 0, 1)).toISOString().slice(0, 10)
        const gesamtTo = clampToToday(new Date(Date.UTC(maxYear, 11, 31)).toISOString().slice(0, 10))
        
        const balanceFilters: CommonFilters = period === 'GESAMT'
          ? { from: gesamtFrom, to: gesamtTo }
          : period === 'MONAT'
            ? { from: curMonthFrom, to: curMonthTo }
            : period === 'DREI_JAHRE'
              ? threeYearFilters
              : yearFilters

        const baseSaldo = (includePrevSaldo && period !== 'GESAMT') ? (openingSaldo || 0) : 0

        return (
          <>
            <div className="dashboard-chart-stack">
              <div className="dashboard-chart-pair">
                <BalanceAreaChart {...balanceFilters} baseSaldo={baseSaldo} />
                <ReportsMonthlyChart from={balanceFilters.from} to={balanceFilters.to} baseSaldo={baseSaldo} />
              </div>
              {/* Removed Offene Aufgaben and legacy Sphären‑Anteile/Usage tiles */}
              {/* Two-column layout: Budgets (max 2) left, Zweckbindungen (max 2) right */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                <div style={{ display: 'grid', gap: 12 }}>
                  {activeBudgets.map(b => (
                    <BudgetDetailCard key={b.id} budgetId={b.id} from={balanceFilters.from} to={balanceFilters.to} />
                  ))}
                  {activeBudgets.length === 0 && <div className="card" style={{ padding: 12 }}><div className="helper">Kein aktives Budget.</div></div>}
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                  {activeEarmarks.map(em => (
                    <EarmarkDetailCard key={em.id} earmarkId={em.id} {...balanceFilters} />
                  ))}
                  {activeEarmarks.length === 0 && <div className="card" style={{ padding: 12 }}><div className="helper">Keine aktive Zweckbindung.</div></div>}
                </div>
              </div>
              <div className="dashboard-chart-secondary-grid">
                <ReportsCashBars from={balanceFilters.from} to={balanceFilters.to} />
                <SphereShareCard from={balanceFilters.from} to={balanceFilters.to} />
              </div>
              <IncomeExpenseBars {...balanceFilters} />
            </div>
          </>
        )
      })()}

      <DashboardRecentActivity onGoToVoucher={onGoToVoucher} />
    </div>
  )
}

function DashboardTaskStrip({ items }: { items: DashboardTaskItem[] }) {
  const visibleItems = items.length > 0 ? items : [{
    key: 'done',
    label: 'Alles erledigt',
    value: 'OK',
    detail: 'Keine offenen Hinweise',
    tone: 'success' as const
  }]

  return (
    <section className="dashboard-task-strip" aria-label="Heute wichtige Aufgaben">
      <div className="dashboard-task-strip__head">
        <strong>Heute wichtig</strong>
        <span className="helper">{items.length > 0 ? `${items.length} Hinweis(e)` : 'Alles ruhig'}</span>
      </div>
      <div className="dashboard-task-strip__items">
        {visibleItems.map((item) => {
          const clickable = !!item.onClick
          const content = (
            <>
              <span className={`dashboard-task-strip__badge dashboard-task-strip__badge--${item.tone}`}>{item.value}</span>
              <span className="dashboard-task-strip__text">
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </span>
            </>
          )
          return clickable ? (
            <button key={item.key} type="button" className={`dashboard-task-strip__item dashboard-task-strip__item--${item.tone}`} onClick={item.onClick}>
              {content}
            </button>
          ) : (
            <div key={item.key} className={`dashboard-task-strip__item dashboard-task-strip__item--${item.tone}`}>
              {content}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function DashboardRecentActivity({
  onGoToVoucher
}: {
  onGoToVoucher?: (args: GoToVoucherArgs) => void
}) {
  const [rows, setRows] = React.useState<Array<any>>([])
  const [loading, setLoading] = React.useState(false)
  const [earmarks, setEarmarks] = React.useState<Array<{ id: number; code: string; name: string }>>([])
  const [budgets, setBudgets] = React.useState<Array<{ id: number; name?: string | null; year: number }>>([])
  const eur = React.useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  
  React.useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        setLoading(true)
        const res = await (window as any).api?.audit?.recent?.({ limit: 20 })
        const r = (res?.rows || res || []) as any[]
        if (alive) setRows(r)
      } catch { if (alive) setRows([]) } finally { if (alive) setLoading(false) }
    }
    load()
    const onChanged = () => load()
    const removeDataChangedListener = addDataChangedListener(['vouchers', 'members', 'invoices', 'submissions', 'bank-imports', 'budgets', 'earmarks'], onChanged)
    return () => { alive = false; removeDataChangedListener() }
  }, [])
  
  // Load earmarks and budgets for lookups
  React.useEffect(() => {
    let alive = true
    const loadMeta = async () => {
      try {
        const eRes = await (window as any).api?.bindings?.list?.({})
        const bRes = await (window as any).api?.budgets?.list?.({})
        if (alive) {
          setEarmarks((eRes?.rows || []) as any[])
          setBudgets((bRes?.rows || []) as any[])
        }
      } catch {}
    }
    loadMeta()
    const onChanged = () => loadMeta()
    const removeDataChangedListener = addDataChangedListener(['budgets', 'earmarks'], onChanged)
    return () => { alive = false; removeDataChangedListener() }
  }, [])

  function describe(row: any): { title: string; details?: string; tone?: 'ok' | 'warn' | 'err' } {
    const a = String(row.action || '').toUpperCase()
    const e = String(row.entity || '').toUpperCase()
    const d = row.diff || {}
    const voucherLabel = row.voucherNo ? `#${row.voucherNo}` : (row.voucherId ? `#${row.voucherId}` : '')
    const voucherText = row.voucherDescription ? ` · ${String(row.voucherDescription).trim()}` : ''
    const bankLine = [row.bankCounterparty, row.bankPurpose].map((value: any) => String(value || '').trim()).filter(Boolean).join(' · ')
    const formatBudgetLabel = (id: any) => {
      if (!id) return '—'
      const b = budgets.find(bu => bu.id === Number(id))
      return b ? (b.name || `Budget ${b.year}`) : `#${id}`
    }
    const formatEarmarkLabel = (id: any) => {
      if (!id) return '—'
      const em = earmarks.find(item => item.id === Number(id))
      return em ? `${em.code}${em.name ? ` · ${em.name}` : ''}` : `#${id}`
    }
    const summarizeAssignments = (items: any[] | undefined, formatter: (id: any) => string, key: 'budgetId' | 'earmarkId') => {
      if (!Array.isArray(items) || items.length === 0) return '—'
      return items.map((item) => formatter(item?.[key])).filter(Boolean).join(', ')
    }
    
    // Handle batch assignments (robust to missing fields/casing)
    if (a === 'BATCH_ASSIGN_EARMARK') {
      const count = Number(d?.count || 0)
      const earmarkLabel = d?.earmarkName ? `${d.earmarkCode || ''}${d.earmarkCode ? ' · ' : ''}${d.earmarkName}` : (d?.earmarkId ? formatEarmarkLabel(d.earmarkId) : 'Zweckbindung')
      return { title: `Batchzuweisung: ${count} Buchung(en)`, details: `Zweckbindung: ${earmarkLabel}`.trim(), tone: 'ok' }
    }
    if (a === 'BATCH_ASSIGN_BUDGET') {
      const count = Number(d?.count || 0)
      const budgetLabel = d?.budgetName ? `${d.budgetName}${d?.budgetYear ? ` (${d.budgetYear})` : ''}` : (d?.budgetId ? formatBudgetLabel(d.budgetId) : 'Budget')
      return { title: `Batchzuweisung: ${count} Buchung(en)`, details: `Budget: ${budgetLabel}`.trim(), tone: 'ok' }
    }
    if (a === 'BATCH_ASSIGN_TAGS') {
      const count = Number(d?.count || 0)
      const tagsArr = Array.isArray(d?.tags) ? d.tags : []
      const tags = tagsArr
        .map((t: any) => typeof t === 'string' ? t : (t?.name || t?.label || ''))
        .filter((x: string) => x)
        .join(', ')
      return { title: `Batchzuweisung: ${count} Buchung(en)`, details: tags ? `Tags: ${tags}` : 'Tags', tone: 'ok' }
    }
    
    if (e === 'VOUCHERS' || e === 'VOUCHER') {
      if (a === 'CREATE') {
        const v = d.data || {}
        const amount = v.grossAmount ?? v.netAmount ?? 0
        const label = `${v.type || ''} ${v.paymentMethod || ''}`.trim()
          const desc = (v.description || '').trim()
          return { title: `Beleg ${label} ${eur.format(amount)} erstellt${desc ? ' · '+desc.slice(0, 80) : ''}`, details: '' }
      }
      if (a === 'UPDATE') {
        const ch = d.changes || {}
        const changes: string[] = []
        const add = (k: string, from?: any, to?: any, fmt?: (x:any)=>string) => {
          const explicit = Object.prototype.hasOwnProperty.call(ch, k)
          if (to === undefined && !explicit) return
          if (from === undefined && to === undefined) return
          const same = JSON.stringify(from) === JSON.stringify(to)
          if (same) return
          const f = fmt ? fmt(from) : (from == null ? '—' : String(from))
          const t = fmt ? fmt(to) : (to == null ? '—' : String(to))
          const nameMap: Record<string,string> = { grossAmount: 'Brutto', netAmount: 'Netto', vatRate: 'USt%', paymentMethod: 'Zahlweg', description: 'Beschreibung', date: 'Datum', sphere: 'Sphäre', type: 'Art', earmarkId: 'Zweckbindung', budgetId: 'Budget', tags: 'Tags' }
          const nm = nameMap[k] || k
          changes.push(`${nm}: ${f} → ${t}`)
        }
        add('description', d.before?.description, d.after?.description)
        add('date', d.before?.date, d.after?.date)
        add('type', d.before?.type, d.after?.type)
        add('paymentMethod', d.before?.paymentMethod, d.after?.paymentMethod)
        add('grossAmount', d.before?.grossAmount, d.after?.grossAmount, (x:any)=> eur.format(Number(x||0)))
        add('vatRate', d.before?.vatRate, d.after?.vatRate, (x:any)=> `${x ?? 0}%`)
        add('sphere', d.before?.sphere, d.after?.sphere)
        // Zweckbindung: Code anzeigen statt ID
        add('earmarkId', d.before?.earmarkId, d.after?.earmarkId, formatEarmarkLabel)
        // Budget: Name anzeigen statt ID
        add('budgetId', d.before?.budgetId, d.after?.budgetId, formatBudgetLabel)
        // Tags
        const tagsBefore = Array.isArray(d.before?.tags) ? d.before.tags : []
        const tagsAfter = Array.isArray(d.after?.tags) ? d.after.tags : (Array.isArray(ch.tags) ? ch.tags : [])
        const addedTags = tagsAfter.filter((t:string)=> !tagsBefore.includes(t))
        const removedTags = tagsBefore.filter((t:string)=> !tagsAfter.includes(t))
        if (addedTags.length) changes.push(`Tags hinzugefügt: ${addedTags.join(', ')}`)
        if (removedTags.length) changes.push(`Tags entfernt: ${removedTags.join(', ')}`)
        if (!changes.length) changes.push('Keine relevanten Änderungen')
        return { title: `Beleg #${row.entityId} geändert`, details: changes.slice(0,3).join(' · '), tone: 'ok' }
      }
      if (a === 'UPDATE_META') {
        const changes: string[] = []
        const beforeBudget = summarizeAssignments(d.before?.budgets, formatBudgetLabel, 'budgetId')
        const afterBudget = summarizeAssignments(d.after?.budgets, formatBudgetLabel, 'budgetId')
        const beforeEarmark = summarizeAssignments(d.before?.earmarks, formatEarmarkLabel, 'earmarkId')
        const afterEarmark = summarizeAssignments(d.after?.earmarks, formatEarmarkLabel, 'earmarkId')
        const beforeTags = Array.isArray(d.before?.tags) ? d.before.tags : []
        const afterTags = Array.isArray(d.after?.tags) ? d.after.tags : []
        if (beforeBudget !== afterBudget) changes.push(`Budget: ${afterBudget}`)
        if (beforeEarmark !== afterEarmark) changes.push(`Zweckbindung: ${afterEarmark}`)
        if (JSON.stringify(beforeTags) !== JSON.stringify(afterTags)) changes.push(`Tags: ${afterTags.length ? afterTags.join(', ') : '—'}`)
        if (!changes.length) {
          if (d.after?.budgetId !== undefined || d.before?.budgetId !== undefined) changes.push(`Budget: ${formatBudgetLabel(d.after?.budgetId)}`)
          if (d.after?.earmarkId !== undefined || d.before?.earmarkId !== undefined) changes.push(`Zweckbindung: ${formatEarmarkLabel(d.after?.earmarkId)}`)
        }
        const desc = String(d.after?.description || d.before?.description || '').trim()
        return {
          title: `Zuordnung für Beleg #${row.entityId} aktualisiert${desc ? ` · ${desc.slice(0, 60)}` : ''}`,
          details: changes.slice(0, 3).join(' · ') || 'Metadaten angepasst',
          tone: 'ok'
        }
      }
      if (a === 'DELETE') {
        const s = d.snapshot || {}
        return { title: `Beleg #${row.entityId} gelöscht`, details: `${eur.format(Math.abs(Number(s.grossAmount||0)))} · ${(s.description || '').slice(0, 80)}`, tone: 'err' }
      }
      if (a === 'REVERSE') {
        return { title: `Storno erstellt für Beleg #${d.originalId}`, details: 'Automatisch gegen gebucht.', tone: 'warn' }
      }
      if (a === 'CLEAR_ALL') {
        return { title: `Alle Belege gelöscht`, details: `${d.deleted || 0} Einträge entfernt`, tone: 'err' }
      }
    }
    if (e === 'BANK_TRANSACTIONS' || e === 'BANK_TRANSACTION') {
      const accountLabel = row.bankPaymentAccountName ? ` · ${row.bankPaymentAccountName}` : ''
      const bankDetails = bankLine || 'Bankumsatz'
      if (a === 'LINK') {
        const origin = String(d?.origin || '').toUpperCase()
        const title = origin === 'CREATED'
          ? `Beleg aus Bankumsatz erstellt${voucherLabel ? ` (${voucherLabel})` : ''}${voucherText}`
          : `Bankumsatz mit Beleg verknüpft${voucherLabel ? ` (${voucherLabel})` : ''}${voucherText}`
        return { title, details: `${bankDetails}${accountLabel}`, tone: 'ok' }
      }
      if (a === 'REOPEN') {
        return { title: 'Bankumsatz wieder geöffnet', details: `${bankDetails}${accountLabel}`, tone: 'warn' }
      }
      if (a === 'CHECK') {
        return { title: 'Bankumsatz als geprüft markiert', details: d?.note ? `${bankDetails} · ${d.note}` : `${bankDetails}${accountLabel}`, tone: 'ok' }
      }
    }
    if (e === 'IMPORTS' && a === 'EXECUTE') {
      return { title: `Import ausgeführt (${d.format || 'Datei'})`, details: `importiert ${d.imported || 0}, übersprungen ${d.skipped || 0}, Fehler ${d.errorCount || 0}` }
    }
    if (e === 'BANK_IMPORTS' && a === 'EXECUTE') {
      return {
        title: `Bankimport ausgeführt${d?.fileName ? ` · ${String(d.fileName).slice(0, 40)}` : ''}`,
        details: `Importiert ${d.imported || 0} · Duplikate ${d.duplicates || 0} · Fehler ${d.errorCount || 0}`,
        tone: 'ok'
      }
    }
    // Fallback
    return { title: `${a} ${e} #${row.entityId || ''}`.trim(), details: '' }
  }

  const ActionIcon = ({ kind, color }: { kind: string; color: string }) => {
    const a = String(kind || '').toUpperCase()
    const common = { width: 16, height: 16, viewBox: '0 0 24 24' } as any
    // Dedicated icon for batch assignments
    if (a.startsWith('BATCH_ASSIGN') || a === 'UPDATE_META') {
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="Batchzuweisung">
          {/* Stacked squares to indicate multiple items */}
          <rect x="4" y="4" width="10" height="10" rx="2" />
          <rect x="10" y="10" width="10" height="10" rx="2" />
          {/* Check mark */}
          <path d="M12 12l2 2 4-4" />
        </svg>
      )
    }
    if (a === 'CREATE') {
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="erstellt">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      )
    }
    if (a === 'DELETE') {
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="gelöscht">
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M6 6l1 14h10l1-14" />
          <path d="M10 10v8M14 10v8" />
        </svg>
      )
    }
    if (a === 'UPDATE') {
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="geändert">
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 3v6h-6" />
        </svg>
      )
    }
    if (a === 'LINK') {
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="verknüpft">
          <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4" />
          <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 1 0 7.07 7.07L13 19" />
        </svg>
      )
    }
    if (a === 'REOPEN') {
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="wieder geöffnet">
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 3v6h6" />
        </svg>
      )
    }
    if (a === 'EXECUTE') {
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="ausgeführt">
          <path d="M8 5v14l11-7z" />
        </svg>
      )
    }
    // default dot
    return (
      <svg {...common} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="2" />
      </svg>
    )
  }

  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="helper">Letzte Aktivitäten</div>
      {rows.length === 0 && !loading && <div className="helper">Keine Einträge.</div>}
      <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
        {rows.map((r: any) => {
          const info = describe(r)
          // Convert UTC timestamp to local time
          const tsAct = r.createdAt ? new Date(r.createdAt).toLocaleString('de-DE', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit' 
          }).replace(',', '') : '—'
          const recDateRaw = r.recordDate ? String(r.recordDate).slice(0, 10) : null
          const color = info.tone === 'err' ? 'var(--danger)' : info.tone === 'warn' ? '#f9a825' : 'var(--accent)'
          const isVoucherEntity = (String(r.entity || '').toUpperCase() === 'VOUCHERS' || String(r.entity || '').toUpperCase() === 'VOUCHER')
          const linkedVoucherId = Number(r.voucherId || r.diff?.voucherId || 0)
          const voucherIdTarget = isVoucherEntity ? Number(r.entityId) : linkedVoucherId
          const canGoToVoucher = !!onGoToVoucher && voucherIdTarget > 0 && String(r.action || '').toUpperCase() !== 'DELETE'
          return (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'baseline' }}>
              <div className="helper" style={{ whiteSpace: 'nowrap' }}>{tsAct}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                    <span className="activity-icon" aria-hidden>
                      <ActionIcon kind={String(r.action)} color={color} />
                    </span>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.title}</div>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                    {canGoToVoucher ? (
                      <button
                        type="button"
                        className="btn ghost icon-btn"
                        title="Zum Beleg"
                        aria-label="Zum Beleg"
                        onClick={() => onGoToVoucher?.({ voucherId: voucherIdTarget, recordDate: recDateRaw })}
                      >
                        ↗
                      </button>
                    ) : null}
                    {recDateRaw ? (
                      <div className="helper" style={{ whiteSpace: 'nowrap' }}>
                        Belegdatum: {recDateRaw}
                      </div>
                    ) : null}
                  </div>
                </div>
                {info.details ? <div className="helper" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.details}</div> : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
