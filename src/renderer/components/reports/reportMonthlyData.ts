import type { RendererApi } from '../../../types/api'

type MonthlyRequest = RendererApi['reports']['monthly']
export type ReportMonthlyFilters = Parameters<MonthlyRequest>[0]
export type ReportMonthlyBucket = Awaited<ReturnType<MonthlyRequest>>['buckets'][number]

export type ReportMonthlyData = {
  income: ReportMonthlyBucket[]
  expense: ReportMonthlyBucket[]
}

export type ReportMonthlyModel = ReportMonthlyData & {
  months: string[]
  incomeByMonth: ReadonlyMap<string, number>
  expenseByMonth: ReadonlyMap<string, number>
  maxMagnitude: number
}

/** Each visible series is loaded once for all monthly report presentations. */
export async function loadReportMonthlyData(
  monthly: MonthlyRequest,
  filters: ReportMonthlyFilters
): Promise<ReportMonthlyData> {
  const load = async (type: 'IN' | 'OUT') => {
    if (filters.type && filters.type !== type) return []
    return (await monthly({ ...filters, type })).buckets
  }
  const [income, expense] = await Promise.all([load('IN'), load('OUT')])
  return { income, expense }
}

/** Preserve signed API values; each presentation decides how to draw them. */
export function buildReportMonthlyModel(data: ReportMonthlyData): ReportMonthlyModel {
  const incomeByMonth = new Map(data.income.map(bucket => [bucket.month, bucket.gross]))
  const expenseByMonth = new Map(data.expense.map(bucket => [bucket.month, bucket.gross]))
  const months = [...new Set([...incomeByMonth.keys(), ...expenseByMonth.keys()])].sort()
  let maxMagnitude = 1
  for (const value of incomeByMonth.values()) maxMagnitude = Math.max(maxMagnitude, Math.abs(value))
  for (const value of expenseByMonth.values()) maxMagnitude = Math.max(maxMagnitude, Math.abs(value))
  return { ...data, months, incomeByMonth, expenseByMonth, maxMagnitude }
}
