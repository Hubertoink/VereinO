import { selectAiDraftBookingType } from '../renderer/utils/aiBookingDraft'

it.each(['IN', 'OUT'] as const)('opens older bank drafts with their original %s direction', (direction) => {
  expect(selectAiDraftBookingType({
    type: direction === 'IN' ? 'OUT' : 'IN',
    grossAmount: 106.99,
    bankReviewSource: { direction }
  })).toMatchObject({ type: direction, grossAmount: 106.99, bookingTypeSelected: true })
})

it('preserves explicit types and missing selections for drafts without bank sources', () => {
  for (const type of ['IN', 'OUT', 'TRANSFER', 'INTERNAL']) {
    expect(selectAiDraftBookingType({ type })).toEqual({ type, bookingTypeSelected: true })
  }
  expect(selectAiDraftBookingType({})).toMatchObject({ bookingTypeSelected: false })
})
