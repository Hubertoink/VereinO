import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReportsMonthlyChart from './charts/ReportsMonthlyChart'
import ReportsCashBars from './charts/ReportsCashBars'

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

  const [period, setPeriod] = useState<'MONAT' | 'JAHR'>(() => {
    try { return (localStorage.getItem('dashPeriod') as any) || 'MONAT' } catch { return 'MONAT' }
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
    const from = period === 'MONAT'
      ? new Date(Date.UTC(y, now.getUTCMonth(), 1)).toISOString().slice(0, 10)
      : new Date(Date.UTC(y, 0, 1)).toISOString().slice(0, 10)
    const to = period === 'MONAT'
      ? new Date(Date.UTC(y, now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
      : new Date(Date.UTC(y, 11, 31)).toISOString().slice(0, 10)
    window.api?.reports.summary?.({ from, to }).then(res => {
      if (cancelled || !res) return
      const inGross = res.byType.find(x => x.key === 'IN')?.gross || 0
      const outGrossRaw = res.byType.find(x => x.key === 'OUT')?.gross || 0
      const outGross = Math.abs(outGrossRaw)
      const diff = Math.round((inGross - outGross) * 100) / 100
      setSum({ inGross, outGross, diff })
    })
    return () => { cancelled = true }
  }, [period, refreshKey])
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

  return (
    <div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Hallo{cashier ? ` ${cashier}` : ''}</div>
          <div className="helper">Willkommen zurück – hier ist dein Überblick.</div>
        </div>
        <div style={{ textAlign: 'right', maxWidth: 520 }}>
          <div className="helper">Satz der Woche</div>
          <div style={{ fontStyle: 'italic' }}>{loading ? '…' : (quote?.text || '—')}</div>
          <div className="helper">{quote?.author || quote?.source || ''}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <div className="btn-group" role="tablist" aria-label="Zeitraum">
            <button className="btn ghost" onClick={() => setPeriod('MONAT')} style={{ background: period === 'MONAT' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Monat</button>
            <button className="btn ghost" onClick={() => setPeriod('JAHR')} style={{ background: period === 'JAHR' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Jahr</button>
          </div>
          {period === 'JAHR' && yearsAvail.length > 1 && (
            <select className="input" value={String((yearSel ?? yearsAvail[0]))} onChange={(e) => setYearSel(Number(e.target.value))}>
              {yearsAvail.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          )}
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="helper">Einnahmen ({period === 'MONAT' ? 'Monat' : 'Jahr'})</div>
          <div style={{ fontWeight: 600 }}>{eur.format(sum?.inGross || 0)}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="helper">Ausgaben ({period === 'MONAT' ? 'Monat' : 'Jahr'})</div>
          <div style={{ fontWeight: 600 }}>{eur.format(sum?.outGross || 0)}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="helper">Saldo ({period === 'MONAT' ? 'Monat' : 'Jahr'})</div>
          <div style={{ fontWeight: 600, color: (sum && sum.diff >= 0) ? 'var(--success)' : 'var(--danger)' }}>{eur.format(sum?.diff || 0)}</div>
        </div>
      </div>
      <div className="card" style={{ padding: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong>Offene Rechnungen</strong>
            <span className="chip" title="Summen berücksichtigen offene (OPEN+PARTIAL) Rechnungen. 'Fällig in ≤ 5 Tagen' bezieht sich auf heute bis +5 Tage, 'Überfällig' ist vor heute.">ⓘ</span>
          </div>
          <button className="btn ghost" onClick={onGoToInvoices}>Zu Rechnungen</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 8, overflow: 'hidden' }}>
          <div className="card" style={{ padding: 10, minWidth: 0 }}>
            <div className="helper">Offen gesamt</div>
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eur.format(invOpenRemaining || 0)} <span className="helper">({invOpenCount})</span></div>
          </div>
          <div className="card" style={{ padding: 10, minWidth: 0 }}>
            <div className="helper">Fällig in ≤ 5 Tagen</div>
            <div style={{ fontWeight: 600, color: '#f9a825', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eur.format(invDueSoonRemaining || 0)} <span className="helper">({invDueSoonCount})</span></div>
          </div>
          <div className="card" style={{ padding: 10, borderLeft: '4px solid var(--danger)', minWidth: 0 }}>
            <div className="helper">Überfällig</div>
            <div style={{ fontWeight: 600, color: 'var(--danger)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eur.format(invOverdueRemaining || 0)} <span className="helper">({invOverdueCount})</span></div>
          </div>
        </div>
        <div style={{ marginTop: 10, overflow: 'hidden' }}>
          <div className="helper">Nächste Fälligkeiten</div>
          {invTopDue.length > 0 ? (
            <div style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 4 }}>
              {invTopDue.map((r) => {
                const onOpen = () => {
                  try { onGoToInvoices() } catch {}
                  window.setTimeout(() => { window.dispatchEvent(new CustomEvent('open-invoice-details', { detail: { id: r.id } })) }, 0)
                }
                return (
                  <div key={r.id} onClick={onOpen} title="Details öffnen" style={{ cursor: 'pointer', display: 'grid', gridTemplateColumns: '120px 1fr auto', alignItems: 'center', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ color: 'var(--text-dim)' }}>{r.dueDate || '—'}</div>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.party || '—'}</div>
                    <div style={{ textAlign: 'right', fontWeight: 600 }}>{eur.format(r.remaining || 0)}</div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="helper" style={{ marginTop: 6 }}>—</div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {(() => {
          const now = new Date()
          const y = (period === 'JAHR' && yearSel) ? yearSel : now.getUTCFullYear()
          const f = period === 'MONAT'
            ? new Date(Date.UTC(y, now.getUTCMonth(), 1)).toISOString().slice(0, 10)
            : new Date(Date.UTC(y, 0, 1)).toISOString().slice(0, 10)
          const t = period === 'MONAT'
            ? new Date(Date.UTC(y, now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
            : new Date(Date.UTC(y, 11, 31)).toISOString().slice(0, 10)
          return (
            <>
              <ReportsMonthlyChart from={f} to={t} />
              <ReportsCashBars from={f} to={t} />
            </>
          )
        })()}
      </div>

      <DashboardEarmarksPeek />
      <DashboardRecentActivity />
    </div>
  )
}

function DashboardEarmarksPeek() {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="helper">Zweckbindungen (aktiv, Vorschau)</div>
      <div className="helper">—</div>
    </div>
  )
}

function DashboardRecentActivity() {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="helper">Letzte Aktivitäten</div>
      <div className="helper">—</div>
    </div>
  )
}
