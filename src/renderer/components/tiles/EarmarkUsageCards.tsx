import React from 'react'
import AssignmentOverview from '../finance/AssignmentOverview'

export interface EarmarkUsageCardBinding {
  id: number
  code: string
  name: string
  description?: string | null
  color?: string | null
  budget?: number | null
  startDate?: string | null
  endDate?: string | null
  enforceTimeRange?: number
  isActive?: number | boolean
}

export interface EarmarkUsageCardsProps {
  bindings: EarmarkUsageCardBinding[]
  from?: string
  to?: string
  sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  onArchive?: (b: EarmarkUsageCardBinding) => void
  onEdit?: (b: EarmarkUsageCardBinding) => void
  onGoToBookings?: (earmarkId: number) => void
  revision?: number
  sortable?: boolean
  compact?: boolean
}

export default function EarmarkUsageCards({ bindings, from, to, sphere, onEdit, onArchive, onGoToBookings, compact = true, sortable, revision }: EarmarkUsageCardsProps) {
  return <AssignmentOverview kind="earmark" compact={compact} sortable={sortable} from={from} to={to} sphere={sphere} revision={revision}
    definitions={bindings.map(b => ({ id: b.id, name: b.name, caption: b.code, plan: b.budget || 0, color: b.color, startDate: b.startDate, endDate: b.endDate, archived: b.isActive === 0 || b.isActive === false, locked: !!b.enforceTimeRange, description: b.description }))}
    onArchive={onArchive ? id => { const b = bindings.find(row => row.id === id); if (b) onArchive(b) } : undefined}
    onEdit={onEdit ? id => { const b = bindings.find(row => row.id === id); if (b) onEdit(b) } : undefined} onBookings={onGoToBookings} />
}
