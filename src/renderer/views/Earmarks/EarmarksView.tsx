import React, { useEffect, useMemo, useState } from 'react'
import { IconArchive, IconChevronLeft, IconChevronRight, IconChevronsDown, IconChevronsLeft, IconChevronsRight, IconChevronsUp, IconPencil, IconPlus, IconX } from '@tabler/icons-react'
import AppIcon from '../../components/common/AppIcon'
import { addDataChangedListener } from '../../utils/refresh'
import BindingModal from '../../components/modals/BindingModal'
import EarmarkUsageCards from '../../components/tiles/EarmarkUsageCards'

type Binding = {
  id: number
  code: string
  name: string
  description?: string | null
  startDate?: string | null
  endDate?: string | null
  isActive: number
  color?: string | null
  budget?: number | null
  enforceTimeRange?: number
}

type BindingEdit = {
  id?: number
  code: string
  name: string
  description?: string | null
  startDate?: string | null
  endDate?: string | null
  isActive?: boolean
  color?: string | null
  budget?: number | null
  enforceTimeRange?: number
}

export default function EarmarksView({
  from,
  to,
  filterSphere,
  onGoToBookings,
  onLoadEarmarks,
  notify
}: {
  from?: string
  to?: string
  filterSphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  onGoToBookings: (earmarkId: number) => void
  onLoadEarmarks: () => Promise<void>
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
}) {
  const [bindings, setBindings] = useState<Binding[]>([])
  const [allBindings, setAllBindings] = useState<Binding[]>([])
  const [editBinding, setEditBinding] = useState<BindingEdit | null>(null)
  const [archiveConfirm, setArchiveConfirm] = useState<Binding | null>(null)
  const [q, setQ] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const fmtDate = (d?: string | null) => d ? d.slice(8,10) + '.' + d.slice(5,7) + '.' + d.slice(0,4) : '—'
  const formatRange = (start?: string | null, end?: string | null) => {
    if (start && end) return `${fmtDate(start)} – ${fmtDate(end)}`
    if (start) return `ab ${fmtDate(start)}`
    if (end) return `bis ${fmtDate(end)}`
    return '—'
  }

  async function loadBindings() {
    // Always load all to count archived
    const resAll = await window.api?.bindings.list?.({})
    if (resAll) setAllBindings(resAll.rows)
    // Load filtered list
    const res = await window.api?.bindings.list?.(showArchived ? {} : { activeOnly: true })
    if (res) setBindings(res.rows)
  }

  useEffect(() => {
    loadBindings()
    const onChanged = () => loadBindings()
    return addDataChangedListener(['earmarks', 'vouchers'], onChanged)
  }, [showArchived])

  const archivedCount = useMemo(() => allBindings.filter((b) => !b.isActive).length, [allBindings])

  const handleSaved = async () => {
    notify('success', 'Zweckbindung gespeichert')
    await loadBindings()
    await onLoadEarmarks()
    setEditBinding(null)
  }

  const visibleBindings = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return bindings
    return bindings.filter((b) => {
      const parts = [
        b.code,
        b.name,
        b.description ?? '',
        b.startDate ?? '',
        b.endDate ?? '',
        b.isActive ? 'aktiv' : 'inaktiv'
      ]
      return parts.join(' ').toLowerCase().includes(needle)
    })
  }, [bindings, q])

  const sortedVisibleBindings = visibleBindings

  async function doArchive(b: Binding) {
    const nextActive = !b.isActive
    await (window as any).api?.bindings.upsert?.({
      id: b.id,
      code: b.code,
      name: b.name,
      description: b.description ?? null,
      startDate: b.startDate ?? null,
      endDate: b.endDate ?? null,
      isActive: nextActive,
      color: b.color ?? null,
      budget: b.budget ?? null,
      enforceTimeRange: !!b.enforceTimeRange
    })
    notify('success', nextActive ? 'Zweckbindung wiederhergestellt' : 'Zweckbindung archiviert')
    setArchiveConfirm(null)
    await loadBindings()
    await onLoadEarmarks()
  }

  return (
    <>
      <div className="earmark-management-surface" style={{ padding: 12, marginBottom: 12 }}>
        <div className="management-page-heading">
          <h1>Zweckbindungen</h1>
        </div>

        <div className="management-search-toolbar">
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suche (Code, Name, Zeitraum, Beschreibung)"
            style={{ flex: '0 1 560px', minWidth: 0, width: '100%' }}
          />
          <button
            className="btn primary btn-with-icon"
            onClick={() =>
              setEditBinding({
                code: '',
                name: '',
                description: null,
                startDate: null,
                endDate: null,
                isActive: true,
                color: null,
                budget: null
              })
            }
          >
            <AppIcon icon={IconPlus} size="control" />Neu
          </button>
          <div className="helper">{sortedVisibleBindings.length} von {bindings.length}</div>
        </div>

        {editBinding && (
          <BindingModal value={editBinding} onClose={() => setEditBinding(null)} onSaved={handleSaved} />
        )}
      </div>

      {/* Usage Cards */}
      <EarmarkUsageCards
        onArchive={b => setArchiveConfirm(b as Binding)}
        bindings={sortedVisibleBindings as any}
        from={from}
        to={to}
        sphere={filterSphere}
        compact
        sortable
        onEdit={(b: any) =>
          setEditBinding({
            id: b.id,
            code: b.code,
            name: b.name,
            description: b.description ?? null,
            startDate: b.startDate ?? null,
            endDate: b.endDate ?? null,
            isActive: !!b.isActive,
            color: b.color ?? null,
            budget: b.budget ?? null,
            enforceTimeRange: b.enforceTimeRange ?? 0
          })
        }
        onGoToBookings={onGoToBookings}
      />

      {/* Archive Confirm Modal */}
      {archiveConfirm && (
        <div className="modal-overlay" onClick={() => setArchiveConfirm(null)} role="dialog" aria-modal="true">
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{archiveConfirm.isActive ? 'Zweckbindung archivieren?' : 'Zweckbindung wiederherstellen?'}</h3>
              <button className="btn ghost" onClick={() => setArchiveConfirm(null)} aria-label="Schließen"><AppIcon icon={IconX} size="control" /></button>
            </div>
            <p style={{ margin: '0 0 16px' }}>
              {archiveConfirm.isActive
                ? <>Möchtest du <strong>{archiveConfirm.code} – {archiveConfirm.name}</strong> ins Archiv verschieben? Archivierte Zweckbindungen werden standardmäßig ausgeblendet.</>
                : <>Möchtest du <strong>{archiveConfirm.code} – {archiveConfirm.name}</strong> wieder aktivieren?</>}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setArchiveConfirm(null)}>Abbrechen</button>
              <button className="btn primary btn-with-icon" onClick={() => doArchive(archiveConfirm)}>
                <AppIcon icon={archiveConfirm.isActive ? IconChevronsDown : IconChevronsUp} size="inline" />
                {archiveConfirm.isActive ? 'Archivieren' : 'Wiederherstellen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating archive toggle */}
      {archivedCount > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: 'var(--surface)',
            borderRadius: 10,
            padding: '10px 16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            zIndex: 100
          }}
          title={showArchived ? 'Archivierte ausblenden' : 'Archivierte anzeigen'}
        >
          <span style={{ color: 'var(--text-dim)' }}><AppIcon icon={IconArchive} size="action" /></span>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{archivedCount} archiviert</span>
          <label className="label-row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" className="toggle" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          </label>
        </div>
      )}
    </>
  )
}
