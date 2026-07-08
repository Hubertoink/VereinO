type VoucherBudgetAssignmentLike = {
  budgetId?: number | null
  amount?: number | null
  label?: string | null
  color?: string | null
}

type VoucherEarmarkAssignmentLike = {
  earmarkId?: number | null
  amount?: number | null
  code?: string | null
  name?: string | null
  color?: string | null
}

type VoucherAssignmentFallbackRow = {
  grossAmount?: number | string | null
  budgetId?: number | string | null
  budgetAmount?: number | string | null
  budgetLabel?: string | null
  budgetColor?: string | null
  budgets?: VoucherBudgetAssignmentLike[] | null
  earmarkId?: number | string | null
  earmarkAmount?: number | string | null
  earmarkCode?: string | null
  earmarkName?: string | null
  earmarkColor?: string | null
  earmarksAssigned?: VoucherEarmarkAssignmentLike[] | null
}

type NormalizedVoucherBudgetAssignment = {
  budgetId: number
  amount: number
  label?: string
  color?: string | null
}

type NormalizedVoucherEarmarkAssignment = {
  earmarkId: number
  amount: number
  code?: string
  name?: string
  color?: string | null
}

export function assignmentFallbackAmount(row: VoucherAssignmentFallbackRow, explicitAmount: unknown) {
  const amount = Number(explicitAmount)
  if (Number.isFinite(amount) && amount !== 0) return amount
  const grossAmount = Math.abs(Number(row?.grossAmount || 0))
  return Number.isFinite(grossAmount) ? grossAmount : 0
}

export function normalizeVoucherBudgetAssignments(row: VoucherAssignmentFallbackRow): NormalizedVoucherBudgetAssignment[] {
  const existing = Array.isArray(row?.budgets)
    ? row.budgets
      .filter((budget) => Number(budget?.budgetId || 0))
      .map((budget) => {
        const normalized: NormalizedVoucherBudgetAssignment = {
          budgetId: Number(budget.budgetId),
          amount: Number(budget.amount || 0)
        }
        if (budget.label != null) normalized.label = budget.label
        if (budget.color !== undefined) normalized.color = budget.color
        return normalized
      })
    : []
  if (existing.length && existing.some((budget) => Number(budget?.amount || 0) !== 0)) {
    return existing
  }

  const budgetId = Number(row?.budgetId || 0)
  if (!budgetId) return existing

  return [{
    budgetId,
    amount: assignmentFallbackAmount(row, row?.budgetAmount),
    label: row?.budgetLabel ?? existing[0]?.label ?? undefined,
    color: row?.budgetColor ?? existing[0]?.color ?? null
  }]
}

export function normalizeVoucherEarmarkAssignments(row: VoucherAssignmentFallbackRow): NormalizedVoucherEarmarkAssignment[] {
  const existing = Array.isArray(row?.earmarksAssigned)
    ? row.earmarksAssigned
      .filter((earmark) => Number(earmark?.earmarkId || 0))
      .map((earmark) => {
        const normalized: NormalizedVoucherEarmarkAssignment = {
          earmarkId: Number(earmark.earmarkId),
          amount: Number(earmark.amount || 0)
        }
        if (earmark.code != null) normalized.code = earmark.code
        if (earmark.name != null) normalized.name = earmark.name
        if (earmark.color !== undefined) normalized.color = earmark.color
        return normalized
      })
    : []
  if (existing.length && existing.some((earmark) => Number(earmark?.amount || 0) !== 0)) {
    return existing
  }

  const earmarkId = Number(row?.earmarkId || 0)
  if (!earmarkId) return existing

  return [{
    earmarkId,
    amount: assignmentFallbackAmount(row, row?.earmarkAmount),
    code: row?.earmarkCode ?? existing[0]?.code ?? undefined,
    name: row?.earmarkName ?? existing[0]?.name ?? undefined,
    color: row?.earmarkColor ?? existing[0]?.color ?? null
  }]
}
