export function isMetaAmountValid(amount: number | null | undefined, isInternal: boolean): boolean {
  if (amount == null || !Number.isFinite(Number(amount))) return false
  const numericValue = Number(amount)
  return isInternal ? true : numericValue > 0
}

export function getInternalAssignmentValidationState({
  budgets,
  earmarks,
  isInternal,
  grossAmount,
}: {
  budgets: Array<{ budgetId?: number | null; amount?: number | null }>;
  earmarks: Array<{ earmarkId?: number | null; amount?: number | null }>;
  isInternal: boolean;
  grossAmount?: number | null;
}): { hasValidAssignments: boolean; budgetHint: string; earmarkHint: string } {
  if (!isInternal) {
    return { hasValidAssignments: true, budgetHint: '', earmarkHint: '' }
  }

  const budgetEntries = budgets.filter((b) => b.budgetId)
  const earmarkEntries = earmarks.filter((e) => e.earmarkId)
  const allEntries = [...budgetEntries, ...earmarkEntries]
  const grossLimit = Number(grossAmount || 0)
  const hasGrossLimit = Number.isFinite(grossLimit) && grossLimit > 0

  const sourceTotal = allEntries.reduce((sum, entry) => {
    const amount = Number(entry.amount || 0)
    return amount < 0 ? sum + Math.abs(amount) : sum
  }, 0)
  const targetTotal = allEntries.reduce((sum, entry) => {
    const amount = Number(entry.amount || 0)
    return amount > 0 ? sum + amount : sum
  }, 0)
  const total = allEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  const hasSource = allEntries.some((entry) => Number(entry.amount || 0) < 0)
  const hasTarget = allEntries.some((entry) => Number(entry.amount || 0) > 0)
  const matchesGross = !hasGrossLimit
    || (Math.abs(sourceTotal - grossLimit) <= 0.001 && Math.abs(targetTotal - grossLimit) <= 0.001)
  const hasValidAssignments = allEntries.length > 0
    && hasSource
    && hasTarget
    && Math.abs(total) <= 0.001
    && matchesGross

  const hint = allEntries.length === 0
    ? 'Interne Buchungen brauchen Budget- oder Zweckbindungs-Zeilen mit Quelle negativ, Ziel positiv und Summe 0.'
    : Math.abs(total) <= 0.001 && hasSource && hasTarget && !matchesGross
      ? 'Interne Buchungen brauchen Quelle und Ziel jeweils genau in Hoehe des Bruttobetrags.'
      : 'Interne Buchungen brauchen insgesamt Quelle negativ, Ziel positiv und Summe 0.'
  const budgetHint = !hasValidAssignments && (budgetEntries.length > 0 || allEntries.length === 0) ? hint : ''
  const earmarkHint = !hasValidAssignments && earmarkEntries.length > 0 ? hint : ''

  return {
    hasValidAssignments,
    budgetHint,
    earmarkHint,
  }
}
