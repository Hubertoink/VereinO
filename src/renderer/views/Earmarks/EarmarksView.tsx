import React, { useEffect, useMemo, useState } from 'react'
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
    window.addEventListener('data-changed', onChanged)
    return () => window.removeEventListener('data-changed', onChanged)
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
      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="helper">Zweckbindungen verwalten</div>
          <button
            className="btn primary"
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
            + Neu
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suche (Code, Name, Zeitraum, Beschreibung)"
            style={{ flex: 1, minWidth: 260 }}
          />
          <div className="helper">{visibleBindings.length} von {bindings.length}</div>
        </div>

        <table cellPadding={6} style={{ marginTop: 8, width: '100%' }}>
          <thead>
            <tr>
              <th align="left">Code</th>
              <th align="left">Name</th>
              <th align="left">Zeitraum</th>
              <th align="left">Status</th>
              <th align="right">Budget</th>
              <th align="left">Farbe</th>
              <th align="center">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {visibleBindings.map((b) => (
              <tr key={b.id} style={!b.isActive ? { opacity: 0.5 } : undefined}>
                <td>{b.code}</td>
                <td>{b.name}{!b.isActive ? <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-dim)' }}>(archiviert)</span> : null}</td>
                <td>
                  {fmtDate(b.startDate)} – {fmtDate(b.endDate)}
                </td>
                <td>{b.isActive ? 'aktiv' : 'inaktiv'}</td>
                <td align="right">{b.budget != null ? eurFmt.format(b.budget) : '—'}</td>
                <td>
                  {b.color ? (
                    <span
                      title={b.color}
                      style={{
                        display: 'inline-block',
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: b.color,
                        verticalAlign: 'middle'
                      }}
                    />
                  ) : (
                    '—'
                  )}
                </td>
                <td align="center" style={{ whiteSpace: 'nowrap' }}>
                  <button
                    className="btn"
                    onClick={() => setArchiveConfirm(b)}
                    title={b.isActive ? 'Archivieren' : 'Wiederherstellen'}
                    style={{ marginRight: 6 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {b.isActive
                        ? <><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></>
                        : <><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></>}
                    </svg>
                  </button>
                  <button
                    className="btn btn-edit"
                    onClick={() =>
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
                  >
                    ✎
                  </button>
                </td>
              </tr>
            ))}
            {visibleBindings.length === 0 && (
              <tr>
                <td colSpan={7} className="helper">
                  Keine Zweckbindungen gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {editBinding && (
          <BindingModal value={editBinding} onClose={() => setEditBinding(null)} onSaved={handleSaved} />
        )}
      </div>

      {/* Usage Cards */}
      <EarmarkUsageCards
        bindings={bindings as any}
        from={from}
        to={to}
        sphere={filterSphere}
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
              <button className="btn ghost" onClick={() => setArchiveConfirm(null)}>✕</button>
            </div>
            <p style={{ margin: '0 0 16px' }}>
              {archiveConfirm.isActive
                ? <>Möchtest du <strong>{archiveConfirm.code} – {archiveConfirm.name}</strong> ins Archiv verschieben? Archivierte Zweckbindungen werden standardmäßig ausgeblendet.</>
                : <>Möchtest du <strong>{archiveConfirm.code} – {archiveConfirm.name}</strong> wieder aktivieren?</>}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setArchiveConfirm(null)}>Abbrechen</button>
              <button className="btn primary" onClick={() => doArchive(archiveConfirm)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {archiveConfirm.isActive
                    ? <><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></>
                    : <><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></>}
                </svg>
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
            background: 'var(--card)',
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="21 8 21 21 3 21 3 8"/>
            <rect x="1" y="3" width="22" height="5"/>
            <line x1="10" y1="12" x2="14" y2="12"/>
          </svg>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{archivedCount} archiviert</span>
          <label className="label-row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" className="toggle" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          </label>
        </div>
      )}
    </>
  )
}
