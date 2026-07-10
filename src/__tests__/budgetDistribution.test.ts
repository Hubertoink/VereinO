import { distributeAmountEvenly, isAmountEvenlyDistributed } from '../renderer/utils/budgetDistribution'

describe('budget distribution', () => {
  it('splits an amount equally between two budgets', () => {
    expect(distributeAmountEvenly(6565, 2)).toEqual([3282.5, 3282.5])
  })

  it('assigns rounding cents without changing the total', () => {
    const amounts = distributeAmountEvenly(100, 3)

    expect(amounts).toEqual([33.34, 33.33, 33.33])
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBeCloseTo(100, 2)
  })

  it('distinguishes automatic and manually changed distributions', () => {
    expect(isAmountEvenlyDistributed([33.34, 33.33, 33.33], 100)).toBe(true)
    expect(isAmountEvenlyDistributed([50, 30, 20], 100)).toBe(false)
  })
})
