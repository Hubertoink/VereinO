import React, { useEffect, useMemo, useRef, useState } from 'react'
import { IconFilter } from '@tabler/icons-react'
import AppIcon from '../common/AppIcon'
import FilterDropdown from './FilterDropdown'

export type Sphere = null | 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'

export interface MetaFilterDropdownProps {
  budgets: Array<{ id: number; name?: string | null; categoryName?: string | null; projectName?: string | null; year: number }>
  earmarks: Array<{ id: number; code: string; name?: string | null }>
  paymentAccounts?: Array<{ id: number; name: string; kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'; color?: string | null; isActive: number }>
  tagDefs: Array<{ id: number; name: string; usage?: number }>
  filterType: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL' | null
  filterPM: 'BAR' | 'BANK' | null
  paymentAccountId?: number | null
  filterTag: string | null
  sphere: Sphere
  primaryClassificationValueId?: number | null
  earmarkId: number | null
  budgetId: number | null
  tooltip?: string
  onApply: (v: {
    filterType: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL' | null
    filterPM: 'BAR' | 'BANK' | null
    paymentAccountId?: number | null
    filterTag: string | null
    sphere: Sphere
    primaryClassificationValueId?: number | null
    earmarkId: number | null
    budgetId: number | null
  }) => void
}

export default function MetaFilterDropdown({
  budgets,
  earmarks,
  paymentAccounts = [],
  tagDefs,
  filterType,
  filterPM,
  paymentAccountId = null,
  filterTag,
  sphere,
  primaryClassificationValueId = null,
  earmarkId,
  budgetId,
  onApply,
  tooltip
}: MetaFilterDropdownProps) {
  const closeRef = useRef<(() => void) | null>(null)
  const [type, setType] = useState<MetaFilterDropdownProps['filterType']>(filterType)
  const [pm, setPm] = useState<MetaFilterDropdownProps['filterPM']>(filterPM)
  const [accountId, setAccountId] = useState<number | null>(paymentAccountId)
  const [tag, setTag] = useState<string | null>(filterTag)
  const [s, setS] = useState<Sphere>(sphere)
  const [primary, setPrimary] = useState<number | null>(primaryClassificationValueId)
  const [e, setE] = useState<number | null>(earmarkId)
  const [b, setB] = useState<number | null>(budgetId)
  const [isGeneralProfile, setIsGeneralProfile] = useState(false)
  const [categories, setCategories] = useState<Array<{ id: number; name: string; icon?: string | null }>>([])

  useEffect(() => {
    setType(filterType)
    setPm(filterPM)
    setAccountId(paymentAccountId)
    setTag(filterTag)
    setS(sphere)
    setPrimary(primaryClassificationValueId)
    setE(earmarkId)
    setB(budgetId)
  }, [filterType, filterPM, paymentAccountId, filterTag, sphere, primaryClassificationValueId, earmarkId, budgetId])
  useEffect(() => {
    let active = true
    void window.api.classifications.primary.list().then((result) => {
      if (!active) return
      setIsGeneralProfile(result.profile === 'GENERAL')
      setCategories(result.values.filter((category) => category.isActive !== false))
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const hasFilters = type != null || pm != null || accountId != null || tag != null || s != null || primary != null || e != null || b != null

  const showTags = tagDefs.length > 0
  const showEarmarks = earmarks.length > 0
  const showBudgets = budgets.length > 0
  const activePaymentAccounts = paymentAccounts.filter((account) => account.isActive !== 0)

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
    setAccountId(null)
    setTag(null)
    setS(null)
    setPrimary(null)
    setE(null)
    setB(null)
    onApply({ filterType: null, filterPM: null, paymentAccountId: null, filterTag: null, sphere: null, primaryClassificationValueId: null, earmarkId: null, budgetId: null })
  }

  const handleApply = () => {
    onApply({ filterType: type, filterPM: accountId == null ? pm : null, paymentAccountId: accountId, filterTag: tag, sphere: s, primaryClassificationValueId: primary, earmarkId: e, budgetId: b })
    closeRef.current?.()
  }

  return (
    <FilterDropdown
      trigger={<AppIcon icon={IconFilter} size="action" />}
      title="Filter"
      hasActiveFilters={hasFilters}
      alignRight
      width={420}
      ariaLabel="Filter"
      buttonTitle="Filter"
      colorVariant="filter"
      tooltip={tooltip}
      closeRef={closeRef}
    >
      <div className="filter-dropdown__grid">
        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Art</label>
          <select className="input" value={type ?? ''} onChange={(ev) => setType((ev.target.value as any) || null)}>
            <option value="">Alle</option>
            <option value="IN">IN</option>
            <option value="OUT">OUT</option>
            <option value="TRANSFER">TRANSFER</option>
            <option value="INTERNAL">INTERNAL</option>
          </select>
        </div>

        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Zahlweg</label>
          <select className="input" value={accountId != null ? String(accountId) : (pm ?? '')} onChange={(ev) => {
            const value = ev.target.value
            if (!value) { setAccountId(null); setPm(null); return }
            if (value === 'BAR' || value === 'BANK') { setAccountId(null); setPm(value); return }
            setAccountId(Number(value)); setPm(null)
          }}>
            <option value="">Alle</option>
            {activePaymentAccounts.length > 0 ? activePaymentAccounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            )) : (<>
              <option value="BAR">Bar</option>
              <option value="BANK">Bank</option>
            </>)}
          </select>
        </div>

        {showTags && (
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
        )}

        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">{isGeneralProfile ? 'Kategorie' : 'Sphäre'}</label>
          {isGeneralProfile ? <select className="input" value={primary ?? ''} onChange={(ev) => setPrimary(ev.target.value ? Number(ev.target.value) : null)}>
            <option value="">Alle</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.icon ? `${category.icon} ` : ''}{category.name}</option>)}
          </select> : <select className="input" value={s ?? ''} onChange={(ev) => setS((ev.target.value as any) || null)}>
            <option value="">Alle</option>
            <option value="IDEELL">IDEELL</option>
            <option value="ZWECK">ZWECK</option>
            <option value="VERMOEGEN">VERMOEGEN</option>
            <option value="WGB">WGB</option>
          </select>}
        </div>

        {showEarmarks && (
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
        )}

        {showBudgets && (
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
        )}
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
