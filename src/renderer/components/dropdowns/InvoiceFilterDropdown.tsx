import React, { useEffect, useMemo, useState } from 'react'
import FilterDropdown from './FilterDropdown'

export type InvoiceStatus = 'ALL' | 'OPEN' | 'PARTIAL' | 'PAID'
export type Sphere = '' | 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'

export interface InvoiceFilterDropdownValues {
  status: InvoiceStatus
  sphere: Sphere
  budgetId: number | ''
  tag: string
  dueFrom: string
  dueTo: string
}

export interface InvoiceFilterDropdownProps extends InvoiceFilterDropdownValues {
  budgets: Array<{ id: number; name?: string | null; year: number }>
  tags: Array<{ id: number; name: string }>
  yearsAvail: number[]
  onApply: (vals: InvoiceFilterDropdownValues) => void
}

export default function InvoiceFilterDropdown({
  status: statusProp,
  sphere: sphereProp,
  budgetId: budgetIdProp,
  tag: tagProp,
  dueFrom: dueFromProp,
  dueTo: dueToProp,
  budgets,
  tags,
  yearsAvail,
  onApply
}: InvoiceFilterDropdownProps) {
  const [status, setStatus] = useState<InvoiceStatus>(statusProp)
  const [sphere, setSphere] = useState<Sphere>(sphereProp)
  const [budgetId, setBudgetId] = useState<number | ''>(budgetIdProp)
  const [tag, setTag] = useState<string>(tagProp)
  const [dueFrom, setDueFrom] = useState<string>(dueFromProp)
  const [dueTo, setDueTo] = useState<string>(dueToProp)
  const [selectedYear, setSelectedYear] = useState<string>('')

  useEffect(() => {
    setStatus(statusProp)
    setSphere(sphereProp)
    setBudgetId(budgetIdProp)
    setTag(tagProp)
    setDueFrom(dueFromProp)
    setDueTo(dueToProp)
  }, [statusProp, sphereProp, budgetIdProp, tagProp, dueFromProp, dueToProp])

  const hasFilters = status !== 'ALL' || sphere !== '' || budgetId !== '' || tag !== '' || dueFrom !== '' || dueTo !== ''

  const labelForBudget = useMemo(
    () =>
      (bud: { id: number; name?: string | null; year: number }) => {
        const n = (bud.name || '').trim()
        return n ? `${bud.year} – ${n}` : String(bud.year)
      },
    []
  )

  function handleYearSelect(year: string) {
    setSelectedYear(year)
    if (!year) {
      setDueFrom('')
      setDueTo('')
      return
    }
    const yr = Number(year)
    if (!Number.isFinite(yr) || yr < 1900) return
    const nf = new Date(Date.UTC(yr, 0, 1)).toISOString().slice(0, 10)
    const nt = new Date(Date.UTC(yr, 11, 31)).toISOString().slice(0, 10)
    setDueFrom(nf)
    setDueTo(nt)
  }

  function handleApply() {
    onApply({ status, sphere, budgetId, tag, dueFrom, dueTo })
  }

  function handleReset() {
    setStatus('ALL')
    setSphere('')
    setBudgetId('')
    setTag('')
    setDueFrom('')
    setDueTo('')
    setSelectedYear('')
    onApply({ status: 'ALL', sphere: '', budgetId: '', tag: '', dueFrom: '', dueTo: '' })
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
    >
      <div className="filter-dropdown__grid">
        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus)}>
            <option value="ALL">Alle</option>
            <option value="OPEN">Offen</option>
            <option value="PARTIAL">Teilweise</option>
            <option value="PAID">Bezahlt</option>
          </select>
        </div>

        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Sphäre</label>
          <select className="input" value={sphere} onChange={(e) => setSphere((e.target.value || '') as Sphere)}>
            <option value="">Alle</option>
            <option value="IDEELL">IDEELL</option>
            <option value="ZWECK">ZWECK</option>
            <option value="VERMOEGEN">VERMÖGEN</option>
            <option value="WGB">WGB</option>
          </select>
        </div>

        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Budget</label>
          <select
            className="input"
            value={budgetId === '' ? '' : String(budgetId)}
            onChange={(e) => {
              const v = e.target.value
              setBudgetId(v ? Number(v) : '')
            }}
          >
            <option value="">Alle</option>
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {labelForBudget(b)}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Tag</label>
          <select className="input" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Alle</option>
            {tags.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Fällig von</label>
          <input className="input" type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
        </div>

        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Fällig bis</label>
          <input className="input" type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />
        </div>
      </div>

      <div className="filter-dropdown__field filter-dropdown__field--mt">
        <label className="filter-dropdown__label">Schnellauswahl Jahr</label>
        <select className="input" value={selectedYear} onChange={(e) => handleYearSelect(e.target.value)}>
          <option value="">—</option>
          {yearsAvail.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
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
