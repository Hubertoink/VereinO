export function assignmentFallbackAmount(row: any, explicitAmount: unknown) {
  const amount = Number(explicitAmount)
  if (Number.isFinite(amount) && amount !== 0) return amount
  const grossAmount = Math.abs(Number(row?.grossAmount || 0))
  return Number.isFinite(grossAmount) ? grossAmount : 0
}

export function normalizeVoucherBudgetAssignments(row: any) {
  const existing = Array.isArray(row?.budgets)
    ? row.budgets.filter((budget: any) => Number(budget?.budgetId || 0))
    : []
  if (existing.length && existing.some((budget: any) => Number(budget?.amount || 0) !== 0)) {
    return existing
  }

  const budgetId = Number(row?.budgetId || 0)
  if (!budgetId) return existing

  return [{
    budgetId,
    amount: assignmentFallbackAmount(row, row?.budgetAmount),
    label: row?.budgetLabel ?? existing[0]?.label,
    color: row?.budgetColor ?? existing[0]?.color ?? null
  }]
}

export function normalizeVoucherEarmarkAssignments(row: any) {
  const existing = Array.isArray(row?.earmarksAssigned)
    ? row.earmarksAssigned.filter((earmark: any) => Number(earmark?.earmarkId || 0))
    : []
  if (existing.length && existing.some((earmark: any) => Number(earmark?.amount || 0) !== 0)) {
    return existing
  }

  const earmarkId = Number(row?.earmarkId || 0)
  if (!earmarkId) return existing

  return [{
    earmarkId,
    amount: assignmentFallbackAmount(row, row?.earmarkAmount),
    code: row?.earmarkCode ?? existing[0]?.code,
    name: row?.earmarkName ?? existing[0]?.name,
    color: row?.earmarkColor ?? existing[0]?.color ?? null
  }]
}
