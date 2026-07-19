export type RecurringMatchInput = {
  scheduledDate: string
  bookingDate: string
  recurringType: 'IN' | 'OUT'
  bookingType: 'IN' | 'OUT'
  expectedGrossAmount: number
  bookingGrossAmount: number
  variableAmount?: boolean
  recurringPaymentAccountId?: number | null
  bookingPaymentAccountId?: number | null
  recurringText?: string | null
  bookingText?: string | null
}

function round2(value: number) {
  return Math.round(Number(value) * 100) / 100
}

function dateNumber(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return Number.NaN
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function normalizeText(value?: string | null) {
  return String(value || '')
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function words(value?: string | null) {
  return new Set(normalizeText(value).split(/\s+/).filter((word) => word.length >= 3))
}

export function recurringGrossAmount(amountMode: 'NET' | 'GROSS', amount: number, vatRate: number) {
  return amountMode === 'NET'
    ? round2(Number(amount) * (1 + Number(vatRate || 0) / 100))
    : round2(amount)
}

/** Returns null for incompatible rows and otherwise a conservative 0-100 suggestion score. */
export function scoreRecurringMatch(input: RecurringMatchInput) {
  if (input.recurringType !== input.bookingType) return null
  if (!input.recurringPaymentAccountId || input.recurringPaymentAccountId !== input.bookingPaymentAccountId) return null

  const scheduled = dateNumber(input.scheduledDate)
  const booked = dateNumber(input.bookingDate)
  if (!Number.isFinite(scheduled) || !Number.isFinite(booked)) return null
  const dateDistance = Math.abs(scheduled - booked) / 86_400_000
  if (dateDistance > 14) return null

  const amountMatches = round2(input.expectedGrossAmount) === round2(input.bookingGrossAmount)
  if (!input.variableAmount && !amountMatches) return null

  const recurringWords = words(input.recurringText)
  const bookingWords = words(input.bookingText)
  let sharedWords = 0
  for (const word of recurringWords) if (bookingWords.has(word)) sharedWords++

  const normalizedRecurring = normalizeText(input.recurringText)
  const normalizedBooking = normalizeText(input.bookingText)
  const containsText = normalizedRecurring.length >= 4 && normalizedBooking.length >= 4 &&
    (normalizedRecurring.includes(normalizedBooking) || normalizedBooking.includes(normalizedRecurring))

  const dateScore = Math.max(0, 30 - dateDistance * 2)
  const amountScore = amountMatches ? 30 : 10
  const textScore = Math.min(20, sharedWords * 10) + (containsText ? 10 : 0)
  const score = Math.max(0, Math.min(100, Math.round(20 + dateScore + amountScore + textScore)))

  return { score, dateDistance, sharedWords, amountMatches }
}
