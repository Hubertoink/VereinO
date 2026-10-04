export type DashboardTaskKind = 'bank' | 'members' | 'invoices' | 'receivables' | 'recurring' | 'reimbursements' | 'advances' | 'submissions' | 'drafts' | 'budgets' | 'bindings' | 'backup' | 'ai'
export type DashboardTaskLevel = 'urgent' | 'soon' | 'open' | 'clear'
export type DashboardTaskTarget = { kind: DashboardTaskKind; accountId?: number; filter?: 'overdue' | 'open' | 'upcoming'; id?: number }
export type DashboardTaskItem = {
  id: string; title: string; detail: string; level: Exclude<DashboardTaskLevel, 'clear'>;
  amount?: number; target: DashboardTaskTarget
}
export type DashboardTaskGroup = {
  kind: DashboardTaskKind; title: string; value: string; detail: string; level: DashboardTaskLevel;
  count: number; items: DashboardTaskItem[]; target: DashboardTaskTarget
}
export type DashboardTasks = {
  today: string; groups: DashboardTaskGroup[];
  bankAccounts: Array<{ id: number; name: string; reminderDays: number; lastImportAt: string | null; lastBookingDate: string | null; openCount: number }>
}
