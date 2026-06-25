export function isMetaAmountValid(amount: number | null | undefined, isInternal: boolean): boolean {
  if (amount == null || !Number.isFinite(Number(amount))) return false
  const numericValue = Number(amount)
  return isInternal ? true : numericValue > 0
}

export function shouldIncludeMetaAssignment(amount: number | null | undefined, isInternal: boolean): boolean {
  return isMetaAmountValid(amount, isInternal)
}
