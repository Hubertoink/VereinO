import Database from 'better-sqlite3'
import { advanceRecurringSchedule, localIsoDate, type RecurringFrequency } from '../../../shared/recurrence'

type DB = InstanceType<typeof Database>

function materializeRows(d: DB, rows: Array<{ id: number; anchorDay: number; nextDueDate: string; endDate: string | null; frequency: RecurringFrequency }>, throughDate: string) {
  const insert = d.prepare(`
    INSERT OR IGNORE INTO recurring_occurrences(recurring_booking_id, scheduled_date, status)
    VALUES (?, ?, 'DUE')
  `)
  const advance = d.prepare(`UPDATE recurring_bookings SET next_due_date=?, status=?, updated_at=datetime('now') WHERE id=?`)

  for (const row of rows) {
    const schedule = advanceRecurringSchedule({
      nextDueDate: row.nextDueDate,
      throughDate,
      frequency: row.frequency,
      anchorDay: row.anchorDay,
      endDate: row.endDate
    })
    for (const dueDate of schedule.dueDates) insert.run(row.id, dueDate)
    advance.run(schedule.nextDueDate, schedule.ended ? 'ENDED' : 'ACTIVE', row.id)
  }
}

export function materializeDueOccurrences(d: DB, throughDate = localIsoDate()) {
  const rows = d.prepare(`
    SELECT id, anchor_day as anchorDay, next_due_date as nextDueDate, end_date as endDate, frequency
    FROM recurring_bookings
    WHERE status = 'ACTIVE' AND next_due_date <= ?
  `).all(throughDate) as Array<{ id: number; anchorDay: number; nextDueDate: string; endDate: string | null; frequency: RecurringFrequency }>

  materializeRows(d, rows, throughDate)
}

export function materializeRecurringBookingThrough(d: DB, recurringBookingId: number, throughDate: string) {
  const rows = d.prepare(`
    SELECT id, anchor_day as anchorDay, next_due_date as nextDueDate, end_date as endDate, frequency
    FROM recurring_bookings
    WHERE id = ? AND status = 'ACTIVE' AND next_due_date <= ?
  `).all(recurringBookingId, throughDate) as Array<{ id: number; anchorDay: number; nextDueDate: string; endDate: string | null; frequency: RecurringFrequency }>
  materializeRows(d, rows, throughDate)
}
