export type ContributionVoucherMatchInput = {
  amount: number
  periodStart: string
  periodEnd: string
  memberName?: string
  voucherAmount: number
  voucherDate: string
  voucherDescription?: string | null
  voucherCounterparty?: string | null
}

function normalizeMatchText(value?: string | null) {
  return String(value || '')
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function scoreContributionVoucherMatch(input: ContributionVoucherMatchInput) {
  const amountMatches = Math.abs(Number(input.voucherAmount) - Number(input.amount)) <= 0.01
  const periodMatches = input.voucherDate >= input.periodStart && input.voucherDate <= input.periodEnd
  if (!amountMatches || !periodMatches) return null

  const voucherText = normalizeMatchText(`${input.voucherDescription || ''} ${input.voucherCounterparty || ''}`)
  const memberParts = normalizeMatchText(input.memberName)
    .split(/\s+/)
    .filter((part) => part.length >= 2)
  const nameMatches = memberParts.some((part) => voucherText.includes(part))
  const contributionKeywordMatches = voucherText.includes('beitrag')
  if (!nameMatches && !contributionKeywordMatches) return null

  return {
    score: 70 + (nameMatches ? 30 : 20) + (contributionKeywordMatches ? 10 : 0),
    amountMatches,
    periodMatches,
    nameMatches,
    contributionKeywordMatches,
  }
}
