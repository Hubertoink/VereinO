import {
  normalizeVoucherBudgetAssignments,
  normalizeVoucherEarmarkAssignments
} from '../renderer/utils/voucherAssignmentFallbacks'

describe('voucher assignment fallbacks', () => {
  it('rebuilds legacy budget assignments from gross amount when no modern row is present', () => {
    expect(normalizeVoucherBudgetAssignments({
      budgetId: 12,
      budgetLabel: 'Druck',
      budgetAmount: 0,
      grossAmount: 87.3
    })).toEqual([
      {
        budgetId: 12,
        amount: 87.3,
        label: 'Druck',
        color: null
      }
    ])
  })

  it('keeps modern assignments when they already carry an amount', () => {
    expect(normalizeVoucherEarmarkAssignments({
      earmarkId: 3,
      earmarkCode: 'ALT',
      grossAmount: 87.3,
      earmarksAssigned: [{ earmarkId: 4, amount: 20, code: 'MOD' }]
    })).toEqual([{ earmarkId: 4, amount: 20, code: 'MOD' }])
  })
})
