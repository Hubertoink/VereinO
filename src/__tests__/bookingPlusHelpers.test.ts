import { calendarDays, monthRange, mutationBlock, signedAmount, similarQuery, type BookingPlusRow } from '../renderer/views/BookingsPlus/bookingPlusHelpers'
const row = { id: 1, type: 'OUT', grossAmount: 75, date: '2026-08-18', description: 'Ausflug Sommerferien', counterparty: 'Jugendherberge' } as BookingPlusRow

test('calendar uses Monday-first weeks and includes leap days and month ends', () => {
    expect(calendarDays('2024-02').filter(Boolean)).toHaveLength(29)
    expect(calendarDays('2024-02')[3]).toBe('2024-02-01')
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(calendarDays('2026-08').filter(Boolean).at(-1)).toBe('2026-08-31')
})
test('amounts preserve reversal signs and mutation rules include closed periods', () => {
    expect(signedAmount(row)).toBe(-75)
    expect(signedAmount({ ...row, grossAmount: -75, originalId: 2 })).toBe(75)
    expect(mutationBlock(row, '2026-08-18')).toContain('abgeschlossen')
    expect(mutationBlock({ ...row, reversedById: 3 })).toContain('storniert')
    expect(mutationBlock(row)).toBe('')
})
test('similarity uses the counterparty, then a bounded description search', () => {
    expect(similarQuery(row)).toBe('Jugendherberge')
    expect(similarQuery({ ...row, counterparty: null, description: 'Adobe Photoshop Abo September 2026' })).toBe('Adobe Photoshop Abo')
    expect(similarQuery({ ...row, counterparty: null, description: null })).toBe('')
})
