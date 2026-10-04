import { getDb } from '../db/database'
import { getSetting } from './settings'
import { listBackups } from './backup'
import { getMemberPaymentStatuses, type MemberPaymentStatusInput } from '../repositories/members_payments'
import { assignmentMonthly } from '../repositories/assignmentMonthly'
import { advanceRecurringSchedule, type RecurringFrequency } from '../../../shared/recurrence'
import { recurringGrossAmount } from '../../../shared/recurringMatching'
import type { DashboardTasks, DashboardTaskGroup, DashboardTaskItem, DashboardTaskKind, DashboardTaskLevel } from '../../../shared/dashboardTasks'

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const dateLabel = (date: string) => date.slice(0, 10).split('-').reverse().join('.')
export const taskDaysBetween = (today: string, date: string) => Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date.slice(0, 10)}T00:00:00Z`)) / 86400000))
export function bankReminderDays(value: unknown) {
  const days = Number(value)
  return value == null || !Number.isInteger(days) || days < 0 || days > 365 ? 14 : days
}
const rank: Record<DashboardTaskLevel, number> = { urgent: 0, soon: 1, open: 2, clear: 3 }

function group(kind: DashboardTaskKind, title: string, items: DashboardTaskItem[], value?: string, detail?: string, count = items.length): DashboardTaskGroup {
  const sorted = [...items].sort((a, b) => rank[a.level] - rank[b.level])
  return { kind, title, items: sorted.slice(0, 10), count, value: value || `${count} offen`, detail: detail || (count ? 'Vorgänge prüfen' : 'Nichts offen'), level: sorted[0]?.level || 'clear', target: { kind, filter: sorted.some(item => item.level === 'urgent') ? 'overdue' : 'open' } }
}

export async function getDashboardTasks(today: string): Promise<DashboardTasks> {
  const db = getDb()
  const soon = new Date(`${today}T00:00:00Z`)
  soon.setUTCDate(soon.getUTCDate() + 7)
  const soonDate = soon.toISOString().slice(0, 10)
  const deadline = new Date(`${today}T00:00:00Z`)
  deadline.setUTCDate(deadline.getUTCDate() + 30)
  const deadlineDate = deadline.toISOString().slice(0, 10)
  const groups: DashboardTaskGroup[] = []

  const accounts = db.prepare(`SELECT pa.id, pa.name,
    (SELECT MAX(b.created_at) FROM bank_import_batches b WHERE b.payment_account_id=pa.id AND b.imported_count>0) AS lastImportAt,
    (SELECT MAX(t.booking_date) FROM bank_transactions t WHERE t.payment_account_id=pa.id) AS lastBookingDate,
    (SELECT COUNT(*) FROM bank_transactions t WHERE t.payment_account_id=pa.id AND t.status='OPEN') AS openCount
    FROM payment_accounts pa WHERE pa.is_active=1 AND pa.kind<>'CASH' ORDER BY pa.sort_order, pa.id`).all() as Array<Omit<DashboardTasks['bankAccounts'][number], 'reminderDays'>>
  const bankAccounts = accounts.map(account => ({ ...account, openCount: Number(account.openCount), reminderDays: bankReminderDays(getSetting(`dashboard.bankReminderDays.${account.id}`)) }))
  const bankItems: DashboardTaskItem[] = []
  for (const account of bankAccounts) {
    const age = account.lastImportAt ? taskDaysBetween(today, account.lastImportAt) : null
    if (account.reminderDays && (age == null || age >= account.reminderDays)) bankItems.push({ id: `bank-import-${account.id}`, title: account.name, detail: `${age == null ? 'Noch kein Import mit neuen Umsätzen' : `Letzter Import vor ${age} Tagen`} · ${account.lastBookingDate ? `Umsätze bis ${dateLabel(account.lastBookingDate)}` : 'Noch keine Bankumsätze'}`, level: 'soon', target: { kind: 'bank', accountId: account.id } })
    if (account.openCount) bankItems.push({ id: `bank-open-${account.id}`, title: account.name, detail: `${account.openCount} Bankbelege noch zuzuordnen`, level: 'open', target: { kind: 'bank', accountId: account.id, filter: 'open' } })
  }
  const bankOpen = bankAccounts.reduce((sum, account) => sum + account.openCount, 0)
  const stale = bankItems.filter(item => item.level === 'soon').length
  groups.push(group('bank', 'Bankimport', bankItems, stale ? `${stale} ${stale === 1 ? 'Konto prüfen' : 'Konten prüfen'}` : bankOpen ? `${bankOpen} Belege offen` : 'Aktuell', `${bankOpen} Bankbelege zuzuordnen`, bankItems.length))

  const members = db.prepare(`SELECT id, name, contribution_interval, contribution_amount, next_due_date, join_date, leave_date
    FROM members WHERE contribution_amount>0 AND contribution_interval IS NOT NULL AND (status='ACTIVE' OR (?=1 AND status='PAUSED')) ORDER BY name`).all(getSetting('membership.includePaused') ? 1 : 0) as Array<MemberPaymentStatusInput & { name: string }>
  const statuses = getMemberPaymentStatuses(members)
  let memberTotal = 0, periods = 0
  const memberItems: DashboardTaskItem[] = []
  for (const member of members) {
    const status = statuses.get(member.id)
    const count = status && 'overdue' in status ? Number(status.overdue || 0) : 0
    if (!count) continue
    const amount = Math.round(count * Number(member.contribution_amount) * 100) / 100
    memberTotal += amount; periods += count
    memberItems.push({ id: `member-${member.id}`, title: member.name, detail: `${count} offene Beitragszeiträume`, amount, level: 'urgent', target: { kind: 'members', id: member.id, filter: 'overdue' } })
  }
  groups.push(group('members', 'Mitgliedsbeiträge', memberItems, `${memberItems.length} ${memberItems.length === 1 ? 'Mitglied' : 'Mitglieder'}`, `${eur.format(memberTotal)} · ${periods} offene Beitragszeiträume`))

  const invoices = db.prepare(`SELECT i.id, i.party, i.due_date AS dueDate, COALESCE(i.voucher_type,'OUT') AS type,
    MAX(0, i.gross_amount-COALESCE(SUM(p.amount),0)) AS remaining
    FROM invoices i LEFT JOIN invoice_payments p ON p.invoice_id=i.id GROUP BY i.id HAVING remaining>0.000001
    ORDER BY COALESCE(i.due_date,'9999-12-31'), i.id`).all() as Array<{ id: number; party: string; dueDate: string | null; type: string; remaining: number }>
  for (const [kind, title, direction] of [['invoices', 'Verbindlichkeiten', 'OUT'], ['receivables', 'Offene Forderungen', 'IN']] as const) {
    const rows = invoices.filter(row => row.type === direction)
    const items = rows.map(row => ({ id: `invoice-${row.id}`, title: row.party || 'Ohne Gegenpartei', detail: row.dueDate ? `Fällig am ${dateLabel(row.dueDate)}` : 'Ohne Fälligkeit', amount: row.remaining, level: row.dueDate && row.dueDate < today ? 'urgent' as const : row.dueDate && row.dueDate <= soonDate ? 'soon' as const : 'open' as const, target: { kind, filter: row.dueDate && row.dueDate < today ? 'overdue' as const : 'open' as const, id: row.id } }))
    const overdue = items.filter(item => item.level === 'urgent').length
    const amount = rows.reduce((sum, row) => sum + row.remaining, 0)
    groups.push(group(kind, title, items, overdue ? `${overdue} überfällig` : `${rows.length} offen`, `${eur.format(amount)} ${direction === 'OUT' ? 'zu zahlen' : 'zu erhalten'}`))
  }

  const recurring = db.prepare(`SELECT id, name, type, status, amount, amount_mode AS amountMode, vat_rate AS vatRate, variable_amount AS variableAmount,
    frequency, anchor_day AS anchorDay, next_due_date AS nextDueDate, end_date AS endDate FROM recurring_bookings ORDER BY name`).all() as Array<{ id: number; name: string; type: string; status: string; amount: number; amountMode: 'NET' | 'GROSS'; vatRate: number; variableAmount: number; frequency: RecurringFrequency; anchorDay: number; nextDueDate: string; endDate: string | null }>
  const occurrences = db.prepare(`SELECT recurring_booking_id AS recurringId, scheduled_date AS date, status FROM recurring_occurrences WHERE scheduled_date<=? ORDER BY scheduled_date`).all(soonDate) as Array<{ recurringId: number; date: string; status: string }>
  const recurringItems: DashboardTaskItem[] = []
  for (const row of recurring) {
    const existing = occurrences.filter(item => item.recurringId === row.id)
    const dates = new Set(existing.filter(item => item.status === 'DUE').map(item => item.date))
    if (row.status === 'ACTIVE') {
      const schedule = advanceRecurringSchedule({ ...row, throughDate: soonDate })
      schedule.dueDates.forEach(date => { if (!existing.some(item => item.date === date && item.status !== 'DUE')) dates.add(date) })
    }
    for (const date of [...dates].sort()) recurringItems.push({ id: `recurring-${row.id}-${date}`, title: row.name, detail: `${date < today ? 'Überfällige Buchung' : date === today ? 'Heute fällig' : 'Anstehende Buchung'} · ${dateLabel(date)}${row.variableAmount ? ' · variabler Betrag' : ''}`, amount: row.variableAmount ? undefined : recurringGrossAmount(row.amountMode, row.amount, row.vatRate), level: date < today ? 'urgent' : 'soon', target: { kind: 'recurring', id: row.id } })
    if (row.status === 'ACTIVE' && row.endDate && row.endDate <= deadlineDate) recurringItems.push({ id: `recurring-end-${row.id}`, title: row.name, detail: `Laufzeit ${row.endDate < today ? 'abgelaufen' : 'endet'} am ${dateLabel(row.endDate)}`, level: row.endDate < today ? 'urgent' : 'soon', target: { kind: 'recurring', id: row.id } })
  }
  const recurringDue = recurringItems.filter(item => item.id.startsWith('recurring-') && !item.id.startsWith('recurring-end-') && item.level === 'urgent').length
  groups.push(group('recurring', 'Abos', recurringItems, recurringDue ? `${recurringDue} überfällig` : `${recurringItems.length} zu prüfen`, 'Fällige Buchungen (7 Tage) · Laufzeitenden (30 Tage)'))

  const reimbursements = db.prepare(`SELECT r.id, r.title, r.due_date AS dueDate,
    MAX(0, COALESCE(SUM(CASE WHEN l.role='EXPENSE' THEN l.amount_cents ELSE -l.amount_cents END),0))/100.0 AS remaining
    FROM reimbursements r LEFT JOIN reimbursement_links l ON l.reimbursement_id=r.id GROUP BY r.id HAVING remaining>0 ORDER BY r.due_date, r.id`).all() as Array<{ id: number; title: string; dueDate: string | null; remaining: number }>
  groups.push(group('reimbursements', 'Kostenerstattungen', reimbursements.map(row => ({ id: `reimbursement-${row.id}`, title: row.title, detail: row.dueDate ? `Fällig am ${dateLabel(row.dueDate)}` : 'Erstattung noch offen', amount: row.remaining, level: row.dueDate && row.dueDate < today ? 'urgent' : 'open', target: { kind: 'reimbursements', id: row.id } })), undefined, `${eur.format(reimbursements.reduce((sum, row) => sum + row.remaining, 0))} offen`))
  const advances = db.prepare(`SELECT id, recipient_name AS name, issued_at AS issuedAt, amount FROM member_advances WHERE COALESCE(resolved_at,'')='' ORDER BY issued_at`).all() as Array<{ id: number; name: string; issuedAt: string; amount: number }>
  groups.push(group('advances', 'Vorschüsse', advances.map(row => ({ id: `advance-${row.id}`, title: row.name, detail: `Seit ${dateLabel(row.issuedAt)} noch nicht abgeschlossen`, amount: row.amount, level: 'open', target: { kind: 'advances', id: row.id } })), undefined, 'Abrechnungen abschließen'))
  const submissions = db.prepare(`SELECT id, description, submitted_by AS submittedBy FROM submissions WHERE status='pending' ORDER BY id`).all() as Array<{ id: number; description: string; submittedBy: string }>
  groups.push(group('submissions', 'Einreichungen', submissions.map(row => ({ id: `submission-${row.id}`, title: row.description || `Einreichung #${row.id}`, detail: row.submittedBy || 'Noch zu prüfen', level: 'open', target: { kind: 'submissions', id: row.id } }))))
  const jobs = db.prepare(`SELECT id, title, status FROM ai_jobs WHERE type='BOOKING_FROM_DOCUMENTS' AND status IN ('NEEDS_REVIEW','FAILED') ORDER BY id`).all() as Array<{ id: number; title: string; status: string }>
  groups.push(group('ai', 'Belegprüfung', jobs.map(row => ({ id: `ai-${row.id}`, title: row.title || `Beleg #${row.id}`, detail: row.status === 'FAILED' ? 'Verarbeitung fehlgeschlagen' : 'Entwurf zur Prüfung bereit', level: 'open', target: { kind: 'ai', id: row.id } }))))

  for (const [kind, table, active, planned] of [['budgets', 'budgets', 'is_archived=0', 'amount_planned'], ['bindings', 'earmarks', 'is_active=1', 'budget']] as const) {
    const definitions = db.prepare(`SELECT id, name, start_date AS startDate, end_date AS endDate, ${planned} AS planned FROM ${table} WHERE ${active} AND (start_date IS NULL OR start_date<=?) ORDER BY end_date, id`).all(today) as Array<{ id: number; name: string; startDate: string | null; endDate: string | null; planned: number }>
    const items: DashboardTaskItem[] = []
    for (const row of definitions) {
      const monthly = assignmentMonthly(kind === 'budgets' ? 'budget' : 'earmark', row.id, { from: row.startDate || undefined, to: row.endDate && row.endDate < today ? row.endDate : today })
      const remaining = Math.round((Number(row.planned || 0) + monthly.reduce((sum, month) => sum + month.inflow - month.spent, 0)) * 100) / 100
      if (Number(row.planned || 0) > 0 && remaining < -0.005) items.push({ id: `${kind}-over-${row.id}`, title: row.name || `#${row.id}`, detail: 'Budget überschritten', amount: -remaining, level: 'urgent', target: { kind, id: row.id } })
      if (row.endDate && row.endDate <= deadlineDate && remaining > 0.005) items.push({ id: `${kind}-end-${row.id}`, title: row.name || `#${row.id}`, detail: `${row.endDate < today ? 'Zeitraum abgelaufen' : 'Zeitraum endet'} am ${dateLabel(row.endDate)} · Restmittel`, amount: remaining, level: row.endDate < today ? 'urgent' : 'soon', target: { kind, id: row.id } })
    }
    groups.push(group(kind, kind === 'budgets' ? 'Budgets' : 'Zweckbindungen', items))
  }

  const interval = Math.max(1, Number(getSetting('backup.intervalDays') || 7))
  const { backups } = await listBackups()
  const latest = backups.find(backup => backup.size > 0)
  const lastDate = latest ? new Date(latest.mtime).toISOString().slice(0, 10) : null
  const backupItems: DashboardTaskItem[] = !lastDate || taskDaysBetween(today, lastDate) >= interval ? [{ id: 'backup', title: 'Datensicherung', detail: lastDate ? `Letzte vorhandene Sicherung vom ${dateLabel(lastDate)}` : 'Noch keine Sicherung vorhanden', level: 'soon', target: { kind: 'backup' } }] : []
  groups.push(group('backup', 'Datensicherung', backupItems, latest ? `Vor ${taskDaysBetween(today, lastDate!)} Tagen` : 'Noch keine', `Erinnerung nach ${interval} Tagen`))
  return { today, groups, bankAccounts }
}
