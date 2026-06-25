import { getInternalAssignmentValidationState, isMetaAmountValid } from '../renderer/components/modals/voucherMetaValidation'

describe('isMetaAmountValid', () => {
  it('allows zero and negative values for internal vouchers', () => {
    expect(isMetaAmountValid(0, true)).toBe(true)
    expect(isMetaAmountValid(-10, true)).toBe(true)
  })

  it('keeps positive-only validation for non-internal vouchers', () => {
    expect(isMetaAmountValid(0, false)).toBe(false)
    expect(isMetaAmountValid(10, false)).toBe(true)
    expect(isMetaAmountValid(-10, false)).toBe(false)
  })
})

describe('getInternalAssignmentValidationState', () => {
  it('flags empty internal assignments as incomplete', () => {
    const state = getInternalAssignmentValidationState({ budgets: [], earmarks: [], isInternal: true })

    expect(state.hasValidAssignments).toBe(false)
    expect(state.budgetHint).toContain('Budget')
    expect(state.earmarkHint).toContain('Zweckbindung')
  })

  it('accepts a balanced internal assignment set', () => {
    const state = getInternalAssignmentValidationState({
      budgets: [{ budgetId: 1, amount: -10 }, { budgetId: 2, amount: 10 }],
      earmarks: [],
      isInternal: true,
    })

    expect(state.hasValidAssignments).toBe(true)
    expect(state.budgetHint).toBe('')
    expect(state.earmarkHint).toBe('')
  })
})
