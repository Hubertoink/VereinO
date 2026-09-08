export type MonthBucket = { month: string; gross: number }
export type MonthRow = { month: string; income: number; expense: number; net: number; balance: number }

export function dashboardMonths(today: string, count: number): string[] {
  const [year, month] = today.split('-').map(Number)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - count + index, 1))
    return date.toISOString().slice(0, 7)
  })
}

export function buildDashboardMonths(keys: string[], income: MonthBucket[], expense: MonthBucket[], opening: number): MonthRow[] {
  const ins = new Map(income.map(row => [row.month, row.gross]))
  const outs = new Map(expense.map(row => [row.month, -row.gross]))
  let balance = opening
  return keys.map(month => {
    const incoming = ins.get(month) || 0
    const outgoing = outs.get(month) || 0
    const net = Math.round((incoming - outgoing) * 100) / 100
    balance = Math.round((balance + net) * 100) / 100
    return { month, income: incoming, expense: outgoing, net, balance }
  })
}
