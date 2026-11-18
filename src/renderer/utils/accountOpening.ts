type OpeningFields = { openingCents?: number | null; openingDate?: string | null }
const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const germanDate = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' })

export function openingLabel(account?: OpeningFields) {
  if (!account?.openingDate || !account.openingCents) return ''
  return `Anfangsbestand am ${germanDate.format(new Date(account.openingDate + 'T12:00:00'))} · ${currency.format(account.openingCents / 100)}`
}

export type OpeningDraft = { amount: string; date: string }
export const openingHint = 'Trage den Kontostand vor der ersten Buchung am Stichtag ein. Ohne Angabe gilt 0 €. Ist der Startbetrag bereits als Buchung erfasst, lass das Feld leer, damit er nur einmal zählt.'

export function openingDraft(account: OpeningFields): OpeningDraft {
  return { amount: account.openingCents ? (account.openingCents / 100).toFixed(2).replace('.', ',') : '', date: account.openingDate ?? '' }
}

export function parseOpening({ amount, date }: OpeningDraft) {
  const value = amount.trim()
  if (!value) return null
  if (!/^[+-]?\d+(?:[,.]\d{1,2})?$/.test(value)) throw new Error('Bitte gib einen Betrag mit höchstens zwei Nachkommastellen ein.')
  const amountCents = Math.round(Number(value.replace(',', '.')) * 100)
  if (!Number.isSafeInteger(amountCents)) throw new Error('Der Betrag ist zu groß.')
  if (!amountCents) return null
  if (!date) throw new Error('Bitte wähle einen Stichtag für den Anfangsbestand.')
  return { date, amountCents }
}
