import React, { useEffect, useMemo, useState } from 'react'
import FilterDropdown from './FilterDropdown'

export type Sphere = null | 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'

export interface MetaFilterDropdownProps {
  budgets: Array<{ id: number; name?: string | null; categoryName?: string | null; projectName?: string | null; year: number }>
  earmarks: Array<{ id: number; code: string; name?: string | null }>
  tagDefs: Array<{ id: number; name: string; usage?: number }>
  filterType: 'IN' | 'OUT' | 'TRANSFER' | null
  filterPM: 'BAR' | 'BANK' | null
  filterTag: string | null
  sphere: Sphere
  earmarkId: number | null
  budgetId: number | null
  tooltip?: string
  onApply: (v: {
    filterType: 'IN' | 'OUT' | 'TRANSFER' | null
    filterPM: 'BAR' | 'BANK' | null
    filterTag: string | null
    sphere: Sphere
    earmarkId: number | null
    budgetId: number | null
  }) => void
}

export default function MetaFilterDropdown({
  budgets,
  earmarks,
  tagDefs,
  filterType,
  filterPM,
  filterTag,
  sphere,
  earmarkId,
  budgetId,
  onApply,
  tooltip
}: MetaFilterDropdownProps) {
  const [type, setType] = useState<MetaFilterDropdownProps['filterType']>(filterType)
  const [pm, setPm] = useState<MetaFilterDropdownProps['filterPM']>(filterPM)
  const [tag, setTag] = useState<string | null>(filterTag)
  const [s, setS] = useState<Sphere>(sphere)
  const [e, setE] = useState<number | null>(earmarkId)
  const [b, setB] = useState<number | null>(budgetId)

  useEffect(() => {
    setType(filterType)
    setPm(filterPM)
    setTag(filterTag)
    setS(sphere)
    setE(earmarkId)
    setB(budgetId)
  }, [filterType, filterPM, filterTag, sphere, earmarkId, budgetId])

  const hasFilters = type != null || pm != null || tag != null || s != null || e != null || b != null

  const labelForBudget = (bud: { id: number; name?: string | null; categoryName?: string | null; projectName?: string | null; year: number }) =>
    (bud.name && bud.name.trim()) || bud.categoryName || bud.projectName || String(bud.year)

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const td of tagDefs) {
      if (typeof td.usage === 'number') counts[td.name] = td.usage
    }
    return counts
  }, [tagDefs])

  const handleReset = () => {
    setType(null)
    setPm(null)
    setTag(null)
    setS(null)
    setE(null)
    setB(null)
    onApply({ filterType: null, filterPM: null, filterTag: null, sphere: null, earmarkId: null, budgetId: null })
  }

  const handleApply = () => {
    onApply({ filterType: type, filterPM: pm, filterTag: tag, sphere: s, earmarkId: e, budgetId: b })
  }

  return (
    <FilterDropdown
      trigger={
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 4h18v2L14 13v6l-4 2v-8L3 6V4z" />
        </svg>
      }
      title="Filter"
      hasActiveFilters={hasFilters}
      alignRight
      width={420}
      ariaLabel="Filter"
      buttonTitle="Filter"
      colorVariant="filter"
      tooltip={tooltip}
    >
      <div className="filter-dropdown__grid">
        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Art</label>
          <select className="input" value={type ?? ''} onChange={(ev) => setType((ev.target.value as any) || null)}>
            <option value="">Alle</option>
            <option value="IN">IN</option>
            <option value="OUT">OUT</option>
            <option value="TRANSFER">TRANSFER</option>
          </select>
        </div>

        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Zahlweg</label>
          <select className="input" value={pm ?? ''} onChange={(ev) => setPm((ev.target.value as any) || null)}>
            <option value="">Alle</option>
            <option value="BAR">Bar</option>
            <option value="BANK">Bank</option>
          </select>
        </div>

        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Tag</label>
          <select className="input" value={tag ?? ''} onChange={(ev) => setTag(ev.target.value || null)}>
            <option value="">Alle</option>
            {tagDefs.map((t) => {
              const count = tagCounts[t.name] || 0
              return (
                <option key={t.id} value={t.name}>
                  {t.name}{typeof t.usage === 'number' ? ` (${count})` : ''}
                </option>
              )
            })}
          </select>
        </div>

        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Sphäre</label>
          <select className="input" value={s ?? ''} onChange={(ev) => setS((ev.target.value as any) || null)}>
            <option value="">Alle</option>
            <option value="IDEELL">IDEELL</option>
            <option value="ZWECK">ZWECK</option>
            <option value="VERMOEGEN">VERMOEGEN</option>
            <option value="WGB">WGB</option>
          </select>
        </div>

        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Zweckbindung</label>
          <select className="input" value={e ?? ''} onChange={(ev) => setE(ev.target.value ? Number(ev.target.value) : null)}>
            <option value="">Alle</option>
            {earmarks.map((em) => (
              <option key={em.id} value={em.id}>
                {em.code} – {em.name || ''}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Budget</label>
          <select className="input" value={b ?? ''} onChange={(ev) => setB(ev.target.value ? Number(ev.target.value) : null)}>
            <option value="">Alle</option>
            {budgets.map((bu) => (
              <option key={bu.id} value={bu.id}>
                {labelForBudget(bu)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="filter-dropdown__actions">
        <button className="btn" type="button" onClick={handleReset}>
          Zurücksetzen
        </button>
        <div className="filter-dropdown__actions-right">
          <button className="btn primary" type="button" onClick={handleApply}>
            Übernehmen
          </button>
        </div>
      </div>
    </FilterDropdown>
  )
}
