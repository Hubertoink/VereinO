import { MONEY_PATTERN, normalizeInvoicePickerValue, type LocalInvoiceFields, type LocalInvoicePickerField } from './localInvoiceExtraction'

export type InvoiceSource = { field: LocalInvoicePickerField; page: number; text: string }
export type SourceWord = { text: string; x: number; y: number; width: number; height: number }
export type SourcePage = { width: number; height: number; words: SourceWord[] }

// Keep punctuation and signs: a credit of −119 € is not the same quote as 119 €.
function normalize(text: string) {
  return text.normalize('NFKC').toLocaleLowerCase('de').replace(/[−–]/g, '-').replace(/\s/g, '')
}

export function locateInvoiceSource(source: InvoiceSource, page?: SourcePage) {
  if (!page || page.width <= 0 || page.height <= 0) return []
  const needle = normalize(source.text)
  if (!needle) return []
  let text = ''
  const ranges = page.words.map((word) => {
    const start = text.length
    text += normalize(word.text)
    return { word, start, end: text.length }
  })
  const start = text.indexOf(needle)
  // Ambiguous occurrences are intentionally not presented as proven evidence.
  if (start < 0 || text.indexOf(needle, start + 1) >= 0) return []
  const end = start + needle.length
  // Do not match 119 inside 1119 or an invoice number inside a longer number.
  if (/\d/.test(needle[0]) && start > 0 && /\d/.test(text[start - 1]) && ranges.some((r) => r.start < start && r.end > start)) return []
  if (/\d/.test(needle[needle.length - 1]) && /\d/.test(text[end] || '') && ranges.some((r) => r.start < end && r.end > end)) return []
  return sourceBoxes(ranges.filter((r) => r.end > start && r.start < end).map(r => r.word), page)
}

function sourceBoxes(words: SourceWord[], page: SourcePage) {
  const boxes: SourceWord[] = []
  for (const word of words) {
    if (![word.x, word.y, word.width, word.height].every(Number.isFinite) || word.width <= 0 || word.height <= 0) continue
    const previous = boxes[boxes.length - 1]
    const sameLine = previous && Math.abs(previous.y + previous.height / 2 - word.y - word.height / 2) < Math.min(previous.height, word.height) * 0.5
    if (sameLine && word.x >= previous.x && word.x - previous.x - previous.width < word.height * 3) {
      const right = Math.max(previous.x + previous.width, word.x + word.width)
      const bottom = Math.max(previous.y + previous.height, word.y + word.height)
      previous.y = Math.min(previous.y, word.y)
      previous.width = right - previous.x
      previous.height = bottom - previous.y
    } else boxes.push({ ...word })
  }
  return boxes.map((word) => ({
    x: 100 * word.x / page.width,
    y: 100 * word.y / page.height,
    width: 100 * word.width / page.width,
    height: 100 * word.height / page.height
  }))
}

const amountLabels = {
  grossAmount: /^(?:endsumme|endbetrag|rechnungs(?:end)?betrag|gesamt(?:betrag|summe)?(?:\s+brutto)?|(?:summe\s+)?brutto(?:betrag|summe)?|zu zahlen|zahlbetrag|grand total|amount due)\b/i,
  netAmount: /^(?:(?:summe|gesamt)\s+netto|netto(?:betrag|summe)?|net (?:amount|total)|subtotal)\b/i,
  taxAmount: /^(?:mwst|ust|umsatzsteuer|mehrwertsteuer|vat|tax amount)\b\.?(?:\s*\(?\d{1,2}(?:[.,]\d{1,2})?\s*%\)?)?/i
}
type AmountField = keyof typeof amountLabels
type LocatedSource = InvoiceSource & { boxes: ReturnType<typeof sourceBoxes> }

