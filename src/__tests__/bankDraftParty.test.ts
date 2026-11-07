import { resolveBankDraftParty } from '../renderer/utils/bankDraftParty'

const source = { counterparty: 'OBI GmbH', counterpartyIban: 'DE12 5001 0517 0648 4898 90' }
const obi = { id: 7, name: 'OBI', legalName: 'OBI GmbH', iban: 'DE12500105170648489890', isActive: 1 }

test('finds the existing party by original name and IBAN without creating anything', async () => {
  const list = jest.fn(async () => ({ rows: [obi] }))
  expect(await resolveBankDraftParty(source, list)).toEqual({ partyId: 7, counterparty: 'OBI' })
  expect(list).toHaveBeenCalledWith({ q: 'OBI', activeOnly: true, limit: 500 })
  expect(list).toHaveBeenCalledWith({ q: obi.iban, activeOnly: true, limit: 500 })
})

test('matches a unique name even if no IBAN is stored', async () => {
  expect(await resolveBankDraftParty(source, async () => ({ rows: [{ ...obi, iban: null }] }))).toEqual({ partyId: 7, counterparty: 'OBI' })
})

test('IBAN can resolve a differently written bank counterparty', async () => {
  expect(await resolveBankDraftParty({ ...source, counterparty: 'OBI Markt 123' }, async () => ({ rows: [obi] }))).toEqual({ partyId: 7, counterparty: 'OBI' })
})

test('unknown parties keep the imported name ready for manual creation', async () => {
  expect(await resolveBankDraftParty(source, async () => ({ rows: [] }))).toEqual({ partyId: null, counterparty: 'OBI GmbH' })
})

test('ambiguous names and conflicting name/IBAN matches are not auto-assigned', async () => {
  const other = { ...obi, id: 8, iban: 'DE89370400440532013000' }
  expect((await resolveBankDraftParty({ counterparty: 'OBI GmbH' }, async () => ({ rows: [obi, other] })))).toEqual({ partyId: null, counterparty: 'OBI GmbH' })
  expect((await resolveBankDraftParty(source, async () => ({ rows: [other, { ...obi, name: 'Anderer Partner', legalName: null }] })))).toEqual({ partyId: null, counterparty: 'OBI GmbH' })
  expect((await resolveBankDraftParty(source, async () => ({ rows: [other] })))).toEqual({ partyId: null, counterparty: 'OBI GmbH' })
})

test('a unique IBAN disambiguates same-name partners; archived entries are excluded', async () => {
  expect((await resolveBankDraftParty(source, async () => ({ rows: [obi, { ...obi, id: 8, iban: null }] })))).toEqual({ partyId: 7, counterparty: 'OBI' })
  expect((await resolveBankDraftParty(source, async () => ({ rows: [{ ...obi, isActive: 0 }] })))).toEqual({ partyId: null, counterparty: 'OBI GmbH' })
})

test('lookup failure and truncated results preserve original text without guessing an ID', async () => {
  expect(await resolveBankDraftParty(source, async () => { throw new Error('offline') })).toEqual({ partyId: null, counterparty: 'OBI GmbH' })
  expect(await resolveBankDraftParty(source, async () => ({ rows: Array.from({ length: 500 }, () => obi) }))).toEqual({ partyId: null, counterparty: 'OBI GmbH' })
})
