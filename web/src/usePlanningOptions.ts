import { useEffect, useState } from 'react'
import { api, ApiError } from './api'
import { addDataChangedListener } from '../../src/renderer/utils/refresh'
export type BudgetOption = { id: number; name: string; label: string; year: number; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number; isArchived?: number; color?: string | null }
export type EarmarkOption = { id: number; code: string; name: string; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number; isActive?: number; color?: string | null }
export function usePlanningOptions(onSessionExpired: () => void, enabled = true, readOnlyOptions = false) {
  const [budgets, setBudgets] = useState<BudgetOption[]>([])
  const [earmarks, setEarmarks] = useState<EarmarkOption[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!enabled) return
    let active = true
    async function refresh() {
      try {
        let nextBudgets: BudgetOption[], nextEarmarks: EarmarkOption[]
        if (readOnlyOptions) {
          const result = await api<{ budgets: BudgetOption[]; earmarks: EarmarkOption[] }>('/planning/options')
          nextBudgets = result.budgets || []
          nextEarmarks = result.earmarks || []
        } else {
          const result = await Promise.all([
            api<{ rows: BudgetOption[] }>('/planning/budgets').then(result => result.rows),
            api<{ rows: EarmarkOption[] }>('/planning/earmarks').then(result => result.rows)
          ])
          nextBudgets = result[0]
          nextEarmarks = result[1]
        }
        if (!active) return
        setBudgets(nextBudgets.map(row => ({ ...row, label: row.name || String(row.id) })))
        setEarmarks(nextEarmarks)
        setError('')
      } catch (cause) {
        if (!active) return
        if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
        else setError(cause instanceof Error ? cause.message : 'Zuordnungen konnten nicht geladen werden.')
      }
    }
    void refresh()
    const unsubscribe = addDataChangedListener(['budgets', 'earmarks'], () => { void refresh() })
    return () => { active = false; unsubscribe() }
  }, [onSessionExpired, enabled, readOnlyOptions])
  return { budgets, earmarks, error }
}
