export type PartyCreationSource = { name: string; iban?: string | null }

const nameKey = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE')

/** Source data belongs to this counterparty, not to another name entered later. */
export function partyCreationIban(name: string, source?: PartyCreationSource): string {
  if (!source?.name.trim() || nameKey(name) !== nameKey(source.name)) return ''
  return (source.iban || '').replace(/\s/g, '').toUpperCase()
}
