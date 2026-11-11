import { useEffect, useRef, useState } from 'react'
import { addDataChangedListener, dispatchDataChanged } from '../utils/refresh'

export type AssignmentKind = 'budget' | 'earmark'
type Assignment = { id: number; year?: number; isArchived?: number; isActive?: number }
export const assignmentPinsKey = (kind: AssignmentKind) => `sidebar.pinned.${kind}`

// Keep the previous automatic selection until the user first customizes it.
// An explicitly saved empty array means that no assignments should be shown.
export async function readAssignmentPins(kind: AssignmentKind, rows: Assignment[]): Promise<number[]> {
  const { value } = await window.api.settings.get({ key: assignmentPinsKey(kind) })
  if (Array.isArray(value)) return [...new Set(value.filter((id): id is number => Number.isSafeInteger(id) && id > 0))]
  return rows.filter(row => kind === 'budget' ? !row.isArchived : row.isActive !== 0)
    .sort((a, b) => (kind === 'budget' ? (b.year || 0) - (a.year || 0) : 0) || b.id - a.id)
    .slice(0, 3).map(row => row.id)
}

export function useSidebarAssignmentPins(kind: AssignmentKind) {
  const [ids, setIds] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  const busy = useRef(false)
  useEffect(() => {
    let disposed = false
    const load = async () => {
      const version = ++request.current
      setLoading(true)
      try {
        const { rows } = kind === 'budget'
          ? await window.api.budgets.list({ includeArchived: false })
          : await window.api.bindings.list({ activeOnly: true })
        if (disposed || version !== request.current) return
        const next = await readAssignmentPins(kind, rows)
        if (!disposed && version === request.current) { setIds(next); setError(''); setLoading(false) }
      } catch {
        if (!disposed && version === request.current) { setIds([]); setError('Die Seitenleisten-Auswahl konnte nicht geladen werden.') }
      }
    }
    const offChange = addDataChangedListener(['settings', kind === 'budget' ? 'budgets' : 'earmarks'], () => { void load() })
    const offSwitch = window.api.organizations?.onSwitched(() => { setIds([]); setError(''); void load() })
    void load()
    return () => { disposed = true; ++request.current; offChange(); offSwitch?.() }
  }, [kind])

  const toggle = async (id: number) => {
    if (loading || busy.current) return
    busy.current = true
    setSaving(true); setError('')
    const version = request.current
    const next = ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]
    try {
      const result = await window.api.settings.set({ key: assignmentPinsKey(kind), value: next })
      if (!result.ok) throw new Error('Save failed')
      if (version === request.current) setIds(next)
      dispatchDataChanged(['settings'])
    } catch {
      if (version === request.current) setError('Die Seitenleisten-Auswahl konnte nicht gespeichert werden. Bitte erneut versuchen.')
    } finally { busy.current = false; setSaving(false) }
  }
  return { ids, disabled: loading || saving, error, toggle, retry: () => { dispatchDataChanged(['settings']) } }
}
