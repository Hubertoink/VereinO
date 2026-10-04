import { listDue, status } from '../repositories/members_payments'

export function memberLetterContributionParagraphs(memberId?: number): string[] {
  if (memberId == null) return []

  const paymentStatus = status({ memberId })
  if (!paymentStatus.hasPlan || !('interval' in paymentStatus) || !paymentStatus.interval) return []
  const interval = paymentStatus.interval

  const today = new Date().toISOString().slice(0, 10)
  const { rows } = listDue({
    memberId,
    interval,
    from: paymentStatus.nextDue || paymentStatus.joinDate || `${today.slice(0, 4)}-01-01`,
    to: today,
    includePaid: false
  })
  if (!rows.length) return []

  const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
  const periodLabel = (periodKey: string): string => {
    if (interval === 'MONTHLY') {
      const [year, month] = periodKey.split('-').map(Number)
      return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('de-DE', {
        month: 'long', year: 'numeric', timeZone: 'UTC'
      })
    }
    if (interval === 'QUARTERLY') {
      const [year, quarter] = periodKey.split('-Q')
      return `${quarter}. Quartal ${year}`
    }
    return periodKey
  }
  const totalCents = rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0)

  return [
    'Nach unserem aktuellen Beitragsstand sind folgende Mitgliedsbeiträge noch offen:',
    ...rows.map(row => `${periodLabel(row.periodKey)}: ${eur.format(row.amount)}`),
    `Offener Gesamtbetrag: ${eur.format(totalCents / 100)}`,
    'Bitte begleichen Sie die offenen Mitgliedsbeiträge. Falls Sie bereits bezahlt haben, teilen Sie uns bitte das Zahlungsdatum mit, damit wir die Zahlung zuordnen können.'
  ]
}
