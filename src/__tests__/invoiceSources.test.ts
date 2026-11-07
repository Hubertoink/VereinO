import { locateInvoiceSource, type SourcePage } from '../renderer/utils/invoiceSources'

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
