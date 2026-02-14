import React from 'react'
import { Sphere, VoucherType, PaymentMethod } from '../../components/reports/types'
import ReportsSummary from '../../components/reports/ReportsSummary'
import ReportsMonthlyChart from '../../components/reports/ReportsMonthlyChart'
import ReportsSphereDonut from '../../components/reports/ReportsSphereDonut'
import ReportsPaymentMethodBars from '../../components/reports/ReportsPaymentMethodBars'
import ReportsInOutLines from '../../components/reports/ReportsInOutLines'
import { MetaFilterDropdown, TimeFilterDropdown } from '../../components/dropdowns'

export default function ReportsView(props: {
  from: string
  to: string
  setFrom: (v: string) => void
  setTo: (v: string) => void
  yearsAvail: number[]
  filterSphere: Sphere | null
  setFilterSphere: (v: Sphere | null) => void
  filterType: VoucherType | null
  setFilterType: (v: VoucherType | null) => void
  filterPM: PaymentMethod | null
  setFilterPM: (v: PaymentMethod | null) => void
  filterEarmark: number | null
  setFilterEarmark: (v: number | null) => void
  filterBudgetId: number | null
  setFilterBudgetId: (v: number | null) => void
  budgets: Array<{ id: number; name?: string | null; categoryName?: string | null; projectName?: string | null; year: number }>
  earmarks: Array<{ id: number; code: string; name?: string | null }>
  onOpenExport: () => void
  refreshKey: number
  activateKey: number
}) {
  const {
    from,
    to,
    setFrom,
    setTo,
    yearsAvail,
    filterSphere,
    setFilterSphere,
    filterType,
    setFilterType,
    filterPM,
    setFilterPM,
    filterEarmark,
    setFilterEarmark,
    filterBudgetId,
    setFilterBudgetId,
    budgets,
    earmarks,
    onOpenExport,
    refreshKey,
    activateKey
  } = props

  const hasActiveFilters = filterSphere || filterType || filterPM || filterEarmark != null || filterBudgetId != null || from || to

  const fmtDateDe = (iso: string) => {
    const s = (iso || '').trim()
    const parts = s.split('-')
    if (parts.length !== 3) return s
    const [y, m, d] = parts
    if (!y || !m || !d) return s
    return `${d}.${m}.${y}`
  }

  const badges: Array<{ key: string; label: string; onClear: () => void }> = (() => {
    const list: Array<{ key: string; label: string; onClear: () => void }> = []

    if (from && to) {
      list.push({
        key: 'range',
        label: `Zeitraum: ${fmtDateDe(from)} – ${fmtDateDe(to)}`,
        onClear: () => {
          setFrom('')
          setTo('')
        }
      })
    } else if (from) {
      list.push({
        key: 'from',
        label: `Von: ${fmtDateDe(from)}`,
        onClear: () => setFrom('')
      })
    } else if (to) {
      list.push({
        key: 'to',
        label: `Bis: ${fmtDateDe(to)}`,
        onClear: () => setTo('')
      })
    }

    if (filterSphere) {
      list.push({
        key: 'sphere',
        label: `Sphäre: ${filterSphere}`,
        onClear: () => setFilterSphere(null)
      })
    }
    if (filterType) {
      list.push({
        key: 'type',
        label: `Art: ${filterType}`,
        onClear: () => setFilterType(null)
      })
    }
    if (filterPM) {
      list.push({
        key: 'pm',
        label: `Zahlweg: ${filterPM === 'BAR' ? 'Bar' : 'Bank'}`,
        onClear: () => setFilterPM(null)
      })
    }
    if (filterEarmark != null) {
      const earmark = earmarks.find((item) => item.id === filterEarmark)
      list.push({
        key: 'earmark',
        label: `Zweckbindung: ${earmark ? earmark.code : `#${filterEarmark}`}`,
        onClear: () => setFilterEarmark(null)
      })
    }
    if (filterBudgetId != null) {
      const budget = budgets.find((item) => item.id === filterBudgetId)
      const budgetLabel =
        (budget?.name && budget.name.trim()) ||
        budget?.categoryName ||
        budget?.projectName ||
        (budget ? String(budget.year) : `#${filterBudgetId}`)
      list.push({
        key: 'budget',
        label: `Budget: ${budgetLabel}`,
        onClear: () => setFilterBudgetId(null)
      })
    }
    return list
  })()

  const badgeStyle = (key: string): React.CSSProperties => {
    // Stable pseudo-random palette based on key (no hard-coded colors, uses theme vars)
    const palette = ['--accent', '--success', '--warning', '--danger', '--badge-in', '--badge-out'] as const
    let h = 0
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
    const varName = palette[h % palette.length]
    return {
      background: `color-mix(in oklab, var(${varName}) 18%, transparent)`,
      borderColor: `color-mix(in oklab, var(${varName}) 28%, var(--border))`
    }
  }

  return (
    <>
      <header className="flex justify-between items-center mb-16">
        <div>
          <h1 style={{ margin: 0 }}>Report</h1>
          <p className="helper">Auswertungen für den gewählten Zeitraum und die Filter.</p>
        </div>

        <div className="flex gap-8 items-center">
          <div className="toolbar-icon">
            <TimeFilterDropdown
              yearsAvail={yearsAvail}
              from={from}
              to={to}
              tooltip="Zeitraum filtern"
              onApply={({ from: nf, to: nt }) => {
                setFrom(nf)
                setTo(nt)
              }}
            />
          </div>

          <div className="toolbar-icon">
            <MetaFilterDropdown
              budgets={budgets}
              earmarks={earmarks}
              tagDefs={[]}
              filterType={filterType}
              filterPM={filterPM}
              filterTag={null}
              sphere={filterSphere}
              earmarkId={filterEarmark}
              budgetId={filterBudgetId}
              tooltip="Filter nach Art, Sphäre, Zahlweg, Zweckbindung, Budget"
              onApply={({ filterType: ft, filterPM: pm, sphere: sp, earmarkId, budgetId }) => {
                setFilterType(ft)
                setFilterPM(pm)
                setFilterSphere(sp)
                setFilterEarmark(earmarkId)
                setFilterBudgetId(budgetId)
              }}
            />
          </div>

          <button
            className="btn danger"
            title="Exportieren"
            onClick={() => onOpenExport()}
            style={{ width: 32, height: 32, padding: 0, display: 'grid', placeContent: 'center' }}
            aria-label="Exportieren"
            type="button"
          >
            📄
          </button>
        </div>
      </header>

      {badges.length > 0 && (
        <div className="mb-16" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} aria-label="Aktive Filter">
          {badges.map((b) => (
            <span key={b.key} className="chip" title={b.label} style={badgeStyle(b.key)}>
              <span>{b.label}</span>
              <button className="chip-x" type="button" onClick={b.onClear} aria-label={`Filter entfernen: ${b.label}`}>×</button>
            </span>
          ))}
          {hasActiveFilters && (
            <button
              className="btn ghost"
              title="Alle Filter zurücksetzen"
              onClick={() => {
                setFilterSphere(null)
                setFilterType(null)
                setFilterPM(null)
                setFilterEarmark(null)
                setFilterBudgetId(null)
                setFrom('')
                setTo('')
              }}
              style={{ padding: '4px 8px', color: 'var(--accent)' }}
              aria-label="Alle Filter zurücksetzen"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      )}

      {/* KPIs and charts */}
      <ReportsSummary refreshKey={refreshKey} from={from || undefined} to={to || undefined} sphere={filterSphere || undefined} type={filterType || undefined} paymentMethod={filterPM || undefined} earmarkId={filterEarmark || undefined} budgetId={filterBudgetId || undefined} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <ReportsSphereDonut refreshKey={refreshKey} from={from || undefined} to={to || undefined} type={filterType || undefined} paymentMethod={filterPM || undefined} earmarkId={filterEarmark || undefined} budgetId={filterBudgetId || undefined} />
        <ReportsPaymentMethodBars refreshKey={refreshKey} from={from || undefined} to={to || undefined} sphere={filterSphere || undefined} type={filterType || undefined} earmarkId={filterEarmark || undefined} budgetId={filterBudgetId || undefined} />
      </div>
      <div style={{ height: 12 }} />
      <ReportsMonthlyChart activateKey={activateKey} refreshKey={refreshKey} from={from || undefined} to={to || undefined} sphere={filterSphere || undefined} type={filterType || undefined} paymentMethod={filterPM || undefined} earmarkId={filterEarmark || undefined} budgetId={filterBudgetId || undefined} />
      <ReportsInOutLines activateKey={activateKey} refreshKey={refreshKey} from={from || undefined} to={to || undefined} sphere={filterSphere || undefined} paymentMethod={filterPM || undefined} earmarkId={filterEarmark || undefined} budgetId={filterBudgetId || undefined} />
    </>
  )
}

