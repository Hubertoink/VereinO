import { buildAiReviewQueue } from '../renderer/views/AI/aiReviewQueue'
import type {
  AiBankLinkState,
  AiMemberImportState,
  AiRecurringBookingState
} from '../renderer/views/AI/aiViewTypes'

describe('AI review queue', () => {
  it('does not show cards for an empty chat', () => {
    expect(buildAiReviewQueue({})).toEqual([])
  })

  it('keeps completed member imports visible with their original count and anchor', () => {
    const pendingMembers: AiMemberImportState = {
      status: 'DRAFT',
      sourcePrompt: '',
      members: [{ name: 'Anna', joinDate: '2026-09-01' }]
    }
    expect(buildAiReviewQueue({ pendingMembers })[0]).toMatchObject({
      id: 'member-create',
      status: 'OPEN',
      count: 1,
      anchorId: 'ai-review-members'
    })
    expect(
      buildAiReviewQueue({ pendingMembers: { ...pendingMembers, status: 'CREATED' } })[0]
    ).toMatchObject({
      id: 'member-create',
      status: 'DONE',
      count: 1,
      anchorId: 'ai-review-members'
    })
    expect(pendingMembers.status).toBe('DRAFT')
  })

  it('counts only selected, unapplied bank links while retaining completed totals', () => {
    const pendingBankLinks: AiBankLinkState = {
      status: 'DRAFT',
      sourcePrompt: '',
      changes: [
        {
          id: 'open',
          bankTransactionId: 1,
          bankAmount: 10,
          voucherGrossAmount: 10,
          selected: true
        },
        {
          id: 'done',
          bankTransactionId: 2,
          bankAmount: 10,
          voucherGrossAmount: 10,
          selected: true,
          applied: true
        },
        {
          id: 'skipped',
          bankTransactionId: 3,
          bankAmount: 10,
          voucherGrossAmount: 10,
          selected: false
        }
      ]
    }
    expect(buildAiReviewQueue({ pendingBankLinks })[0]).toMatchObject({ status: 'OPEN', count: 1 })
    const completed: AiBankLinkState = {
      ...pendingBankLinks,
      status: 'APPLIED',
      changes: pendingBankLinks.changes.map((change) => ({ ...change, applied: true }))
    }
    expect(buildAiReviewQueue({ pendingBankLinks: completed })[0]).toMatchObject({
      status: 'DONE',
      count: 3
    })
  })

  it('counts remaining recurring occurrences and preserves the total after booking', () => {
    const pendingRecurringBooking: AiRecurringBookingState = {
      recurringBookingId: 1,
      recurringBookingName: 'Miete',
      type: 'OUT',
      amountMode: 'GROSS',
      amount: 100,
      vatRate: 0,
      totalAmount: 200,
      sourcePrompt: '',
      status: 'DRAFT',
      occurrences: [
        { occurrenceId: 1, scheduledDate: '2026-08-01', amount: 100, booked: true },
        { occurrenceId: 2, scheduledDate: '2026-09-01', amount: 100 }
      ]
    }
    expect(buildAiReviewQueue({ pendingRecurringBooking })[0]).toMatchObject({
      status: 'OPEN',
      count: 1,
      anchorId: 'ai-review-recurring-booking'
    })
    expect(
      buildAiReviewQueue({
        pendingRecurringBooking: {
          ...pendingRecurringBooking,
          status: 'APPLIED',
          occurrences: pendingRecurringBooking.occurrences.map((row) => ({ ...row, booked: true }))
        }
      })[0]
    ).toMatchObject({ status: 'DONE', count: 2 })
  })

  it('keeps mixed workflows in the same order as their review cards', () => {
    const items = buildAiReviewQueue({
      pendingMembers: { status: 'CREATED', sourcePrompt: '', members: [] },
      pendingTagActions: { status: 'DRAFT', sourcePrompt: '', changes: [] },
      pendingBankLinks: { status: 'DRAFT', sourcePrompt: '', changes: [] }
    })
    expect(items.map((item) => [item.id, item.status])).toEqual([
      ['member-create', 'DONE'],
      ['tag-actions', 'OPEN'],
      ['bank-links', 'OPEN']
    ])
  })
})
