import { createHash } from 'node:crypto'
import { withTransaction } from '../db/database'
import type { TContributionBookingInput } from '../ipc/schemas'
import { allocateContributionPayment } from './membershipLedger'
import { createVoucher } from './vouchers'

export function bookContribution({ requestId, ...input }: TContributionBookingInput) {
  // The IPC schema supplies canonical field order. Keep only a hash of the request.
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  return withTransaction(db => {
    const previous = db.prepare(`
      SELECT r.input_hash AS hash, v.id, v.voucher_no AS voucherNo,
             EXISTS(SELECT 1 FROM membership_receipts WHERE voucher_id = v.id AND member_id = ?) AS linked
      FROM contribution_booking_requests r
      LEFT JOIN vouchers v ON v.id = r.voucher_id AND v.reversed_by_id IS NULL
      WHERE r.request_id = ?
    `).get(input.memberId, requestId) as { hash: string; id: number | null; voucherNo: string | null; linked: number } | undefined
    if (previous) {
      if (previous.hash !== hash) throw new Error('Dieser Buchungsauftrag wurde bereits mit anderen Angaben ausgeführt.')
      if (!previous.id || !previous.voucherNo || !previous.linked)
        throw new Error('Dieser Auftrag wurde bereits ausgeführt. Die Beitragsbuchung wurde inzwischen aufgehoben.')
      return { id: previous.id, voucherNo: previous.voucherNo }
    }

    const voucher = createVoucher({
      type: 'IN', sphere: 'IDEELL', date: input.date, grossAmount: input.amount, vatRate: 0,
      description: input.description, note: '', paymentMethod: input.paymentMethod,
      paymentAccountId: input.paymentAccountId, tags: input.tags
    })
    allocateContributionPayment({
      memberId: input.memberId, amount: input.amount, voucherId: voucher.id, datePaid: input.date,
      allocations: [{ periodKey: input.periodKey, interval: input.interval, amount: input.amount }]
    })
    db.prepare(`
      INSERT INTO contribution_booking_requests(request_id, input_hash, voucher_id) VALUES (?, ?, ?)
    `).run(requestId, hash, voucher.id)
    return { id: voucher.id, voucherNo: voucher.voucherNo }
  })
}
