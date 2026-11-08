import React, { useEffect, useState } from 'react'
import { addDataChangedListener } from '../../utils/refresh'
import { IconLock } from '@tabler/icons-react'
import { financeUsage } from '../finance/financeModel'

export type SidebarAssignmentKind = 'budget' | 'earmark'
type Entry = { id: number; name?: string | null; code?: string; year?: number; categoryName?: string | null; projectName?: string | null; isArchived?: number; isActive?: number; amountPlanned?: number; budget?: number | null; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number; remaining?: number | null; loading?: boolean }
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const dateLabel = (date: string) => date.slice(0, 10).split('-').reverse().join('.')
const rangeLabel = (entry: Entry) => entry.startDate && entry.endDate ? `${dateLabel(entry.startDate)} – ${dateLabel(entry.endDate)}` : entry.startDate ? `ab ${dateLabel(entry.startDate)}` : entry.endDate ? `bis ${dateLabel(entry.endDate)}` : ''

export function SidebarRecentAssignments({ kind, onSelect }: { kind: SidebarAssignmentKind; onSelect: (kind: SidebarAssignmentKind, id: number) => void }) {
  const [entries, setEntries] = useState<Entry[]>([])
  useEffect(() => {
    let disposed = false
    let request = 0
    const load = async () => {
      const current = ++request
      try {
        const result = kind === 'budget'
          ? await window.api.budgets.list({ includeArchived: false })
          : await window.api.bindings.list({ activeOnly: true })
        if (disposed || current !== request) return
        const rows: Entry[] = result.rows
        const recent = rows.filter(entry => kind === 'budget' ? !entry.isArchived : entry.isActive !== 0)
          .sort((a, b) => (kind === 'budget' ? (b.year || 0) - (a.year || 0) : 0) || b.id - a.id).slice(0, 3)
        setEntries(recent.map(entry => ({ ...entry, loading: true })))
        const enriched = await Promise.all(recent.map(async entry => {
          const plan = Number(kind === 'budget' ? entry.amountPlanned : entry.budget)
          if (!(plan > 0)) return entry
          try {
            const remaining = kind === 'budget'
              ? await window.api.budgets.usage({ budgetId: entry.id }).then(usage => financeUsage(usage.planned ?? plan, usage.inflow, usage.spent).remaining)
              : await window.api.bindings.usage({ earmarkId: entry.id }).then(usage => financeUsage(usage.budget ?? plan, usage.allocated, usage.released).remaining)
            return { ...entry, remaining: Number.isFinite(remaining) ? remaining : null }
          } catch { return { ...entry, remaining: null } }
        }))
        if (!disposed && current === request) setEntries(enriched)
      } catch { if (!disposed && current === request) setEntries([]) }
    }
    const offChange = addDataChangedListener([kind === 'budget' ? 'budgets' : 'earmarks', 'vouchers'], () => { void load() })
    const offSwitch = window.api.organizations.onSwitched(() => { setEntries([]); void load() })
    void load()
    return () => { disposed = true; offChange(); offSwitch?.() }
  }, [kind])
  if (!entries.length) return null
  return <div className="sidebar-recent-assignments" role="group" aria-label={kind === 'budget' ? 'Aktuelle Budgets' : 'Aktuelle Zweckbindungen'}>
    {entries.map(entry => {
      const name = entry.name || entry.categoryName || entry.projectName || entry.code || `Budget ${entry.year || ''}`.trim()
      const range = rangeLabel(entry)
      const hasPlan = Number(kind === 'budget' ? entry.amountPlanned : entry.budget) > 0
      const balance = entry.loading ? '…' : entry.remaining == null ? '—' : euro.format(entry.remaining)
      const balanceDescription = !hasPlan ? '' : entry.loading ? 'Reststand wird geladen' : entry.remaining == null ? 'Reststand nicht verfügbar' : `Rest zum Plan: ${balance}`
      return <button type="button" key={entry.id} className="sidebar-recent-assignment" onClick={() => onSelect(kind, entry.id)} title={[`Buchungen zu ${name} anzeigen`, balanceDescription, range ? `${range}${entry.enforceTimeRange ? ' · verbindlicher Zeitraum' : ' · unverbindlicher Zeitraum'}` : ''].filter(Boolean).join('\n')}>
        <span className="sidebar-assignment-heading"><span className="sidebar-assignment-name">{name}</span>{hasPlan && <span className={`sidebar-assignment-balance${entry.remaining != null && entry.remaining < 0 ? ' is-negative' : ''}`} aria-label={balanceDescription}>{balance}</span>}</span>
        {range && <span className="sidebar-assignment-period">{entry.enforceTimeRange ? <IconLock size={12} aria-label="Verbindlicher Zeitraum" /> : null}<span>{range}</span></span>}
      </button>
    })}
  </div>
}
