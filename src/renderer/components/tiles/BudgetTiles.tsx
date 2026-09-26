import React from 'react'
import AssignmentOverview from '../finance/AssignmentOverview'

export interface BudgetTileBudget {
  id: number
  year: number
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  primaryClassificationValueId?: number | null
  primaryClassificationName?: string | null
  amountPlanned: number
  name?: string | null
  categoryName?: string | null
  projectName?: string | null
  startDate?: string | null
  endDate?: string | null
  color?: string | null
  isArchived?: number
  categoryId?: number | null
  projectId?: number | null
  earmarkId?: number | null
  enforceTimeRange?: number
}

export default function BudgetTiles({ budgets, compact = true, onEdit, onArchive, onGoToBookings, sortable, from, to, revision }: { budgets: BudgetTileBudget[]; eurFmt?: Intl.NumberFormat; compact?: boolean; sortable?: boolean; onArchive?: (b: BudgetTileBudget) => void; onEdit?: (b: BudgetTileBudget) => void; onGoToBookings?: (id: number) => void; from?: string; to?: string; revision?: number }) {
  return <AssignmentOverview kind="budget" compact={compact} sortable={sortable} from={from} to={to} revision={revision}
    definitions={budgets.map(b => ({ id: b.id, name: b.name || b.categoryName || b.projectName || `Budget ${b.year}`, caption: String(b.year), plan: b.amountPlanned, color: b.color, startDate: b.startDate, endDate: b.endDate, archived: !!b.isArchived, locked: !!b.enforceTimeRange, category: b.categoryName, project: b.projectName }))}
    onArchive={onArchive ? id => { const b = budgets.find(row => row.id === id); if (b) onArchive(b) } : undefined}
    onEdit={onEdit ? id => { const b = budgets.find(row => row.id === id); if (b) onEdit(b) } : undefined} onBookings={onGoToBookings} />
}
