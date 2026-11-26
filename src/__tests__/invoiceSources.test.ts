import { locateInvoiceSource, resolveInvoiceSources, type SourcePage } from '../renderer/utils/invoiceSources'
import { EMPTY_LOCAL_INVOICE_FIELDS, extractLocalInvoiceFields } from '../renderer/utils/localInvoiceExtraction'

const source = { field: 'grossAmount' as const, page: 1, text: '−119 €' }
const page: SourcePage = {
  width: 1000, height: 2000,
  words: [
    { text: 'brutto', x: 600, y: 1000, width: 100, height: 30 },
    { text: '−119', x: 720, y: 1000, width: 80, height: 30 },
    { text: '€', x: 810, y: 1000, width: 20, height: 30 }
  ]
}

test('locates an original negative credit amount and joins adjacent words in scale-independent coordinates', () => {
  expect(locateInvoiceSource(source, page)).toEqual([{ x: 72, y: 50, width: 11, height: 1.5 }])
  expect(locateInvoiceSource({ ...source, text: '-119\u00a0€' }, page)).toHaveLength(1)
})

test('omits absent or ambiguous sources instead of guessing', () => {
  expect(locateInvoiceSource(source)).toEqual([])
  expect(locateInvoiceSource({ ...source, text: '120 €' }, page)).toEqual([])
  expect(locateInvoiceSource(source, { ...page, words: [...page.words, ...page.words] })).toEqual([])
})

test('context disambiguates repeated values', () => {
  const repeated = { ...page, words: [...page.words, { text: '119 €', x: 10, y: 10, width: 80, height: 30 }] }
  expect(locateInvoiceSource({ ...source, text: 'brutto −119 €' }, repeated)).toEqual([{ x: 60, y: 50, width: 23, height: 1.5 }])
})

test('does not confuse a substring of a different amount with evidence', () => {
  expect(locateInvoiceSource({ ...source, text: '119 €' }, { ...page, words: [{ text: '1119 €', x: 10, y: 10, width: 80, height: 30 }] })).toEqual([])
})

test('keeps separate rectangles for different lines and does not mutate OCR geometry', () => {
  const original = JSON.stringify(page)
  locateInvoiceSource(source, page)
  expect(JSON.stringify(page)).toBe(original)
  expect(locateInvoiceSource({ ...source, text: 'brutto −119 €' }, { ...page, words: page.words.map((word, index) => ({ ...word, y: index * 100 })) })).toHaveLength(3)
})

const word = (text: string, x: number, y: number) => ({ text, x, y, width: 70, height: 20 })
const receipt = { ...page, words: [
  word('3.998,40', 800, 400), word('EUR', 600, 400), word('Endsumme', 300, 402),
  word('Einzelpreis', 300, 200), word('3.998,40', 800, 200),
  word('Summe Netto', 300, 300), word('3.359,97', 800, 300),
  word('Umsatzsteuer 19 %', 300, 350), word('638,43', 800, 350)
] }
const fields = { ...EMPTY_LOCAL_INVOICE_FIELDS, grossAmount: '3998.40', netAmount: '3998.00', taxAmount: '638.43' }

test('locates the labelled gross and tax amounts when AI omits their sources and OCR returns columns out of order', () => {
  const sources = resolveInvoiceSources([], { 2: receipt }, fields, new Set())
  expect(sources.map(s => s.field).sort()).toEqual(['grossAmount', 'taxAmount'])
  expect(sources.find(s => s.field === 'grossAmount')).toMatchObject({
    page: 2, text: 'Endsumme EUR 3.998,40', boxes: [{ x: 80, y: 20, width: 7, height: 1 }]
  })
  expect(extractLocalInvoiceFields('Angebot\nEndsumme EUR 3.998,40').grossAmount).toBe('3998.40')
})

test.each(['Zwischensumme 3.998,40', 'Endsumme 13.998,40', 'Endsumme −3.998,40',
  'Endsumme 3.998,40 500,00', 'Gesamt netto 3.998,40', 'Endsumme 3.998,41'])(
  'does not attribute an incompatible printed row to gross: %s', line => {
    expect(resolveInvoiceSources([], { 1: { ...page, words: [word(line, 20, 100)] } }, fields, new Set())).toEqual([])
  }
)

test('retains verified AI sources and skips ambiguous totals and manually edited fields', () => {
  const pages = { 1: receipt, 2: receipt }
  expect(resolveInvoiceSources([], pages, fields, new Set())).toEqual([])
  const explicit = { field: 'taxAmount' as const, page: 2, text: '638,43' }
  expect(resolveInvoiceSources([explicit], pages, fields, new Set())).toHaveLength(1)
  expect(resolveInvoiceSources([explicit], { 1: receipt }, fields, new Set(['grossAmount', 'taxAmount']))).toEqual([])
})
