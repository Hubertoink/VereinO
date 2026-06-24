export function truncateJournalDescription(text?: string | null, maxLen = 32): string {
  if (!text) return ''
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (trimmed.length <= maxLen) return trimmed

  const budget = Math.max(1, maxLen - 1)
  const words = trimmed.split(/\s+/)
  let result = ''

  for (const word of words) {
    if (!word) continue
    const next = result ? `${result} ${word}` : word
    if (next.length <= budget) {
      result = next
      continue
    }
    if (!result) {
      return `${word.slice(0, budget).trimEnd()}…`
    }
    break
  }

  return `${result.trimEnd()}…`
}

export function buildTransferFilterState() {
  return {
    type: 'TRANSFER' as const,
    paymentMethod: null,
    paymentAccountId: null
  }
}

export function getTransferTooltipTitle(fromLabel?: string | null, toLabel?: string | null) {
  const from = fromLabel?.trim() || '—'
  const to = toLabel?.trim() || '—'
  return `Kontotransfer: ${from} → ${to}`
}
