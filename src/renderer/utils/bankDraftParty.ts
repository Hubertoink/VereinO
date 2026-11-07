type BankParty = {
  id: number
  name: string
  legalName?: string | null
  iban?: string | null
  isActive?: number | boolean
}
type PartyLookup = (input: { q: string; activeOnly: boolean; limit: number }) => Promise<{ rows: BankParty[] }>

const nameKey = (value?: string | null) => (value || '').normalize('NFKC').toLocaleLowerCase('de-DE').replace(/[^\p{L}\p{N}]/gu, '')
const ibanKey = (value?: string | null) => (value || '').replace(/\s/g, '').toUpperCase()

/** Resolve existing partners only. Opening a bank draft must not create master data. */
export async function resolveBankDraftParty(
  source: { counterparty?: string | null; counterpartyIban?: string | null },
  list: PartyLookup
): Promise<{ counterparty: string; partyId: number | null }> {
  const counterparty = source.counterparty?.trim() || ''
  const fallback = { counterparty, partyId: null }
  const iban = ibanKey(source.counterpartyIban)
  const name = nameKey(counterparty)
  const nameQuery = counterparty.match(/[\p{L}\p{N}]+/u)?.[0]
  const queries = [...new Set([nameQuery, iban].filter((value): value is string => Boolean(value)))]
  if (!queries.length) return fallback
  try {
    const results = await Promise.all(queries.map(q => list({ q, activeOnly: true, limit: 500 })))
    // A truncated search cannot establish that a match is unique.
    if (results.some(result => result.rows.length >= 500)) return fallback
    const parties = [...new Map(results.flatMap(result => result.rows).map(party => [party.id, party])).values()]
      .filter(party => party.isActive !== 0 && party.isActive !== false)
    const byName = parties.filter(party => name && (nameKey(party.name) === name || nameKey(party.legalName) === name))
    const byIban = parties.filter(party => iban && ibanKey(party.iban) === iban)
    const candidates = byName.length && byIban.length
      ? byName.filter(party => byIban.some(match => match.id === party.id))
      : byIban.length ? byIban : byName.filter(party => !iban || !ibanKey(party.iban) || ibanKey(party.iban) === iban)
    if (candidates.length !== 1) return fallback
    return { counterparty: candidates[0].name, partyId: candidates[0].id }
  } catch {
    // Keep the imported name available for manual selection if lookup fails.
    return fallback
  }
}
