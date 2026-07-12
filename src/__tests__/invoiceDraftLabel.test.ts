import { compactInvoiceDraftSubject, invoiceDraftTabText } from '../renderer/utils/invoiceDraftLabel'

describe('invoice draft tab labels', () => {
  test('keeps the generic label without a description', () => {
    expect(invoiceDraftTabText('')).toEqual({
      label: 'Rechnung erfassen',
      title: 'Rechnung erfassen'
    })
  })

  test('uses the invoice description as its subject', () => {
    expect(invoiceDraftTabText('Neue Trikots Jugendmannschaft').label).toBe(
      'Rechnung – Neue Trikots Jugendmannschaft'
    )
  })

  test('normalizes whitespace and truncates long subjects', () => {
    expect(compactInvoiceDraftSubject('  Sehr lange\nBeschreibung für die neue Ausstattung der gesamten Jugendmannschaft  ')).toBe(
      'Sehr lange Beschreibung für die…'
    )
  })

  test('keeps the full subject in the tooltip', () => {
    expect(invoiceDraftTabText('Sehr lange Beschreibung für die neue Ausstattung der Jugend', true)).toEqual({
      label: 'Rechnung – Sehr lange Beschreibung für die…',
      title: 'Rechnung – Sehr lange Beschreibung für die neue Ausstattung der Jugend · abgedockt'
    })
  })
})
