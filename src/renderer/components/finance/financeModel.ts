export type FinanceMonth = { month: string; inflow: number; spent: number }

export function fillFinanceMonths(rows: FinanceMonth[], from?: string, to?: string): FinanceMonth[] {
  const first = from?.slice(0, 7) || rows[0]?.month
  const last = to?.slice(0, 7) || rows[rows.length - 1]?.month
  if (!first || !last || first > last) return []
  const start = Number(first.slice(0, 4)) * 12 + Number(first.slice(5, 7)) - 1
  const end = Number(last.slice(0, 4)) * 12 + Number(last.slice(5, 7)) - 1
  const indexed = new Map(rows.map(row => [row.month, row]))
  // A compact trend shows at most the latest twelve calendar months, with gaps as zero.
  return Array.from({ length: Math.min(12, end - start + 1) }, (_, i) => {
    const serial = Math.max(start, end - 11) + i
    const month = `${Math.floor(serial / 12)}-${String(serial % 12 + 1).padStart(2, '0')}`
    return indexed.get(month) || { month, inflow: 0, spent: 0 }
  })
}

export function financeUsage(plan: number, inflow: number, spent: number) {
  const net = Math.round((spent - inflow) * 100) / 100
  const remaining = Math.round((plan - net) * 100) / 100
  const percent = plan > 0 ? net / plan * 100 : null
  const status = percent === null ? 'Ohne Plan' : percent > 100 ? 'Plan überschritten' : percent === 100 ? 'Aufgebraucht' : percent >= 80 ? 'Fast aufgebraucht' : 'Im Plan'
  return { net, remaining, percent, status, tone: percent !== null && percent > 100 ? 'danger' : percent !== null && percent >= 80 ? 'warning' : 'neutral' }
}
