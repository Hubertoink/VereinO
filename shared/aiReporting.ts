/** Declarative report blocks. Values always come from a locally calculated dataset. */
export type ReportScope = { from: string; to: string }
export type ReportBookingSource = ReportScope & { type?: 'IN' | 'OUT' }
export type ReportMonth = ReportScope & {
  month: string
  income: number
  expense: number
  change: number
  balance: number
}
export type ReportFinanceData = {
  scope: ReportScope
  generatedAt: string
  opening: number
  income: number
  expense: number
  change: number
  closing: number
  hasBookings: boolean
  months: ReportMonth[]
}
export type ReportBlock =
  | { type: 'metrics'; data: 'finance' }
  | { type: 'balance'; data: 'finance' }
export type ReportAnswer = {
  title: string
  summary: string
  notes: string[]
  blocks: ReportBlock[]
  datasets: { finance: ReportFinanceData }
}
export type ReportQuestion = ReportScope & {
  question: string
  conversation?: Array<{ question: string; summary: string; from: string; to: string }>
}

/** The dashboard and agent use the same all-data window, with at least twelve months. */
export function defaultReportScope(today: string, availableMonths: string[]): ReportScope {
  const date = new Date(`${today.slice(0, 7)}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() - 11)
  const minimum = date.toISOString().slice(0, 7)
  const first = availableMonths.filter((month) => month <= today.slice(0, 7)).sort()[0]
  return { from: `${first && first < minimum ? first : minimum}-01`, to: today }
}

const cents = (value: number) => Math.round(value * 100)
export function previousReportDay(date: string): string {
  const day = new Date(`${date}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() - 1)
  return day.toISOString().slice(0, 10)
}

/** Monthly repository expenses are signed; reversals must retain their sign. */
export function buildReportFinance(
  scope: ReportScope,
  income: Array<{ month: string; gross: number }>,
  expense: Array<{ month: string; gross: number }>,
  opening: number,
  generatedAt = new Date().toISOString()
): ReportFinanceData {
  const incoming = new Map(income.map((row) => [row.month, cents(row.gross)]))
  const outgoing = new Map(expense.map((row) => [row.month, -cents(row.gross)]))
  let balance = cents(opening),
    totalIn = 0,
    totalOut = 0
  const months: ReportMonth[] = []
  const date = new Date(`${scope.from.slice(0, 7)}-01T12:00:00Z`)
  while (date.toISOString().slice(0, 7) <= scope.to.slice(0, 7)) {
    const month = date.toISOString().slice(0, 7)
    const start = `${month}-01`
    date.setUTCMonth(date.getUTCMonth() + 1)
    const end = previousReportDay(date.toISOString().slice(0, 10))
    const ins = incoming.get(month) || 0,
      outs = outgoing.get(month) || 0
    balance += ins - outs
    totalIn += ins
    totalOut += outs
    months.push({
      month,
      from: start < scope.from ? scope.from : start,
      to: end > scope.to ? scope.to : end,
      income: ins / 100,
      expense: outs / 100,
      change: (ins - outs) / 100,
      balance: balance / 100
    })
  }
  return {
    scope: { from: scope.from, to: scope.to },
    generatedAt,
    opening: cents(opening) / 100,
    income: totalIn / 100,
    expense: totalOut / 100,
    change: (totalIn - totalOut) / 100,
    closing: balance / 100,
    hasBookings: income.length > 0 || expense.length > 0,
    months
  }
}
