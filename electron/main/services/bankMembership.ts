import { getDb } from '../db/database'
import { contributionPeriods, previewContributionPayment } from '../repositories/membershipLedger'
import { periodRange, type MembershipBankCandidate } from '../../../shared/membershipPayments'

type Source = { direction: string; amount: number; currency?: string | null; counterparty?: string | null; counterpartyIban?: string | null; purpose?: string | null; endToEndId?: string | null }
const normalized = (s?: string | null) => (s || '').toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
export function membershipBankCandidates(source: Source): MembershipBankCandidate[] {
  if (source.direction !== 'IN' || (source.currency && source.currency !== 'EUR')) return []
  const text = normalized(`${source.counterparty || ''} ${source.purpose || ''} ${source.endToEndId || ''}`)
  const words = text.split(' ')
  const contribution = /beitrag|mitglied|membership|vorauszahlung/.test(text)
  const members = getDb().prepare("SELECT * FROM members WHERE contribution_amount>0 AND contribution_interval IS NOT NULL AND status IN ('ACTIVE','PAUSED')").all() as any[]
  const candidates: MembershipBankCandidate[] = []
  for (const member of members) {
    const evidence: string[] = []
    const numberMatch = member.member_no && words.includes(normalized(member.member_no))
    const mandateMatch = member.mandate_ref && text.includes(normalized(member.mandate_ref))
    if (!contribution && !mandateMatch) continue
    if (numberMatch) evidence.push(`Mitgliedsnummer ${member.member_no}`)
    if (mandateMatch) evidence.push('Mandatsreferenz stimmt überein')
    if (member.iban && source.counterpartyIban && member.iban.replace(/\s/g, '').toUpperCase() === source.counterpartyIban.replace(/\s/g, '').toUpperCase()) evidence.push('Hinterlegte IBAN stimmt überein')
    const name = normalized(member.name)
    if (name && ` ${text} `.includes(` ${name} `)) evidence.push('Vollständiger Name stimmt überein')
    if (!evidence.length) continue
    const explicitPeriod = (source.purpose || '').match(/(?:ab|für|fuer|beitrag(?:e|s)?)\s+(\d{4}-(?:0[1-9]|1[0-2])|\d{4}-Q[1-4]|20\d{2})(?![\d-])/i)?.[1]
    try {
      let startPeriod = explicitPeriod
      const warnings: string[] = []
      if (explicitPeriod) {
        const interval = /^\d{4}-Q/i.test(explicitPeriod) ? 'QUARTERLY' : /^\d{4}-\d{2}$/.test(explicitPeriod) ? 'MONTHLY' : 'YEARLY'
        const first = contributionPeriods(member.id, '2199-12-31').find(period => period.interval === interval)
        // Identity remains valid when a prepayment names a month before the plan starts.
        // Do not create an obligation before the member's configured contribution plan.
        if (first && periodRange(explicitPeriod, interval).start < periodRange(first.periodKey, interval).start) {
          startPeriod = first.periodKey
          warnings.push(`Der Verwendungszweck nennt ${explicitPeriod}; der Beitragsplan beginnt erst ${first.periodKey}. Die Zahlung wird ab ${first.periodKey} verrechnet.`)
        }
      }
      const preview = previewContributionPayment({ memberId: member.id, amount: source.amount, startPeriod })
      candidates.push({ memberId: member.id, name: member.name, memberNo: member.member_no, evidence, warnings, startPeriod, preview })
    } catch { /* An impossible period must be clarified manually, not silently changed. */ }
  }
  return candidates
}
