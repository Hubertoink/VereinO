export type LocalInvoiceFields = {
  supplier: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  grossAmount: string
  netAmount: string
  taxAmount: string
  iban: string
  description: string
}

export const EMPTY_LOCAL_INVOICE_FIELDS: LocalInvoiceFields = {
  supplier: '',
  invoiceNumber: '',
  invoiceDate: '',
  dueDate: '',
  grossAmount: '',
  netAmount: '',
  taxAmount: '',
  iban: '',
  description: ''
}

type PdfTextItemLike = {
  str?: unknown
  hasEOL?: boolean
  transform?: ArrayLike<number>
  width?: number
  height?: number
}

export function joinPdfTextItems(items: readonly PdfTextItemLike[]) {
  const lines: string[] = []
  let currentLine = ''
  let currentBaseline: number | null = null
  let previousEnd: number | null = null
  let previousFontHeight: number | null = null
  let previousCharacterWidth: number | null = null
  let previousEndedWithSpace = false

  const flushLine = () => {
    const line = currentLine
      .replace(/[ \t]+/g, (space) => (space.includes('\t') ? '\t' : ' '))
      .trim()
    if (line) lines.push(line)
    currentLine = ''
    currentBaseline = null
    previousEnd = null
    previousFontHeight = null
    previousCharacterWidth = null
    previousEndedWithSpace = false
  }

  for (const item of items) {
    if (typeof item.str !== 'string' || !item.str) continue
    const rawText = item.str.replace(/[\u00a0\u2007\u202f]/g, ' ')
    if (!rawText.trim()) {
      previousEndedWithSpace = true
      continue
    }
    const text = rawText.trim()
    const baseline = Number(item.transform?.[5])
    const hasBaseline = Number.isFinite(baseline)
    const fontHeight = Math.max(
      Number(item.height || 0),
      Math.hypot(Number(item.transform?.[2] || 0), Number(item.transform?.[3] || 0))
    )
    const baselineTolerance = Math.max(
      1.5,
      Math.min(fontHeight || 12, previousFontHeight || fontHeight || 12) * 0.2
    )
    if (
      currentLine &&
      hasBaseline &&
      currentBaseline != null &&
      Math.abs(baseline - currentBaseline) > baselineTolerance
    ) {
      flushLine()
    }

    const x = Number(item.transform?.[4])
    const hasX = Number.isFinite(x)
    const width = Number(item.width || 0)
    const characterWidth = width > 0 ? width / Math.max(1, text.length) : null
    let separator = ''
    if (currentLine) {
      if (previousEndedWithSpace || /^\s/.test(rawText)) {
        separator = ' '
      } else if (hasX && previousEnd != null) {
        const gap = x - previousEnd
        const referenceWidth = Math.max(
          1,
          previousCharacterWidth ||
            characterWidth ||
            (fontHeight || previousFontHeight || 10) * 0.45
        )
        const wordGap = Math.max(
          referenceWidth * 0.62,
          (fontHeight || previousFontHeight || 10) * 0.22
        )
        const columnGap = Math.max(
          referenceWidth * 3.5,
          (fontHeight || previousFontHeight || 10) * 1.35
        )
        if (gap > columnGap) separator = '\t'
        else if (gap > wordGap) separator = ' '
      } else {
        separator = ' '
      }
    }

    currentLine += `${separator}${text}`
    if (hasBaseline && currentBaseline == null) currentBaseline = baseline
    previousEnd = hasX && width > 0 ? x + width : null
    previousFontHeight = fontHeight || previousFontHeight
    previousCharacterWidth = characterWidth || previousCharacterWidth
    previousEndedWithSpace = /\s$/.test(rawText)
    if (item.hasEOL) flushLine()
  }

  flushLine()
  return lines.join('\n')
}

function normalizeArtificialCharacterSpacing(line: string) {
  const tokens = line.trim().split(/\s+/).filter(Boolean)
  if (tokens.length < 4) return line.replace(/\s+/g, ' ').trim()
  const singleCharacterTokens = tokens.filter((token) =>
    /^[\p{L}\p{N}.,:%€#\/_-]$/u.test(token)
  ).length
  if (singleCharacterTokens / tokens.length < 0.78) return line.replace(/\s+/g, ' ').trim()
  return tokens.join('')
}

export function normalizeInvoiceExtractionText(text: string) {
  return text
    .normalize('NFKC')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/\u00ad/g, '')
    .split(/\r?\n/)
    .map(normalizeArtificialCharacterSpacing)
    .join('\n')
}

