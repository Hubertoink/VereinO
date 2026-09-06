export type SortDirection = 'ASC' | 'DESC'

function compareText(a?: string | null, b?: string | null) {
  const left = (a ?? '').toLocaleLowerCase('de-DE')
  const right = (b ?? '').toLocaleLowerCase('de-DE')
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function compareNumber(a?: number | null, b?: number | null) {
  const left = Number.isFinite(a) ? Number(a) : 0
  const right = Number.isFinite(b) ? Number(b) : 0
  return left - right
}

export function sortBudgetEntries<T extends { id: number; year?: number | null; name?: string | null }>(entries: T[], sortBy: 'year' | 'name', direction: SortDirection = 'ASC') {
  const next = [...entries]
  next.sort((left, right) => {
    if (sortBy === 'year') {
      const yearDelta = compareNumber(left.year, right.year)
      if (yearDelta !== 0) return direction === 'ASC' ? yearDelta : -yearDelta

      const nameDelta = compareText(left.name, right.name)
      if (nameDelta !== 0) return nameDelta

      return left.id - right.id
    }

    const nameDelta = compareText(left.name, right.name)
    if (nameDelta !== 0) return direction === 'ASC' ? nameDelta : -nameDelta

    const yearDelta = compareNumber(left.year, right.year)
    if (yearDelta !== 0) return yearDelta

    return left.id - right.id
  })

  return next
}

export function sortEarmarkEntries<T extends { id: number; name?: string | null; code?: string | null }>(entries: T[], sortBy: 'name' | 'code', direction: SortDirection = 'ASC') {
  const next = [...entries]
  next.sort((left, right) => {
    const leftValue = sortBy === 'code' ? (left.code ?? left.name ?? '') : (left.name ?? '')
    const rightValue = sortBy === 'code' ? (right.code ?? right.name ?? '') : (right.name ?? '')
    const primaryDelta = compareText(leftValue, rightValue)
    if (primaryDelta !== 0) return direction === 'ASC' ? primaryDelta : -primaryDelta

    const secondaryDelta = compareText(left.name, right.name)
    if (secondaryDelta !== 0) return secondaryDelta

    return left.id - right.id
  })

  return next
}
