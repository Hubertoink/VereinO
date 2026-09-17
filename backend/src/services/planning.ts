import type { PoolClient } from 'pg'
import { z } from 'zod'

export const assignmentAmount = z.number().positive().max(Number.MAX_SAFE_INTEGER / 100).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001, 'Höchstens zwei Nachkommastellen')
export const assignmentFields = {
  budgets: z.array(z.object({ budgetId: z.number().int().positive(), amount: assignmentAmount }).strict()).max(100).optional(),
  earmarksAssigned: z.array(z.object({ earmarkId: z.number().int().positive(), amount: assignmentAmount }).strict()).max(100).optional()
}
export type BookingAssignments = { budgets?: { budgetId: number; amount: number }[]; earmarksAssigned?: { earmarkId: number; amount: number }[] }
const fail = (statusCode: number, message: string): never => { throw Object.assign(new Error(message), { statusCode }) }

// Call within the booking transaction after checking/locking its organization and version.
// Missing groups preserve existing assignments; [] intentionally clears a group.
export async function saveBookingAssignments(client: PoolClient, orgId: number, bookingId: number, input: BookingAssignments, booking: { date: string; grossAmountCents: number }) {
  const parsed = z.object(assignmentFields).parse(input)
  for (const kind of ['budgets', 'earmarksAssigned'] as const) {
    const budget = kind === 'budgets'
    const column = budget ? 'budget_id' : 'earmark_id'
    const table = budget ? 'web_booking_budget_assignments' : 'web_booking_earmark_assignments'
    const definitions = budget ? 'web_budgets' : 'web_earmarks'
    const requested = parsed[kind]
    const existing = (await client.query(`SELECT ${column} AS id,amount_cents FROM ${table} WHERE booking_id=$1`, [bookingId])).rows.map(r => ({ id: r.id as number, cents: Number(r.amount_cents) }))
    const rows = requested === undefined
      ? existing
      : requested.map(r => ({ id: 'budgetId' in r ? r.budgetId : r.earmarkId, cents: Math.round(r.amount * 100) }))
    if (new Set(rows.map(r => r.id)).size !== rows.length) fail(400, 'Zuordnungen dürfen nicht doppelt vorkommen.')
    const sum = rows.reduce((total, r) => total + r.cents, 0)
    if (!Number.isSafeInteger(sum) || sum > booking.grossAmountCents) fail(400, 'Zuordnungssumme übersteigt den Buchungsbetrag.')
    for (const row of rows) {
      const result = await client.query(`SELECT *, start_date::text AS start_date,end_date::text AS end_date FROM ${definitions} WHERE id=$1 AND organization_id=$2 FOR SHARE`, [row.id, orgId])
      const definition = result.rows[0]
      if (!definition) fail(404, 'Zuordnung nicht gefunden.')
      // Existing assignments remain valid when their definition is archived later.
      if (requested !== undefined && !existing.some(r => r.id === row.id) && (budget ? definition.is_archived : !definition.is_active)) fail(400, 'Archivierte Zuordnungen können nicht neu vergeben werden.')
      const start = definition.start_date || (budget ? `${definition.year}-01-01` : null)
      const end = definition.end_date || (budget ? `${definition.year}-12-31` : null)
      if (definition.enforce_time_range && ((start && booking.date < start) || (end && booking.date > end))) fail(400, 'Buchungsdatum liegt außerhalb des Zuordnungszeitraums.')
    }
    if (requested !== undefined) {
      await client.query(`DELETE FROM ${table} WHERE booking_id=$1`, [bookingId])
      for (const row of rows) await client.query(`INSERT INTO ${table}(booking_id,${column},amount_cents) VALUES($1,$2,$3)`, [bookingId, row.id, row.cents])
    }
  }
}

export async function readBookingAssignments(client: Pick<PoolClient, 'query'>, orgId: number, bookingIds: number[]) {
  const result: Record<number, { budgets: Array<{ budgetId: number; label: string; amount: number; color: string | null }>; earmarksAssigned: Array<{ earmarkId: number; code: string; name: string; amount: number; color: string | null }> }> = {}
  for (const id of bookingIds) result[id] = { budgets: [], earmarksAssigned: [] }
  if (!bookingIds.length) return result
  const budgets = await client.query(`SELECT a.booking_id,b.id,b.name,b.color,a.amount_cents FROM web_booking_budget_assignments a JOIN web_bookings v ON v.id=a.booking_id JOIN web_budgets b ON b.id=a.budget_id WHERE v.organization_id=$1 AND b.organization_id=$1 AND v.id=ANY($2::int[])`, [orgId, bookingIds])
  for (const r of budgets.rows) result[r.booking_id].budgets.push({ budgetId: r.id, label: r.name, color: r.color, amount: Number(r.amount_cents) / 100 })
  const earmarks = await client.query(`SELECT a.booking_id,e.id,e.code,e.name,e.color,a.amount_cents FROM web_booking_earmark_assignments a JOIN web_bookings v ON v.id=a.booking_id JOIN web_earmarks e ON e.id=a.earmark_id WHERE v.organization_id=$1 AND e.organization_id=$1 AND v.id=ANY($2::int[])`, [orgId, bookingIds])
  for (const r of earmarks.rows) result[r.booking_id].earmarksAssigned.push({ earmarkId: r.id, code: r.code, name: r.name, color: r.color, amount: Number(r.amount_cents) / 100 })
  return result
}
