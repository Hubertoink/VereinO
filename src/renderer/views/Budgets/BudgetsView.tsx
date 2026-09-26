import React, { useEffect, useMemo, useState } from 'react'
import { IconArchive, IconChevronLeft, IconChevronRight, IconChevronsDown, IconChevronsLeft, IconChevronsRight, IconChevronsUp, IconPencil, IconPlus, IconX } from '@tabler/icons-react'
import AppIcon from '../../components/common/AppIcon'
import { addDataChangedListener } from '../../utils/refresh'
import BudgetTiles from '../../components/tiles/BudgetTiles'
import BudgetModal from '../../components/modals/BudgetModal'

type Budget = {
  id: number
  year: number
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  primaryClassificationValueId?: number | null
  primaryClassificationName?: string | null
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
  primaryClassificationValueId?: number | null
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
  const formatRange = (start?: string | null, end?: string | null) => {
    if (start && end) return `${fmtDate(start)} – ${fmtDate(end)}`
    if (start) return `ab ${fmtDate(start)}`
    if (end) return `bis ${fmtDate(end)}`
    return '—'
  }

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
    return addDataChangedListener(['budgets', 'vouchers'], onChanged)
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

  const sortedVisibleBudgets = visibleBudgets

  async function doArchive(b: Budget) {
    const nextArchived = !b.isArchived
    await (window as any).api?.budgets.upsert?.({
      id: b.id,
      year: b.year,
      sphere: b.sphere,
      primaryClassificationValueId: b.primaryClassificationValueId ?? null,
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
      <div className="budget-management-surface" style={{ padding: 12 }}>
        <div className="management-page-heading">
          <h1>Budgets</h1>
        </div>

        <div className="management-search-toolbar">
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suche (Name, Kategorie, Projekt, Jahr, Zeitraum)"
            style={{ flex: '0 1 560px', minWidth: 0, width: '100%' }}
          />
          <button
            className="btn primary btn-with-icon"
            onClick={() =>
              setEditBudget({
                year: new Date().getFullYear(),
      sphere: 'IDEELL',
      primaryClassificationValueId: null,
                amountPlanned: 0,
                categoryId: null,
                projectId: null,
                earmarkId: null,
                isArchived: 0,
                enforceTimeRange: 0
              })
            }
          >
            <AppIcon icon={IconPlus} size="control" />Neu
          </button>
          <div className="helper">{sortedVisibleBudgets.length} von {budgets.length}</div>
        </div>

      </div>

      {/* Budget Tiles */}
      <BudgetTiles
        onArchive={b => setArchiveConfirm(b as Budget)}
        budgets={sortedVisibleBudgets}
        eurFmt={eurFmt}
        compact
        sortable
        onEdit={(b) =>
          setEditBudget({
            id: b.id,
            year: b.year,
            sphere: b.sphere,
            primaryClassificationValueId: b.primaryClassificationValueId ?? null,
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
              <button className="btn ghost" onClick={() => setArchiveConfirm(null)} aria-label="Schließen"><AppIcon icon={IconX} size="control" /></button>
            </div>
            <p style={{ margin: '0 0 16px' }}>
              {archiveConfirm.isArchived
                ? <>Möchtest du <strong>{archiveConfirm.name || `#${archiveConfirm.id}`}</strong> wieder aktivieren?</>
                : <>Möchtest du <strong>{archiveConfirm.name || `#${archiveConfirm.id}`}</strong> ins Archiv verschieben? Archivierte Budgets werden standardmäßig ausgeblendet.</>}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setArchiveConfirm(null)}>Abbrechen</button>
              <button className="btn primary btn-with-icon" onClick={() => doArchive(archiveConfirm)}>
                <AppIcon icon={archiveConfirm.isArchived ? IconChevronsUp : IconChevronsDown} size="inline" />
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
    </div>
  )
}
