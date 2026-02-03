import React, { useEffect, useMemo, useState } from 'react'
import BudgetTiles from '../../components/tiles/BudgetTiles'
import BudgetModal from '../../components/modals/BudgetModal'

type Budget = {
  id: number
  year: number
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  categoryId: number | null
  projectId: number | null
  earmarkId: number | null
  amountPlanned: number
  name?: string | null
  categoryName?: string | null
  projectName?: string | null
  startDate?: string | null
  endDate?: string | null
  color?: string | null
  isArchived?: number
  enforceTimeRange?: number
}

type BudgetEdit = {
  id?: number
  year: number
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  categoryId?: number | null
  projectId?: number | null
  earmarkId?: number | null
  amountPlanned: number
  name?: string | null
  categoryName?: string | null
  projectName?: string | null
  startDate?: string | null
  endDate?: string | null
  color?: string | null
  isArchived?: number
  enforceTimeRange?: number
}

export default function BudgetsView({
  onGoToBookings,
  notify
}: {
  onGoToBookings: (budgetId: number) => void
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
}) {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [allBudgets, setAllBudgets] = useState<Budget[]>([])
  const [editBudget, setEditBudget] = useState<BudgetEdit | null>(null)
  const [archiveConfirm, setArchiveConfirm] = useState<Budget | null>(null)
  const [q, setQ] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const fmtDate = (d?: string | null) => d ? d.slice(8,10) + '.' + d.slice(5,7) + '.' + d.slice(0,4) : '—'

  async function loadBudgets() {
    // Always load all to know archive count
    const resAll = await window.api?.budgets.list?.({ includeArchived: true })
    if (resAll) setAllBudgets(resAll.rows)
    // Load filtered list
    const payload = showArchived ? { includeArchived: true } : {}
    const res = await window.api?.budgets.list?.(payload as any)
    if (res) setBudgets(res.rows)
  }

  useEffect(() => {
    loadBudgets()
    const onChanged = () => loadBudgets()
    window.addEventListener('data-changed', onChanged)
    return () => window.removeEventListener('data-changed', onChanged)
  }, [showArchived])

  const archivedCount = useMemo(() => allBudgets.filter((b) => b.isArchived).length, [allBudgets])

  const handleSaved = async () => {
    notify('success', 'Budget gespeichert')
    await loadBudgets()
    setEditBudget(null)
  }

  const visibleBudgets = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return budgets
    return budgets.filter((b) => {
      const parts = [
        String(b.year),
        b.name ?? '',
        b.categoryName ?? '',
        b.projectName ?? '',
        b.startDate ?? '',
        b.endDate ?? ''
      ]
      return parts.join(' ').toLowerCase().includes(needle)
    })
  }, [budgets, q])

  async function doArchive(b: Budget) {
    const nextArchived = !b.isArchived
    await (window as any).api?.budgets.upsert?.({
      id: b.id,
      year: b.year,
      sphere: b.sphere,
      amountPlanned: b.amountPlanned,
      name: b.name ?? null,
      categoryName: b.categoryName ?? null,
      projectName: b.projectName ?? null,
      startDate: b.startDate ?? null,
      endDate: b.endDate ?? null,
      color: b.color ?? null,
      isArchived: nextArchived,
      categoryId: b.categoryId ?? null,
      projectId: b.projectId ?? null,
      earmarkId: b.earmarkId ?? null,
      enforceTimeRange: !!b.enforceTimeRange
    })
    notify('success', nextArchived ? 'Budget archiviert' : 'Budget wiederhergestellt')
    setArchiveConfirm(null)
    await loadBudgets()
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="helper">Budgets verwalten und Fortschritt verfolgen</div>
          <button
            className="btn primary"
            onClick={() =>
              setEditBudget({
                year: new Date().getFullYear(),
                sphere: 'IDEELL',
                amountPlanned: 0,
                categoryId: null,
                projectId: null,
                earmarkId: null,
                isArchived: 0,
                enforceTimeRange: 0
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
            placeholder="Suche (Name, Kategorie, Projekt, Jahr, Zeitraum)"
            style={{ flex: 1, minWidth: 260 }}
          />
          <div className="helper">{visibleBudgets.length} von {budgets.length}</div>
        </div>

        {/* Simple table */}
        <table cellPadding={6} style={{ marginTop: 8, width: '100%' }}>
          <thead>
            <tr>
              <th align="left">Jahr</th>
              <th align="left">Name</th>
              <th align="left">Kategorie</th>
              <th align="left">Projekt</th>
              <th align="left">Zeitraum</th>
              <th align="left">Farbe</th>
              <th align="right">Budget</th>
              <th align="center">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {visibleBudgets.map((b) => (
              <tr key={b.id} style={b.isArchived ? { opacity: 0.5 } : undefined}>
                <td>{b.year}</td>
                <td>{b.name ?? '—'}{b.isArchived ? <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-dim)' }}>(archiviert)</span> : null}</td>
                <td>{b.categoryName ?? '—'}</td>
                <td>{b.projectName ?? '—'}</td>
                <td>
                  {fmtDate(b.startDate)} – {fmtDate(b.endDate)}
                </td>
                <td>
                  {b.color ? (
                    <span
                      title={b.color}
                      style={{
                        display: 'inline-block',
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        background: b.color
                      }}
                    />
                  ) : (
                    '—'
                  )}
                </td>
                <td align="right">{eurFmt.format(b.amountPlanned)}</td>
                <td align="center" style={{ whiteSpace: 'nowrap' }}>
                  <button
                    className="btn"
                    onClick={() => setArchiveConfirm(b)}
                    title={b.isArchived ? 'Wiederherstellen' : 'Archivieren'}
                    style={{ marginRight: 6 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {b.isArchived
                        ? <><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></>
                        : <><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></>}
                    </svg>
                  </button>
                  <button
                    className="btn btn-edit"
                    onClick={() =>
                      setEditBudget({
                        id: b.id,
                        year: b.year,
                        sphere: b.sphere,
                        categoryId: b.categoryId ?? null,
                        projectId: b.projectId ?? null,
                        earmarkId: b.earmarkId ?? null,
                        amountPlanned: b.amountPlanned,
                        name: b.name ?? null,
                        categoryName: b.categoryName ?? null,
                        projectName: b.projectName ?? null,
                        startDate: b.startDate ?? null,
                        endDate: b.endDate ?? null,
                        color: b.color ?? null,
                        isArchived: b.isArchived ?? 0,
                        enforceTimeRange: b.enforceTimeRange ?? 0
                      })
                    }
                  >
                    ✎
                  </button>
                </td>
              </tr>
            ))}
            {visibleBudgets.length === 0 && (
              <tr>
                <td colSpan={8} className="helper">
                  Keine Budgets gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Budget Tiles */}
      <BudgetTiles
        budgets={visibleBudgets}
        eurFmt={eurFmt}
        onEdit={(b) =>
          setEditBudget({
            id: b.id,
            year: b.year,
            sphere: b.sphere,
            categoryId: b.categoryId ?? null,
            projectId: b.projectId ?? null,
            earmarkId: b.earmarkId ?? null,
            amountPlanned: b.amountPlanned,
            name: b.name ?? null,
            categoryName: b.categoryName ?? null,
            projectName: b.projectName ?? null,
            startDate: b.startDate ?? null,
            endDate: b.endDate ?? null,
            color: b.color ?? null,
            isArchived: (b as any).isArchived ?? 0,
            enforceTimeRange: b.enforceTimeRange ?? 0
          })
        }
        onGoToBookings={onGoToBookings}
      />

      {/* Edit Modal */}
      {editBudget && (
        <BudgetModal value={editBudget as any} onClose={() => setEditBudget(null)} onSaved={handleSaved} />
      )}

      {/* Archive Confirm Modal */}
      {archiveConfirm && (
        <div className="modal-overlay" onClick={() => setArchiveConfirm(null)} role="dialog" aria-modal="true">
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{archiveConfirm.isArchived ? 'Budget wiederherstellen?' : 'Budget archivieren?'}</h3>
              <button className="btn ghost" onClick={() => setArchiveConfirm(null)}>✕</button>
            </div>
            <p style={{ margin: '0 0 16px' }}>
              {archiveConfirm.isArchived
                ? <>Möchtest du <strong>{archiveConfirm.name || `#${archiveConfirm.id}`}</strong> wieder aktivieren?</>
                : <>Möchtest du <strong>{archiveConfirm.name || `#${archiveConfirm.id}`}</strong> ins Archiv verschieben? Archivierte Budgets werden standardmäßig ausgeblendet.</>}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setArchiveConfirm(null)}>Abbrechen</button>
              <button className="btn primary" onClick={() => doArchive(archiveConfirm)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {archiveConfirm.isArchived
                    ? <><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></>
                    : <><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></>}
                </svg>
                {archiveConfirm.isArchived ? 'Wiederherstellen' : 'Archivieren'}
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
    </div>
  )
}
