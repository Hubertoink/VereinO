import type { RendererApi } from '../../../types/api'
export type BookingPlusRow = Awaited<ReturnType<RendererApi['vouchers']['list']>>['rows'][number]
export const spheres = { IDEELL: 'Ideell', ZWECK: 'Zweckbetrieb', VERMOEGEN: 'Vermögen', WGB: 'Wirtschaftlich' }
export const kinds = { IN: 'Einnahme', OUT: 'Ausgabe', TRANSFER: 'Umbuchung', INTERNAL: 'Intern' }
export const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const monthRange = (month: string) => ({ from: `${month}-01`, to: isoDate(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)) })
export function calendarDays(month: string): Array<string | null> {
    const first = new Date(`${month}-01T12:00:00`)
    const offset = (first.getDay() + 6) % 7
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => i < offset || i >= offset + count ? null : `${month}-${String(i - offset + 1).padStart(2, '0')}`)
}
export function paymentLabel(row: BookingPlusRow) {
    if (row.type === 'INTERNAL') return 'Intern'
    if (row.type === 'TRANSFER') return `${row.transferFromAccountName || (row.transferFrom === 'BAR' ? 'Bar' : 'Bank')} → ${row.transferToAccountName || (row.transferTo === 'BAR' ? 'Bar' : 'Bank')}`
    return row.paymentAccountName || (row.paymentMethod === 'BAR' ? 'Bar' : row.paymentMethod === 'BANK' ? 'Bank' : '—')
}
export function signedAmount(row: BookingPlusRow) { return row.type === 'OUT' ? -row.grossAmount : row.grossAmount }
export function similarQuery(row: BookingPlusRow) {
    return row.counterparty?.trim() || row.description?.trim().split(/\s+/).slice(0, 3).join(' ') || ''
}
export function mutationBlock(row: BookingPlusRow, closedUntil?: string | null) {
    if (row.originalId) return 'Stornobuchungen können nicht erneut geändert werden.'
    if (row.reversedById) return 'Diese Buchung wurde bereits storniert.'
    if (row.isCashCheck) return 'Kassenprüfungen werden über den Kassenabschluss verwaltet.'
    if (closedUntil && row.date <= closedUntil) return `Der Zeitraum bis ${closedUntil} ist abgeschlossen.`
    return ''
}