// OCR can return the amount column in a different reading order from its labels.
function printedRows(words: SourceWord[]) {
  const center = (word: SourceWord) => word.y + word.height / 2
  const sorted = words.filter(w => w.width > 0 && w.height > 0 && w.text.trim()).sort((a, b) => center(a) - center(b))
  const rows: SourceWord[][] = []
  for (const word of sorted) {
    const row = rows[rows.length - 1]
    if (row && center(word) - center(row[0]) <= Math.min(word.height, row[0].height) * 0.55) row.push(word)
    else rows.push([word])
  }
  return rows.map(row => row.sort((a, b) => a.x - b.x))
}

// Require a single currency amount following the label. Percentages, item
// prices and amounts in adjacent columns must not become evidence by accident.
const printedAmount = new RegExp('^\\s*[:.]?\\s*(?:EUR|€)?\\s*(' + MONEY_PATTERN.source + ')\\s*(?:EUR|€)?\\s*[*]?\\s*$', 'i')
const quotedAmounts = new RegExp('(?<![\\d.,])(?:' + MONEY_PATTERN.source + '|-?\\d+)(?![\\d.,])', 'g')

function* labelledAmounts(page: Pick<SourcePage, 'words'>) {
  for (const row of printedRows(page.words)) {
    const tokens = row.map(word => word.text.trim().normalize('NFKC').replace(/[−–]/g, '-'))
    const text = tokens.join(' ')
    for (const field of Object.keys(amountLabels) as AmountField[]) {
      const label = text.match(amountLabels[field])
      if (!label) continue
      const tail = text.slice(label[0].length)
      const amount = tail.match(printedAmount)
      if (!amount) continue
      const start = label[0].length + tail.indexOf(amount[1])
      const end = start + amount[1].length
      let offset = 0
      const words = row.filter((_, index) => {
        const tokenStart = offset
        offset += tokens[index].length + 1
        return tokenStart < end && offset - 1 > start
      })
      yield { field, text, words, value: normalizeInvoicePickerValue(field, amount[1]) }
    }
  }
}

export function extractPrintedAmounts(pages: Pick<SourcePage, 'words'>[]) {
  const amounts: Partial<Record<AmountField, string>> = {}
  const seen = new Set<AmountField>()
  for (const page of pages) {
    for (const { field, value } of labelledAmounts(page)) {
      if (seen.has(field)) delete amounts[field]
      else amounts[field] = value
      seen.add(field)
    }
  }
  return amounts
}

export function resolveInvoiceSources(sources: InvoiceSource[], pages: Record<number, SourcePage>,
  fields: LocalInvoiceFields, edited: ReadonlySet<LocalInvoicePickerField>) {
  const located: LocatedSource[] = sources.filter(source => !edited.has(source.field)).flatMap(source => {
    if (source.field in amountLabels) {
      if (!fields[source.field]) return []
      const amounts = source.text.replace(/[−–]/g, '-').match(quotedAmounts) || []
      // The AI stores credit amounts as positive values and quotes the printed sign.
      if (!amounts.some(amount => Math.abs(Number(normalizeInvoicePickerValue(source.field, amount))) === Math.abs(Number(fields[source.field])))) return []
    }
    const boxes = locateInvoiceSource(source, pages[source.page])
    return boxes.length ? [{ ...source, boxes }] : []
  })
  const missing = (Object.keys(amountLabels) as AmountField[]).filter(field =>
    fields[field] && !edited.has(field) && !located.some(s => s.field === field))
  if (!missing.length) return located
  const candidates = new Map<AmountField, LocatedSource[]>()
  for (const [number, page] of Object.entries(pages)) {
    if (!(page.width > 0 && page.height > 0)) continue
    for (const { field, text, words, value } of labelledAmounts(page)) {
      if (!missing.includes(field) || value !== fields[field]) continue
      const source = { field, page: Number(number), text, boxes: sourceBoxes(words, page) }
      const matches = candidates.get(field) || []
      matches.push(source)
      candidates.set(field, matches)
    }
  }
  for (const matches of candidates.values()) if (matches.length === 1) located.push(matches[0])
  return located
}
