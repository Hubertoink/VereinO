export function isMetaAmountValid(amount: number | null | undefined, isInternal: boolean): boolean {
  if (amount == null || !Number.isFinite(Number(amount))) return false
  const numericValue = Number(amount)
  return isInternal ? true : numericValue > 0
}

export function shouldIncludeMetaAssignment(amount: number | null | undefined, isInternal: boolean): boolean {
  return isMetaAmountValid(amount, isInternal)
}

export function getInternalAssignmentValidationState({
  budgets,
  earmarks,
  isInternal,
}: {
  budgets: Array<{ budgetId?: number | null; amount?: number | null }>;
  earmarks: Array<{ earmarkId?: number | null; amount?: number | null }>;
  isInternal: boolean;
}): { hasValidAssignments: boolean; budgetHint: string; earmarkHint: string } {
  if (!isInternal) {
    return { hasValidAssignments: true, budgetHint: '', earmarkHint: '' }
  }

  const budgetEntries = budgets.filter((b) => b.budgetId)
  const earmarkEntries = earmarks.filter((e) => e.earmarkId)

  const hasBalancedBudgets = budgetEntries.length > 0
    && budgetEntries.some((b) => Number(b.amount || 0) < 0)
    && budgetEntries.some((b) => Number(b.amount || 0) > 0)
    && Math.abs(budgetEntries.reduce((sum, b) => sum + Number(b.amount || 0), 0)) <= 0.001

  const hasBalancedEarmarks = earmarkEntries.length > 0
    && earmarkEntries.some((e) => Number(e.amount || 0) < 0)
    && earmarkEntries.some((e) => Number(e.amount || 0) > 0)
    && Math.abs(earmarkEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0)) <= 0.001

  const hasAnyAssignments = budgetEntries.length > 0 || earmarkEntries.length > 0
  const hasValidAssignments = (hasBalancedBudgets || hasBalancedEarmarks)
    && (budgetEntries.length === 0 || hasBalancedBudgets)
    && (earmarkEntries.length === 0 || hasBalancedEarmarks)

  const budgetHint = budgetEntries.length === 0 && !hasAnyAssignments
    ? 'Budget: Bitte mindestens eine Budget-Zeile mit Quelle negativ, Ziel positiv und Summe 0 ergänzen.'
    : budgetEntries.length > 0 && !hasBalancedBudgets
      ? 'Budget: Quelle negativ, Ziel positiv, Summe 0.'
      : ''

  const earmarkHint = earmarkEntries.length === 0 && !hasAnyAssignments
    ? 'Zweckbindung: Bitte mindestens eine Zweckbindungs-Zeile mit Quelle negativ, Ziel positiv und Summe 0 ergänzen.'
    : earmarkEntries.length > 0 && !hasBalancedEarmarks
      ? 'Zweckbindung: Quelle negativ, Ziel positiv, Summe 0.'
      : ''

  return {
    hasValidAssignments,
    budgetHint,
    earmarkHint,
  }
}
