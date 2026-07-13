export type DashboardSnapshotInput = {
  from: string
  to: string
  openingTo?: string
  today: string
}

export type DashboardFinancialSummary = {
  inGross: number
  outGross: number
  diff: number
}

export type DashboardSnapshot = {
  financial: DashboardFinancialSummary
  openingSaldo: number
  years: number[]
  organization: {
    cashier: string
    logoDataUrl: string
  }
  members: {
    total: number
    active: number
    new: number
    paused: number
    left: number
  }
  invoices: {
    open: { count: number; remaining: number }
    dueSoon: { count: number; remaining: number }
    overdue: { count: number; remaining: number }
    topDue: Array<{ id: number; party: string; dueDate: string | null; remaining: number }>
  }
  tasks: {
    bankOpenCount: number
    bankImportStatus: {
      lastBookingDate: string | null
      lastImportAt: string | null
      total: number
    }
    dueMembershipFees: { dueMembers: number; duePeriods: number }
    pendingSubmissions: number
  }
  activeBudgets: Array<{
    id: number
    name: string | null
    amountPlanned: number
    sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    startDate: string | null
    endDate: string | null
    color: string | null
  }>
  activeEarmarks: Array<{
    id: number
    code: string
    name: string
    endDate: string | null
    color: string | null
  }>
}
