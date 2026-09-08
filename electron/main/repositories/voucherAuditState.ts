/** Compare persisted voucher values, ignoring assignment row IDs and set ordering. */
export function voucherAuditState(row: Record<string, unknown>, tags: string[], budgets: Array<{ budgetId: number; amount: number }>, earmarks: Array<{ earmarkId: number; amount: number }>) {
  const values = { ...row }
  // These legacy columns mirror the first entry of the assignment sets.
  for (const key of ['budget_id', 'budget_amount', 'earmark_id', 'earmark_amount', 'updated_at']) delete values[key]
  for (const key of ['note', 'description', 'counterparty']) values[key] = values[key] ?? ''
  const assignments = (items: Array<{ amount: number }>, id: string) => items.map(item => [Number((item as unknown as Record<string, unknown>)[id]), Math.round(Number(item.amount) * 100)]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return JSON.stringify({ values: Object.keys(values).sort().map(key => [key, values[key]]), tags: [...new Set(tags)].sort(), budgets: assignments(budgets, 'budgetId'), earmarks: assignments(earmarks, 'earmarkId') })
}
