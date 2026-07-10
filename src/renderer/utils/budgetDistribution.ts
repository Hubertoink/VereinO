export function distributeAmountEvenly(total: number, count: number): number[] {
  if (!Number.isFinite(total) || count <= 0) return []

  const totalCents = Math.round(total * 100)
  const baseCents = Math.trunc(totalCents / count)
  const remainder = totalCents - baseCents * count
  const remainderSign = Math.sign(remainder)
  const remainderCount = Math.abs(remainder)

  return Array.from({ length: count }, (_, index) => (
    baseCents + (index < remainderCount ? remainderSign : 0)
  ) / 100)
}

export function isAmountEvenlyDistributed(amounts: number[], total: number): boolean {
  if (!amounts.length || !Number.isFinite(total)) return amounts.length === 0
  if (amounts.some((amount) => !Number.isFinite(amount))) return false

  const cents = amounts.map((amount) => Math.round(amount * 100))
  const totalCents = Math.round(total * 100)
  const sum = cents.reduce((current, amount) => current + amount, 0)
  const spread = Math.max(...cents) - Math.min(...cents)
  return sum === totalCents && spread <= 1
}
