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
    expect(state.budgetHint).toContain('Zweckbindung')
    expect(state.earmarkHint).toBe('')
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

  it('rejects balanced internal assignments that do not match the gross amount', () => {
    const state = getInternalAssignmentValidationState({
      budgets: [{ budgetId: 1, amount: -1000 }, { budgetId: 2, amount: 1000 }],
      earmarks: [],
      isInternal: true,
      grossAmount: 500,
    })

    expect(state.hasValidAssignments).toBe(false)
    expect(state.budgetHint).toContain('Bruttobetrag')
  })

  it('accepts split internal target assignments that match the gross amount', () => {
    const state = getInternalAssignmentValidationState({
      budgets: [
        { budgetId: 1, amount: -500 },
        { budgetId: 2, amount: 250 },
        { budgetId: 3, amount: 250 },
      ],
      earmarks: [],
      isInternal: true,
      grossAmount: 500,
    })

    expect(state.hasValidAssignments).toBe(true)
    expect(state.budgetHint).toBe('')
  })

  it('accepts internal transfers between budgets and earmarks', () => {
    const state = getInternalAssignmentValidationState({
      budgets: [{ budgetId: 1, amount: -500 }],
      earmarks: [{ earmarkId: 1, amount: 500 }],
      isInternal: true,
      grossAmount: 500,
    })

    expect(state.hasValidAssignments).toBe(true)
    expect(state.budgetHint).toBe('')
    expect(state.earmarkHint).toBe('')
  })
})
