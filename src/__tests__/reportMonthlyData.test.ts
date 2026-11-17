import { buildReportMonthlyModel, loadReportMonthlyData } from '../renderer/components/reports/reportMonthlyData'

const bucket = (month: string, gross: number) => ({ month, gross, net: gross, vat: 0 })

describe('shared report monthly data', () => {
  it('requests each series once and preserves assignment and date filters', async () => {
    const monthly = jest.fn(async ({ type }) => ({ buckets: [bucket('2026-01', type === 'IN' ? 100 : -40)] }))
    const filters = { from: '2026-01-01', to: '2026-03-31', budgetId: 7, earmarkId: 8, sphere: 'IDEELL' as const, paymentMethod: 'BANK' as const }
    const result = await loadReportMonthlyData(monthly, filters)

    expect(monthly.mock.calls).toEqual([[{ ...filters, type: 'IN' }], [{ ...filters, type: 'OUT' }]])
    expect(result.income).toEqual([bucket('2026-01', 100)])
    expect(result.expense).toEqual([bucket('2026-01', -40)])
  })

  it.each(['IN', 'OUT'] as const)('does not request the hidden series for %s', async type => {
    const monthly = jest.fn(async () => ({ buckets: [bucket('2026-01', 25)] }))
    const result = await loadReportMonthlyData(monthly, { type })
    expect(monthly).toHaveBeenCalledTimes(1)
    expect(monthly).toHaveBeenCalledWith({ type })
    expect(result[type === 'IN' ? 'expense' : 'income']).toEqual([])
  })

  it.each(['TRANSFER', 'INTERNAL'] as const)('does not request either excluded series for %s', async type => {
    const monthly = jest.fn()
    await expect(loadReportMonthlyData(monthly, { type })).resolves.toEqual({ income: [], expense: [] })
    expect(monthly).not.toHaveBeenCalled()
  })

  it('rejects the shared result if a requested series fails', async () => {
    const monthly = jest.fn(async ({ type }) => {
      if (type === 'OUT') throw new Error('offline')
      return { buckets: [] }
    })
    await expect(loadReportMonthlyData(monthly, {})).rejects.toThrow('offline')
  })

  it('indexes sparse months without losing signed refunds or reversals', () => {
    const model = buildReportMonthlyModel({
      income: [bucket('2026-03', -30), bucket('2026-01', 100)],
      expense: [bucket('2026-02', -250), bucket('2026-03', 20)]
    })
    expect(model.months).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(model.incomeByMonth.get('2026-03')).toBe(-30)
    expect(model.expenseByMonth.get('2026-03')).toBe(20)
    expect(model.incomeByMonth.has('2026-02')).toBe(false)
    expect(model.maxMagnitude).toBe(250)
    expect(buildReportMonthlyModel({ income: [], expense: [] }).maxMagnitude).toBe(1)
  })
})
