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
  const [editBudget, setEditBudget] = useState<BudgetEdit | null>(null)
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const fmtDate = (d?: string | null) => d ? d.slice(8,10) + '.' + d.slice(5,7) + '.' + d.slice(0,4) : '—'

  async function loadBudgets() {
    const res = await window.api?.budgets.list?.({})
    if (res) setBudgets(res.rows)
  }

  useEffect(() => {
    loadBudgets()
    const onChanged = () => loadBudgets()
    window.addEventListener('data-changed', onChanged)
    return () => window.removeEventListener('data-changed', onChanged)
  }, [])

  const handleSaved = async () => {
    notify('success', 'Budget gespeichert')
    await loadBudgets()
    setEditBudget(null)
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
                enforceTimeRange: 0
              })
            }
          >
            + Neu
          </button>
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
            {budgets.map((b) => (
              <tr key={b.id}>
                <td>{b.year}</td>
                <td>{b.name ?? '—'}</td>
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
                        enforceTimeRange: b.enforceTimeRange ?? 0
                      })
                    }
                  >
                    ✎
                  </button>
                </td>
              </tr>
            ))}
            {budgets.length === 0 && (
              <tr>
                <td colSpan={8} className="helper">
                  Keine Budgets vorhanden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Budget Tiles */}
      <BudgetTiles
        budgets={budgets}
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
            enforceTimeRange: b.enforceTimeRange ?? 0
          })
        }
        onGoToBookings={onGoToBookings}
      />

      {/* Edit Modal */}
      {editBudget && (
        <BudgetModal value={editBudget as any} onClose={() => setEditBudget(null)} onSaved={handleSaved} />
      )}
    </div>
  )
}