const DATE_PATTERN = /\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/
const MONEY_PATTERN =
  /-?(?:\d{1,3}(?:,\d{3})+\.\d{2}|\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,3}(?:[ \u00a0]\d{3})+[.,]\d{2}|\d+[.,]\d{2})(?!\d)/
const PICKER_MONEY_PATTERN = new RegExp(`(?:${MONEY_PATTERN.source})|-?\\d+(?![\\d.,])`)

function cleanValue(value: string) {
  return value
    .replace(/^[\s:#-]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function nextUsefulLine(lines: string[], index: number) {
  for (let cursor = index + 1; cursor < Math.min(lines.length, index + 3); cursor += 1) {
    if (lines[cursor]) return lines[cursor]
  }
  return ''
}

function findLabeledValue(lines: string[], labels: RegExp, valuePattern?: RegExp) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const labelMatch = line.match(labels)
    if (!labelMatch) continue

    const sameLine = cleanValue(line.slice((labelMatch.index ?? 0) + labelMatch[0].length))
    const candidates = [sameLine, nextUsefulLine(lines, index)].filter(Boolean)
    for (const candidate of candidates) {
      if (!valuePattern) return cleanValue(candidate)
      const match = candidate.match(valuePattern)
      if (match) return cleanValue(match[0])
    }
  }
  return ''
}

function toIsoDate(value: string) {
  const match = value.match(DATE_PATTERN)
  if (!match) return ''
  const date = match[0]
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date

  const [day, month, yearValue] = date.split(/[./-]/)
  const year = yearValue.length === 2 ? `20${yearValue}` : yearValue
  const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  const parsed = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return ''
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() + 1 !== Number(month) ||
    parsed.getDate() !== Number(day)
  ) {
    return ''
  }
  return normalized
}

function normalizeAmount(value: string, pattern = MONEY_PATTERN) {
  const match = value.match(pattern)
  if (!match) return ''
  let amount = match[0].replace(/\s/g, '')
  const comma = amount.lastIndexOf(',')
  const dot = amount.lastIndexOf('.')

  if (comma > dot) {
    amount = amount.replace(/\./g, '').replace(',', '.')
  } else if (dot > comma && comma >= 0) {
    amount = amount.replace(/,/g, '')
  } else if (comma >= 0) {
    amount = amount.replace(',', '.')
  }
  return /[.,]/.test(match[0]) ? amount : `${amount}.00`
}

function findLabeledAmount(lines: string[], labels: RegExp) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!labels.test(line)) continue
    labels.lastIndex = 0
    const matches = line.match(new RegExp(MONEY_PATTERN.source, 'g')) ?? []
    if (matches.length > 0) return normalizeAmount(matches[matches.length - 1])

    const nextLine = nextUsefulLine(lines, index)
    const nextMatches = nextLine.match(new RegExp(MONEY_PATTERN.source, 'g')) ?? []
    if (nextMatches.length > 0) return normalizeAmount(nextMatches[nextMatches.length - 1])
  }
  return ''
}

function findSummaryAmountFallbacks(lines: string[]) {
  const netIndex = lines.findIndex((line) => /(?:^|\b)netto(?:betrag)?(?:\b|$)/i.test(line))
  const taxIndex = lines.findIndex((line) =>
    /(?:mwst\.?|mehrwertsteuer|umsatzsteuer|vat)/i.test(line)
  )
  const grossIndex = lines.findIndex((line) =>
    /(?:gesamt|rechnungsbetrag|grand total|amount due)/i.test(line)
  )
  const firstLabelIndex = Math.min(
    ...[netIndex, taxIndex, grossIndex].filter((index) => index >= 0)
  )
  if (!Number.isFinite(firstLabelIndex)) return { net: '', tax: '', gross: '' }

  const amounts = lines
    .slice(Math.max(0, firstLabelIndex - 8), firstLabelIndex)
    .flatMap((line) => line.match(new RegExp(MONEY_PATTERN.source, 'g')) ?? [])
    .map((amount) => normalizeAmount(amount))
    .filter(Boolean)
  if (amounts.length < 3) return { net: '', tax: '', gross: '' }
  const [net, tax, gross] = amounts.slice(-3)
  return { net, tax, gross }
}

