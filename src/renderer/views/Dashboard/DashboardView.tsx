import React, { useCallback, useEffect, useMemo, useState } from 'react'
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

export default function DashboardView({ today, onGoToInvoices }: { today: string; onGoToInvoices: () => void }) {
  const [quote, setQuote] = useState<{ text: string; author?: string; source?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [cashier, setCashier] = useState<string>('')
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api?.quotes.weekly?.({ date: today }).then((q) => { if (!cancelled) setQuote(q) }).finally(() => { if (!cancelled) setLoading(false) })
    const load = async () => {
      try {
        const cn = await (window as any).api?.settings?.get?.({ key: 'org.cashier' })
        if (!cancelled) setCashier((cn?.value as any) || '')
      } catch { }
    }
    load()
    const onChanged = () => load()
    window.addEventListener('data-changed', onChanged)
    return () => { cancelled = true; window.removeEventListener('data-changed', onChanged) }
  }, [today])

  const [yearsAvail, setYearsAvail] = useState<number[]>([])
  useEffect(() => {
    let cancelled = false
    window.api?.reports.years?.().then(res => { if (!cancelled && res?.years) setYearsAvail(res.years) })
    const onChanged = () => { window.api?.reports.years?.().then(res => { if (!cancelled && res?.years) setYearsAvail(res.years) }) }
    window.addEventListener('data-changed', onChanged)
    return () => { cancelled = true; window.removeEventListener('data-changed', onChanged) }
  }, [])

  const [period, setPeriod] = useState<'MONAT' | 'JAHR' | 'GESAMT'>(() => {
    try { return (localStorage.getItem('dashPeriod') as any) || 'JAHR' } catch { return 'JAHR' }
  })
  useEffect(() => { try { localStorage.setItem('dashPeriod', period) } catch { } }, [period])
  const [yearSel, setYearSel] = useState<number | null>(null)
  useEffect(() => {
    if (period === 'JAHR' && yearsAvail.length > 0 && (yearSel == null || !yearsAvail.includes(yearSel))) {
      setYearSel(yearsAvail[0])
    }
  }, [yearsAvail, period])

  const [sum, setSum] = useState<null | { inGross: number; outGross: number; diff: number }>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    const onDataChanged = () => setRefreshKey((k) => k + 1)
    window.addEventListener('data-changed', onDataChanged)
    return () => window.removeEventListener('data-changed', onDataChanged)
  }, [])
  useEffect(() => {
    let cancelled = false
    const now = new Date()
    const y = (period === 'JAHR' && yearSel) ? yearSel : now.getUTCFullYear()
    
    let from: string, to: string
    if (period === 'GESAMT') {
      // Gesamtlaufzeit: vom ersten bis zum letzten verfügbaren Jahr
      const minYear = yearsAvail.length > 0 ? Math.min(...yearsAvail) : y
      const maxYear = yearsAvail.length > 0 ? Math.max(...yearsAvail) : y
      from = new Date(Date.UTC(minYear, 0, 1)).toISOString().slice(0, 10)
      to = new Date(Date.UTC(maxYear, 11, 31)).toISOString().slice(0, 10)
    } else if (period === 'MONAT') {
      from = new Date(Date.UTC(y, now.getUTCMonth(), 1)).toISOString().slice(0, 10)
      to = new Date(Date.UTC(y, now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
    } else {
      // JAHR
      from = new Date(Date.UTC(y, 0, 1)).toISOString().slice(0, 10)
      to = new Date(Date.UTC(y, 11, 31)).toISOString().slice(0, 10)
    }
    
    window.api?.reports.summary?.({ from, to }).then(res => {
      if (cancelled || !res) return
      const inGross = res.byType.find(x => x.key === 'IN')?.gross || 0
      const outGrossRaw = res.byType.find(x => x.key === 'OUT')?.gross || 0
      const outGross = Math.abs(outGrossRaw)
      const diff = Math.round((inGross - outGross) * 100) / 100
      setSum({ inGross, outGross, diff })
    })
    return () => { cancelled = true }
  }, [period, yearSel, refreshKey, yearsAvail])
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

  const [invOpenCount, setInvOpenCount] = useState<number>(0)
  const [invOpenRemaining, setInvOpenRemaining] = useState<number>(0)
  const [invDueSoonCount, setInvDueSoonCount] = useState<number>(0)
  const [invDueSoonRemaining, setInvDueSoonRemaining] = useState<number>(0)
  const [invOverdueCount, setInvOverdueCount] = useState<number>(0)
  const [invOverdueRemaining, setInvOverdueRemaining] = useState<number>(0)
  const [invTopDue, setInvTopDue] = useState<Array<{ id: number; party: string; dueDate?: string | null; remaining: number }>>([])

  const loadInvoiceTiles = useCallback(async () => {
    try {
      const now = new Date()
      const isoToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10)
      const plus5 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 5)).toISOString().slice(0, 10)
      const yday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString().slice(0, 10)
      const sumTwo = (a: any, b: any) => ({ count: (a?.count || 0) + (b?.count || 0), remaining: (a?.remaining || 0) + (b?.remaining || 0) })
      const sOpen = await (window as any).api?.invoices?.summary?.({ status: 'OPEN' })
      const sPart = await (window as any).api?.invoices?.summary?.({ status: 'PARTIAL' })
      const openTot = sumTwo(sOpen, sPart)
      setInvOpenCount(openTot.count)
      setInvOpenRemaining(openTot.remaining)
      const sSoonOpen = await (window as any).api?.invoices?.summary?.({ status: 'OPEN', dueFrom: isoToday, dueTo: plus5 })
      const sSoonPart = await (window as any).api?.invoices?.summary?.({ status: 'PARTIAL', dueFrom: isoToday, dueTo: plus5 })
      const soonTot = sumTwo(sSoonOpen, sSoonPart)
      setInvDueSoonCount(soonTot.count)
      setInvDueSoonRemaining(soonTot.remaining)
      const sOverOpen = await (window as any).api?.invoices?.summary?.({ status: 'OPEN', dueTo: yday })
      const sOverPart = await (window as any).api?.invoices?.summary?.({ status: 'PARTIAL', dueTo: yday })
      const overTot = sumTwo(sOverOpen, sOverPart)
      setInvOverdueCount(overTot.count)
      setInvOverdueRemaining(overTot.remaining)
      const listOpen = await (window as any).api?.invoices?.list?.({ limit: 5, offset: 0, sort: 'ASC', sortBy: 'due', status: 'OPEN', dueFrom: isoToday, dueTo: plus5 })
      const listPart = await (window as any).api?.invoices?.list?.({ limit: 5, offset: 0, sort: 'ASC', sortBy: 'due', status: 'PARTIAL', dueFrom: isoToday, dueTo: plus5 })
      const mergedRaw = [ ...(listOpen?.rows || []), ...(listPart?.rows || []) ]
        .filter((r: any) => !!r && !!r.dueDate)
        .sort((a: any, b: any) => String(a.dueDate).localeCompare(String(b.dueDate)))
      const uniq: Map<number, any> = new Map()
      for (const r of mergedRaw) { if (r && typeof r.id === 'number' && !uniq.has(r.id)) uniq.set(r.id, r) }
      const merged = Array.from(uniq.values()).slice(0, 5)
        .map((r: any) => ({ id: r.id, party: r.party, dueDate: r.dueDate, remaining: Math.max(0, Math.round(((Number(r.grossAmount || 0) - Number(r.paidSum || 0)) || 0) * 100) / 100) }))
      setInvTopDue(merged)
    } catch {}
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => { if (alive) await loadInvoiceTiles() })()
    const onChanged = () => loadInvoiceTiles()
    window.addEventListener('data-changed', onChanged)
    return () => { alive = false; window.removeEventListener('data-changed', onChanged) }
  }, [loadInvoiceTiles])

  // Active Zweckbindungen (earmarks) & Budgets for dashboard cards (max 2 each, exclude ended)
  const [activeEarmarks, setActiveEarmarks] = useState<Array<{ id: number; code: string; name: string; endDate?: string | null; color?: string | null }>>([])
  const [activeBudgets, setActiveBudgets] = useState<Array<{ id: number; name?: string | null; amountPlanned: number; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; startDate?: string | null; endDate?: string | null; color?: string | null }>>([])
  useEffect(() => {
    let alive = true
  const todayIso = new Date().toISOString().slice(0,10)
    const load = async () => {
      try {
        const earmarkRes = await (window as any).api?.bindings?.list?.({ activeOnly: true })
        const rawEarmarks = (earmarkRes?.rows || []) as Array<any>
        const filteredEarmarks = rawEarmarks
          .filter(e => {
            const sd = e.startDate ? String(e.startDate) : null
            const ed = e.endDate ? String(e.endDate) : null
            const startedOk = !sd || sd <= todayIso
            const notEnded = !ed || ed >= todayIso
            return startedOk && notEnded
          })
          .sort((a,b)=>{
            const ae = a.endDate ? String(a.endDate) : '9999-12-31'
            const be = b.endDate ? String(b.endDate) : '9999-12-31'
            return ae.localeCompare(be)
          })
          .slice(0,2)
        if (alive) setActiveEarmarks(filteredEarmarks.map(e => ({ id: e.id, code: e.code, name: e.name, endDate: e.endDate || null, color: e.color || null })))
      } catch { if (alive) setActiveEarmarks([]) }
      try {
        const budgetRes = await (window as any).api?.budgets?.list?.({})
        const rawBudgets = (budgetRes?.rows || []) as Array<any>
        const filteredBudgets = rawBudgets
          .filter(b => {
            const sd = b.startDate ? String(b.startDate) : null
            const ed = b.endDate ? String(b.endDate) : null
            const startedOk = !sd || sd <= todayIso
            const notEnded = !ed || ed >= todayIso
            return startedOk && notEnded
          })
          .sort((a,b)=>{
            const ae = a.endDate ? String(a.endDate) : '9999-12-31'
            const be = b.endDate ? String(b.endDate) : '9999-12-31'
            return ae.localeCompare(be)
          })
          .slice(0,2)
        if (alive) setActiveBudgets(filteredBudgets.map(b => ({ id: b.id, name: b.name || null, amountPlanned: b.amountPlanned || 0, sphere: b.sphere, startDate: b.startDate || null, endDate: b.endDate || null, color: b.color || null })))
      } catch { if (alive) setActiveBudgets([]) }
    }
    load()
    const onChanged = () => load()
    window.addEventListener('data-changed', onChanged)
    return () => { alive = false; window.removeEventListener('data-changed', onChanged) }
  }, [])

  return (
    <div className="card dashboard-card">
      <div className="dashboard-header">
        <div>
          <div className="dashboard-title">Hallo{cashier ? ` ${cashier}` : ''}</div>
          <div className="helper">Willkommen zurück – hier ist dein Überblick.</div>
        </div>
        <div className="dashboard-quote">
          <div className="helper">Satz der Woche</div>
          <div className="dashboard-quote-text">{loading ? '…' : (quote?.text || '—')}</div>
          <div className="helper">{quote?.author || quote?.source || ''}</div>
        </div>
      </div>
        <div className="dashboard-grid-auto">
          <div className="dashboard-period-row">
          <div className="btn-group" role="group" aria-label="Zeitraum">
              <button className={`btn ghost ${period === 'MONAT' ? 'btn-period-active' : ''}`} onClick={() => setPeriod('MONAT')}>Monat</button>
              <button className={`btn ghost ${period === 'JAHR' ? 'btn-period-active' : ''}`} onClick={() => setPeriod('JAHR')}>Jahr</button>
              <button className={`btn ghost ${period === 'GESAMT' ? 'btn-period-active' : ''}`} onClick={() => setPeriod('GESAMT')}>Gesamt</button>
          </div>
          {period === 'JAHR' && yearsAvail.length > 1 && (
            <select className="input" value={String((yearSel ?? yearsAvail[0]))} onChange={(e) => setYearSel(Number(e.target.value))} aria-label="Jahr auswählen">
              {yearsAvail.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          )}
        </div>
          <div className="card card--success summary-card">
          <div className="helper">Einnahmen ({period === 'MONAT' ? 'Monat' : period === 'JAHR' ? 'Jahr' : 'Gesamt'})</div>
            <div className="summary-value">{eur.format(sum?.inGross || 0)}</div>
        </div>
          <div className="card card--danger summary-card">
          <div className="helper">Ausgaben ({period === 'MONAT' ? 'Monat' : period === 'JAHR' ? 'Jahr' : 'Gesamt'})</div>
            <div className="summary-value">{eur.format(sum?.outGross || 0)}</div>
        </div>
          <div className="card card--accent summary-card">
          <div className="helper">Saldo ({period === 'MONAT' ? 'Monat' : period === 'JAHR' ? 'Jahr' : 'Gesamt'})</div>
            <div className="summary-value" style={{ color: (sum && sum.diff >= 0) ? 'var(--success)' : 'var(--danger)' }}>{eur.format(sum?.diff || 0)}</div>
        </div>
      </div>
        <div className="card card--accent chart-card-overflow">
          <div className="chart-header-baseline">
            <div className="legend-container">
            <strong>Offene Rechnungen</strong>
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

      {(() => {
        const now = new Date()
        const y = (period === 'JAHR' && yearSel) ? yearSel : now.getUTCFullYear()
        
        // Jahresbereich für Jahres-Charts
        const yearFrom = new Date(Date.UTC(y, 0, 1)).toISOString().slice(0, 10)
        const yearTo = new Date(Date.UTC(y, 11, 31)).toISOString().slice(0, 10)
        const yearFilters: CommonFilters = { from: yearFrom, to: yearTo }

        // Monatsbereich (für Tagesverlauf im Kassenstand, wenn "Monat" gewählt ist)
        const curMonthFrom = new Date(Date.UTC(y, now.getUTCMonth(), 1)).toISOString().slice(0, 10)
        const curMonthTo = new Date(Date.UTC(y, now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
        
        // Gesamtbereich über alle Jahre
        const minYear = yearsAvail.length > 0 ? Math.min(...yearsAvail) : y
        const maxYear = yearsAvail.length > 0 ? Math.max(...yearsAvail) : y
        const gesamtFrom = new Date(Date.UTC(minYear, 0, 1)).toISOString().slice(0, 10)
        const gesamtTo = new Date(Date.UTC(maxYear, 11, 31)).toISOString().slice(0, 10)
        
        const balanceFilters: CommonFilters = period === 'GESAMT'
          ? { from: gesamtFrom, to: gesamtTo }
          : period === 'MONAT'
            ? { from: curMonthFrom, to: curMonthTo }
            : yearFilters

        return (
          <>
            {/* Alle Komponenten untereinander in einer Spalte */}
            <div style={{ display: 'grid', gap: 12 }}>
              <BalanceAreaChart {...balanceFilters} />
              {/* Removed Offene Aufgaben and legacy Sphären‑Anteile/Usage tiles */}
              {/* Two-column layout: Zweckbindungen (max 2) left, Budgets (max 2) right */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                <div style={{ display: 'grid', gap: 12 }}>
                  {activeEarmarks.map(em => (
                    <EarmarkDetailCard key={em.id} earmarkId={em.id} {...yearFilters} />
                  ))}
                  {activeEarmarks.length === 0 && <div className="card" style={{ padding: 12 }}><div className="helper">Keine aktive Zweckbindung.</div></div>}
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                  {activeBudgets.map(b => (
                    <BudgetDetailCard key={b.id} budgetId={b.id} from={yearFilters.from} to={yearFilters.to} />
                  ))}
                  {activeBudgets.length === 0 && <div className="card" style={{ padding: 12 }}><div className="helper">Kein aktives Budget.</div></div>}
                </div>
              </div>
              <ReportsMonthlyChart from={balanceFilters.from} to={balanceFilters.to} />
              <ReportsCashBars from={balanceFilters.from} to={balanceFilters.to} />
              <SphereShareCard from={yearFilters.from} to={yearFilters.to} />
              <IncomeExpenseBars {...balanceFilters} />
            </div>
          </>
        )
      })()}

      <DashboardRecentActivity />
    </div>
  )
}

function DashboardRecentActivity() {
  const [rows, setRows] = React.useState<Array<any>>([])
  const [loading, setLoading] = React.useState(false)
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
    window.addEventListener('data-changed', onChanged)
    return () => { alive = false; window.removeEventListener('data-changed', onChanged) }
  }, [])

  function describe(row: any): { title: string; details?: string; tone?: 'ok' | 'warn' | 'err' } {
    const a = String(row.action || '').toUpperCase()
    const e = String(row.entity || '').toUpperCase()
    const d = row.diff || {}
    
    // Handle batch assignments (robust to missing fields/casing)
    if (a === 'BATCH_ASSIGN_EARMARK') {
      const count = Number(d?.count || 0)
      const earmarkLabel = (d?.earmarkCode || d?.earmark?.code)
        ? `${d?.earmarkCode || d?.earmark?.code} – ${d?.earmarkName || d?.earmark?.name || ''}`.trim()
        : (d?.earmarkName || d?.earmark?.name || (d?.earmarkId ? `#${d.earmarkId}` : ''))
      return { title: `Batchzuweisung: ${count} Buchung(en)`, details: `Zweckbindung: ${earmarkLabel}`.trim(), tone: 'ok' }
    }
    if (a === 'BATCH_ASSIGN_BUDGET') {
      const count = Number(d?.count || 0)
      const budgetLabel = d?.budgetLabel || d?.budgetName || d?.budget?.name || (d?.budgetId ? `#${d.budgetId}` : '')
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
        add('earmarkId', d.before?.earmarkId, d.after?.earmarkId)
        add('budgetId', d.before?.budgetId, d.after?.budgetId)
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
    if (e === 'IMPORTS' && a === 'EXECUTE') {
      return { title: `Import ausgeführt (${d.format || 'Datei'})`, details: `importiert ${d.imported || 0}, übersprungen ${d.skipped || 0}, Fehler ${d.errorCount || 0}` }
    }
    // Fallback
    return { title: `${a} ${e} #${row.entityId || ''}`.trim(), details: '' }
  }

  const ActionIcon = ({ kind, color }: { kind: string; color: string }) => {
    const a = String(kind || '').toUpperCase()
    const common = { width: 16, height: 16, viewBox: '0 0 24 24' } as any
    // Dedicated icon for batch assignments
    if (a.startsWith('BATCH_ASSIGN')) {
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
                  {recDateRaw ? (
                    <div className="helper" style={{ whiteSpace: 'nowrap', marginLeft: 8 }}>
                      Belegdatum: {recDateRaw}
                    </div>
                  ) : null}
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
