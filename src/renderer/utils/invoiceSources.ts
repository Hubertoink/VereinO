import type { LocalInvoicePickerField } from './localInvoiceExtraction'

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
  const boxes: SourceWord[] = []
  for (const { word } of ranges.filter((r) => r.end > start && r.start < end)) {
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
