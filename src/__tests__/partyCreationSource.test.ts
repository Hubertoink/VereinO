import { partyCreationIban } from '../renderer/utils/partyCreationSource'
import { AiBookingCandidate, AiInvoiceExtractionResultStructured } from '../../electron/main/ipc/schemas/ai'

test('prefills a known counterparty IBAN and normalizes whitespace and casing', () => {
  expect(partyCreationIban(' OBI   GmbH ', { name: 'obi gmbh', iban: 'de12 5001 0517 0648 4898 90' })).toBe('DE12500105170648489890')
})

test('does not transfer an IBAN to a different or missing counterparty', () => {
  expect(partyCreationIban('REWE', { name: 'OBI GmbH', iban: 'DE12500105170648489890' })).toBe('')
  expect(partyCreationIban('', { name: '', iban: 'DE12500105170648489890' })).toBe('')
  expect(partyCreationIban('OBI GmbH')).toBe('')
})

test('booking extraction preserves the separate counterparty IBAN and accepts older results', () => {
  const candidate = { date: '2026-08-17', type: 'OUT', sphere: 'IDEELL', description: 'Werkzeug', grossAmount: 119, counterparty: 'OBI GmbH' }
  expect(AiBookingCandidate.parse({ ...candidate, counterpartyIban: 'DE12500105170648489890' }).counterpartyIban).toBe('DE12500105170648489890')
  expect(AiBookingCandidate.parse(candidate).counterpartyIban).toBeUndefined()
  expect(AiInvoiceExtractionResultStructured.shape.counterpartyIban.safeParse(null).success).toBe(true)
})