function findSupplier(lines: string[]) {
  const labeled = findLabeledValue(
    lines,
    /(?:rechnungsteller|lieferant|leistender|vendor|supplier|aussteller)\s*/i
  )
  if (labeled) return labeled

  const ignored =
    /^(?:rechnung|invoice|gutschrift|credit note|datum|date|seite\s+\d+|page\s+\d+|rechnungs(?:nummer|nr)|invoice\s*(?:number|no))\b/i
  return (
    lines
      .slice(0, 12)
      .find(
        (line) =>
          line.length >= 3 &&
          line.length <= 100 &&
          !ignored.test(line) &&
          !DATE_PATTERN.test(line) &&
          !/@/.test(line)
      ) ?? ''
  )
}

export function extractLocalInvoiceFields(text: string): LocalInvoiceFields {
  const normalizedText = normalizeInvoiceExtractionText(text)
  const lines = normalizedText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const invoiceNumber = findLabeledValue(
    lines,
    /(?:rechnungs?[- ]?(?:nummer|nr\.?)|invoice\s*(?:number|no\.?)|belegnummer)\s*/i,
    /[A-Z0-9][A-Z0-9./_-]{1,}/i
  )
  const invoiceDate = toIsoDate(
    findLabeledValue(
      lines,
      /(?:rechnungsdatum|belegdatum|invoice date|date of issue|ausstellungsdatum|^datum)\s*/i,
      DATE_PATTERN
    )
  )
  const dueDate = toIsoDate(
    findLabeledValue(
      lines,
      /(?:fälligkeitsdatum|fällig am|zahlbar bis|due date|payment due)\s*/i,
      DATE_PATTERN
    )
  )
  const summaryFallbacks = findSummaryAmountFallbacks(lines)
  const grossAmount =
    findLabeledAmount(
      lines,
      /(?:^betrag\b|rechnungsbetrag|gesamtbetrag|zu zahlen|zahlbetrag|amount due|grand total|summe brutto|bruttobetrag)/i
    ) || summaryFallbacks.gross
  const netAmount =
    findLabeledAmount(lines, /(?:summe netto|nettobetrag|net amount|net total|subtotal)/i) ||
    summaryFallbacks.net
  const taxAmount =
    findLabeledAmount(lines, /(?:mwst\.?|mehrwertsteuer|umsatzsteuer|vat|tax amount)/i) ||
    summaryFallbacks.tax
  const iban = (
    normalizedText.match(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/i)?.[0] ??
    findLabeledValue(lines, /\biban\s*/i, /[A-Z0-9](?:[ A-Z0-9]{10,33})/i)
  )
    .replace(/\s/g, '')
    .toUpperCase()
  const supplier = findSupplier(lines)

  return {
    supplier,
    invoiceNumber,
    invoiceDate,
    dueDate,
    grossAmount,
    netAmount,
    taxAmount,
    iban,
    description: [supplier, invoiceNumber ? `Rechnung ${invoiceNumber}` : '']
      .filter(Boolean)
      .join(' · ')
  }
}

export type LocalInvoicePickerField = keyof LocalInvoiceFields

export function normalizeInvoicePickerValue(field: LocalInvoicePickerField, selectedText: string) {
  const normalized = normalizeInvoiceExtractionText(selectedText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .trim()

  if (field === 'invoiceDate' || field === 'dueDate') return toIsoDate(normalized)
  if (field === 'grossAmount' || field === 'netAmount' || field === 'taxAmount') {
    return normalizeAmount(normalized, PICKER_MONEY_PATTERN)
  }
  if (field === 'iban') {
    return normalized
      .replace(/^.*?iban\s*[:#-]?\s*/i, '')
      .replace(/\s/g, '')
      .toUpperCase()
  }
  if (field === 'invoiceNumber') {
    return normalized
      .replace(
        /^.*?(?:rechnungs?[- ]?(?:nummer|nr\.?)|invoice\s*(?:number|no\.?)|belegnummer)\s*[:#-]?\s*/i,
        ''
      )
      .trim()
  }
  return normalized
}
