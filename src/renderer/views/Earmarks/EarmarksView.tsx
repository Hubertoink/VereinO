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
  const [editBinding, setEditBinding] = useState<BindingEdit | null>(null)
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const fmtDate = (d?: string | null) => d ? d.slice(8,10) + '.' + d.slice(5,7) + '.' + d.slice(0,4) : '—'

  async function loadBindings() {
    const res = await window.api?.bindings.list?.({})
    if (res) setBindings(res.rows)
  }

  useEffect(() => {
    loadBindings()
    const onChanged = () => loadBindings()
    window.addEventListener('data-changed', onChanged)
    return () => window.removeEventListener('data-changed', onChanged)
  }, [])

  const handleSaved = async () => {
    notify('success', 'Zweckbindung gespeichert')
    await loadBindings()
    await onLoadEarmarks()
    setEditBinding(null)
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
            {bindings.map((b) => (
              <tr key={b.id}>
                <td>{b.code}</td>
                <td>{b.name}</td>
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
            {bindings.length === 0 && (
              <tr>
                <td colSpan={7} className="helper">
                  Keine Zweckbindungen vorhanden.
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
    </>
  )
}
