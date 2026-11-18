export type AccountOpening = { date: string; amountCents: number }

export function sumOpeningCents(openings: AccountOpening[]) {
  return openings.reduce((total, opening) => total + opening.amountCents, 0)
}

export function openingCentsByPeriod(openings: AccountOpening[], daily: boolean) {
  const result = new Map<string, number>()
  for (const opening of openings) {
    const key = daily ? opening.date : opening.date.slice(0, 7)
    result.set(key, (result.get(key) ?? 0) + opening.amountCents)
  }
  return result
}

export function openingsByPeriod(openings: AccountOpening[], daily = false) {
    const periods = new Map<string, AccountOpening[]>()
    for (const opening of openings) {
        const key = daily ? opening.date : opening.date.slice(0, 7)
        const entries = periods.get(key)
        if (entries) entries.push(opening)
        else periods.set(key, [opening])
    }
    return periods
}
