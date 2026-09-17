import { useCallback, useEffect, useState } from 'react'
import type { QA } from '../../src/renderer/types/bookingEntry'
import type { Entry, User, Fields } from './api'
import type { WebWorkflowSettings } from './settingsApi'
export type BookingTab = {
  id: string
  entry?: Entry
  qa?: QA
  files?: File[]
  retained: boolean
  initialFields?: Fields
  aiDocumentId?: string
  reviewWarnings?: string[]
}
export function useBookingTabs(user: User | null, settings: WebWorkflowSettings | null) {
  const scope = user ? `${user.organizationId}:${user.id}` : ''
  const [state, setState] = useState<{ scope: string; rows: BookingTab[]; active: string | null }>({
    scope,
    rows: [],
    active: null
  })
  const rows = state.scope === scope ? state.rows : [],
    active = state.scope === scope ? state.active : null
  useEffect(() => {
    setState((current) => (current.scope === scope ? current : { scope, rows: [], active: null }))
  }, [scope])
  useEffect(() => {
    if (!rows.length) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [rows.length])
  const open = useCallback(
    (entry?: Entry) => {
      const retained = !!(entry ? settings?.showBookingEditTabs : settings?.showBookingDraftTabs)
      setState((current) => {
        const currentRows = current.scope === scope ? current.rows : []
        const existing = entry && currentRows.find((row) => row.entry?.id === entry.id)
        if (existing) return { ...current, active: existing.id }
        const row: BookingTab = { id: crypto.randomUUID(), entry, retained }
        return {
          scope,
          rows: [...currentRows.filter((item) => item.retained), row],
          active: row.id
        }
      })
    },
    [scope, settings?.showBookingEditTabs, settings?.showBookingDraftTabs]
  )
  const select = useCallback(
    (id: string) =>
      setState((current) =>
        current.scope === scope && current.rows.some((row) => row.id === id)
          ? { ...current, active: id }
          : current
      ),
    [scope]
  )
  const remove = useCallback(
    (id: string) =>
      setState((current) =>
        current.scope === scope
          ? {
              ...current,
              rows: current.rows.filter((row) => row.id !== id),
              active: current.active === id ? null : current.active
            }
          : current
      ),
    [scope]
  )
  const park = useCallback(
    (id: string) =>
      setState((current) =>
        current.scope === scope
          ? {
              ...current,
              rows: current.rows.filter((row) => row.id !== id || row.retained),
              active: null
            }
          : current
      ),
    [scope]
  )
  const update = useCallback(
    (id: string, qa: QA) =>
      setState((current) =>
        current.scope === scope
          ? { ...current, rows: current.rows.map((row) => (row.id === id ? { ...row, qa } : row)) }
          : current
      ),
    [scope]
  )
  const updateFiles = useCallback((id: string, files: File[]) => setState(current => current.scope === scope
    ? { ...current, rows: current.rows.map(row => row.id === id ? { ...row, files } : row) } : current), [scope])
  const capture = useCallback(
    (initialFields: Fields, aiDocumentId?: string, reviewWarnings?: string[]) => {
      setState((current) => {
        const currentRows = current.scope === scope ? current.rows : []
        const existing =
          aiDocumentId && currentRows.find((row) => row.aiDocumentId === aiDocumentId)
        if (existing) return { ...current, active: existing.id }
        const row: BookingTab = {
          id: crypto.randomUUID(),
          retained: true,
          initialFields,
          aiDocumentId,
          reviewWarnings
        }
        return {
          scope,
          rows: [...currentRows.filter((item) => item.retained), row],
          active: row.id
        }
      })
    },
    [scope]
  )
  return {
    capture,
    updateFiles,
    newTabsEnabled: !!settings?.showBookingDraftTabs,
    rows,
    active,
    open,
    select,
    remove,
    park,
    update,
    afterSave: settings?.quickAddAfterSave || 'close'
  }
}
export type BookingWorkspace = ReturnType<typeof useBookingTabs>
