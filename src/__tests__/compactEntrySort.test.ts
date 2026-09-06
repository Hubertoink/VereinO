import { sortBudgetEntries, sortEarmarkEntries } from '../renderer/utils/compactEntrySort'

describe('compact entry sorting', () => {
  it('sorts budgets by year descending and stabilizes same-year items by name', () => {
    const budgets = [
      { id: 1, year: 2020, name: 'Beta' },
      { id: 2, year: 2024, name: 'Alpha' },
      { id: 3, year: 2024, name: 'Gamma' }
    ]

    expect(sortBudgetEntries(budgets, 'year', 'DESC').map((b) => b.id)).toEqual([2, 3, 1])
  })

  it('sorts earmarks alphabetically by name and keeps the chosen direction', () => {
    const earmarks = [
      { id: 1, name: 'Zebra', code: 'Z' },
      { id: 2, name: 'Alpha', code: 'A' },
      { id: 3, name: 'Mittel', code: 'M' }
    ]

    expect(sortEarmarkEntries(earmarks, 'name', 'ASC').map((b) => b.id)).toEqual([2, 3, 1])
    expect(sortEarmarkEntries(earmarks, 'name', 'DESC').map((b) => b.id)).toEqual([1, 3, 2])
  })
})
