export type ContributionInterval = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
export type ContributionAllocation = { periodKey: string; interval: ContributionInterval; amount: number }
export type ContributionPaymentInput = {
  memberId: number; amount: number; voucherId?: number | null; receiptId?: number
  datePaid?: string | null; startPeriod?: string; allocations?: ContributionAllocation[]; token?: string
}
export type ContributionPreview = {
  token: string; memberId: number; memberName: string; amount: number; credit: number
  allocations: Array<ContributionAllocation & { expected: number; paidBefore: number; remaining: number; dueDate: string }>
}
export type ContributionPeriod = {
  periodKey: string; interval: ContributionInterval; dueDate: string; expected: number; paidAmount: number; remaining: number
}
export type MembershipBankCandidate = { memberId: number; name: string; memberNo: string | null; evidence: string[]; warnings?: string[]; startPeriod?: string; preview: ContributionPreview }
export type MembershipSuggestion = { memberId: number; startPeriod?: string | null }

export function isExplicitMembershipPayment(source: { direction: string; purpose?: string | null }) {
  return source.direction === 'IN' && /\bmitgliedsbeitr(?:ag|äg|aeg)e?\b|\bmembership (?:fees?|dues)\b/i.test(source.purpose || '')
}

/** Complete omitted model metadata only from an explicit purpose and one verified identity. */
export function inferMembershipSuggestion(source: { direction: string; purpose?: string | null }, action: string, candidates: Array<{ memberId: number; startPeriod?: string }> = []): MembershipSuggestion | null {
  if (!isExplicitMembershipPayment(source) || !['CREATE_BOOKING', 'LINK_EXISTING'].includes(action) || candidates.length !== 1) return null
  return { memberId: candidates[0].memberId, startPeriod: candidates[0].startPeriod }
}

export function periodKeyFromDate(d: Date, interval: ContributionInterval): string {
  const y = d.getUTCFullYear()
  return interval === 'MONTHLY' ? `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` : interval === 'QUARTERLY' ? `${y}-Q${Math.floor(d.getUTCMonth() / 3) + 1}` : String(y)
}
export function periodRange(key: string, interval: ContributionInterval) {
  const pattern = interval === 'MONTHLY' ? /^\d{4}-(0[1-9]|1[0-2])$/ : interval === 'QUARTERLY' ? /^\d{4}-Q[1-4]$/ : /^\d{4}$/
  if (!pattern.test(key) || Number(key.slice(0, 4)) < 1900 || Number(key.slice(0, 4)) > 2200) throw new Error('Ungültige Beitragsperiode.')
  const year = Number(key.slice(0, 4)), month = interval === 'MONTHLY' ? Number(key.slice(5)) - 1 : interval === 'QUARTERLY' ? (Number(key.slice(6)) - 1) * 3 : 0
  const length = interval === 'MONTHLY' ? 1 : interval === 'QUARTERLY' ? 3 : 12
  return { start: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(year, month + length, 0)).toISOString().slice(0, 10) }
}
export function nextPeriod(key: string, interval: ContributionInterval) {
  const end = new Date(`${periodRange(key, interval).end}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 1)
  return periodKeyFromDate(end, interval)
}
