import { buildFilterTotalsPayload } from '../renderer/views/Journal/utils/filterTotalsPayload'

describe('buildFilterTotalsPayload', () => {
  it('includes paymentAccountId in the report summary payload', () => {
    expect(buildFilterTotalsPayload({
      from: '2024-01-01',
      to: '2024-01-31',
      paymentAccountId: 7,
      sphere: 'IDEELL',
      type: 'IN'
    })).toEqual({
      from: '2024-01-01',
      to: '2024-01-31',
      paymentMethod: undefined,
      paymentAccountId: 7,
      sphere: 'IDEELL',
      type: 'IN',
      earmarkId: undefined,
      q: undefined,
      tag: undefined
    })
  })
})
