import { Buffer as NodeBuffer } from 'node:buffer'
import { XMLParser } from 'fast-xml-parser'

export type BankStatementFormat = 'CAMT' | 'CSV'

export type BankCsvMapping = {
  bookingDate?: string | null
  valueDate?: string | null
  amount?: string | null
  debit?: string | null
  credit?: string | null
  currency?: string | null
  counterparty?: string | null
  counterpartyIban?: string | null
  purpose?: string | null
  endToEndId?: string | null
  reference?: string | null
  accountIban?: string | null
}

export type ParsedBankTransaction = {
  sourceRow: number
  bookingDate: string
  valueDate?: string
  direction: 'IN' | 'OUT'
  amount: number
  currency: string
  counterparty?: string
  counterpartyIban?: string
  purpose?: string
  endToEndId?: string
  bankReference?: string
  accountIban?: string
  raw: Record<string, unknown>
  errors: string[]
}

export type ParsedBankStatement = {
  format: BankStatementFormat
  headers: string[]
  suggestedMapping: BankCsvMapping
  accountIbans: string[]
  rows: ParsedBankTransaction[]
}

function arrayify<T>(value: T | T[] | null | undefined): T[] {
  return value == null ? [] : Array.isArray(value) ? value : [value]
}

function text(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)['#text'] ?? '').trim()
  }
  return String(value).trim()
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

const IBAN_PATTERN = /\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]){11,30}\b/gi
const IBAN_WITH_LABEL_PATTERN = /\b(?:IBAN|KONTO|KTO)\s*:?\s*[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]){11,30}\b/gi

function stripIbans(value: string) {
  return compactWhitespace(value.replace(IBAN_WITH_LABEL_PATTERN, ' ').replace(IBAN_PATTERN, ' ').replace(/\s+([,.;:|])/g, '$1'))
}

function cleanBankText(value: unknown): string {
  return stripIbans(text(value))
}

function normalizeIban(value: unknown) {
  return text(value).replace(/\s+/g, '').toUpperCase()
}

function isoDate(value: unknown): string {
  const raw = text(value)
  if (!raw) return ''
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  match = /^(\d{2})[./-](\d{2})[./-](\d{4})$/.exec(raw)
  if (match) return `${match[3]}-${match[2]}-${match[1]}`
  match = /^(\d{4})(\d{2})(\d{2})$/.exec(raw)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : ''
}

function amountValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let raw = text(value).replace(/\s|\u00a0|€|EUR/gi, '')
  if (!raw) return null
  const comma = raw.lastIndexOf(',')
  const dot = raw.lastIndexOf('.')
  if (comma > dot) raw = raw.replace(/\./g, '').replace(',', '.')
  else if (dot > comma && comma >= 0) raw = raw.replace(/,/g, '')
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function detectFormat(buffer: Buffer, fileName: string): BankStatementFormat {
  const start = buffer.subarray(0, 1000).toString('utf8').trim().toLowerCase()
  if (fileName.toLowerCase().endsWith('.xml') || start.startsWith('<?xml') || start.includes('<document')) return 'CAMT'
  return 'CSV'
}

function decodeTextBuffer(buffer: Buffer, preferredEncoding?: string) {
  const normalizedEncoding = preferredEncoding?.trim().replace(/^['"]|['"]$/g, '').toLowerCase()
  const decoderLabels: string[] = []
  if (normalizedEncoding) decoderLabels.push(normalizedEncoding)
  decoderLabels.push('utf-8', 'windows-1252')

  for (const label of [...new Set(decoderLabels)]) {
    try {
      return new TextDecoder(label, { fatal: true }).decode(buffer).replace(/^\uFEFF/, '')
    } catch {
      // Try the next declared or fallback encoding.
    }
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(buffer).replace(/^\uFEFF/, '')
}

function decodeXml(buffer: Buffer) {
  const head = buffer.subarray(0, 200).toString('ascii')
  const encoding = /<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i.exec(head)?.[1]
  return decodeTextBuffer(buffer, encoding)
}

function currencyFrom(value: unknown): string {
  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>
    return text(objectValue['@_Ccy'] ?? objectValue['@_ccy'] ?? 'EUR').toUpperCase()
  }
  return 'EUR'
}

function partyName(value: any) {
  return cleanBankText(value?.Nm ?? value?.Pty?.Nm)
}

export function parseCamtStatement(xml: string): ParsedBankStatement {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    removeNSPrefix: true
  })
  const document = parser.parse(xml) as any
  const root = document?.Document ?? document
  const message = root?.BkToCstmrStmt ?? root?.BkToCstmrAcctRpt
  const statements = arrayify<any>(message?.Stmt ?? message?.Rpt)
  const rows: ParsedBankTransaction[] = []
  const accountIbans = new Set<string>()
  let sourceRow = 2

  for (const statement of statements) {
    const accountIban = normalizeIban(statement?.Acct?.Id?.IBAN)
    if (accountIban) accountIbans.add(accountIban)
    for (const entry of arrayify<any>(statement?.Ntry)) {
      const creditDebit = text(entry?.CdtDbtInd).toUpperCase()
      const amount = amountValue(entry?.Amt)
      const bookingDate = isoDate(entry?.BookgDt?.Dt ?? entry?.BookgDt?.DtTm)
      const valueDate = isoDate(entry?.ValDt?.Dt ?? entry?.ValDt?.DtTm)
      const purposes: string[] = []
      let counterparty = ''
      let counterpartyIban = ''
      let endToEndId = ''
      let bankReference = text(entry?.NtryRef ?? entry?.AcctSvcrRef)

      const transactionDetails = arrayify<any>(entry?.NtryDtls).flatMap((details) => arrayify<any>(details?.TxDtls))
      for (const details of transactionDetails) {
        for (const purpose of arrayify<any>(details?.RmtInf?.Ustrd)) {
          const value = cleanBankText(purpose)
          if (value) purposes.push(value)
        }
        const parties = details?.RltdPties ?? {}
        const isCredit = creditDebit === 'CRDT' || creditDebit === 'CR'
        const party = isCredit
          ? (parties?.Dbtr ?? details?.Dbtr)
          : (parties?.Cdtr ?? details?.Cdtr)
        counterparty ||= partyName(party)
        const account = isCredit
          ? (parties?.DbtrAcct ?? details?.DbtrAcct)
          : (parties?.CdtrAcct ?? details?.CdtrAcct)
        counterpartyIban ||= normalizeIban(account?.Id?.IBAN)
        endToEndId ||= text(details?.Refs?.EndToEndId)
        bankReference ||= text(details?.Refs?.AcctSvcrRef ?? details?.Refs?.TxId)
      }

      const fallbackPurpose = cleanBankText(entry?.AddtlNtryInf)
      if (!purposes.length && fallbackPurpose) purposes.push(fallbackPurpose)
      const errors: string[] = []
      if (!bookingDate) errors.push('Buchungsdatum fehlt oder ist ungültig.')
      if (amount == null || amount === 0) errors.push('Betrag fehlt oder ist 0.')
      if (!['CRDT', 'CR', 'DBIT', 'DB'].includes(creditDebit)) errors.push('Buchungsrichtung fehlt.')
      const currency = currencyFrom(entry?.Amt)
      if (currency !== 'EUR') errors.push(`Währung ${currency} wird nicht unterstützt.`)

      rows.push({
        sourceRow: sourceRow++,
        bookingDate,
        valueDate: valueDate || undefined,
        direction: creditDebit === 'CRDT' || creditDebit === 'CR' ? 'IN' : 'OUT',
        amount: Math.abs(amount ?? 0),
        currency,
        counterparty: counterparty || undefined,
        counterpartyIban: counterpartyIban || undefined,
        purpose: purposes.join(' | ') || undefined,
        endToEndId: endToEndId || undefined,
        bankReference: bankReference || undefined,
        accountIban: accountIban || undefined,
        raw: entry,
        errors
      })
    }
  }

  return {
    format: 'CAMT',
    headers: [],
    suggestedMapping: {},
    accountIbans: [...accountIbans],
    rows
  }
}

function decodeCsv(buffer: Buffer) {
  return decodeTextBuffer(buffer)
}

function detectDelimiter(csv: string) {
  const sample = csv.split(/\r?\n/).slice(0, 8).join('\n')
  const candidates = [';', ',', '\t']
  let best = ';'
  let bestCount = -1
  for (const candidate of candidates) {
    let count = 0
    let quoted = false
    for (const char of sample) {
      if (char === '"') quoted = !quoted
      else if (!quoted && char === candidate) count++
    }
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

function parseCsvRecords(csv: string, delimiter: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index]
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"'
        index++
      } else {
        quoted = !quoted
      }
    } else if (char === delimiter && !quoted) {
      record.push(field.trim())
      field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && csv[index + 1] === '\n') index++
      record.push(field.trim())
      field = ''
      if (record.some(Boolean)) records.push(record)
      record = []
    } else {
      field += char
    }
  }
  record.push(field.trim())
  if (record.some(Boolean)) records.push(record)
  return records
}

function normalizedHeader(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function suggestCsvMapping(headers: string[]): BankCsvMapping {
  const find = (...patterns: RegExp[]) => headers.find((header) => patterns.some((pattern) => pattern.test(normalizedHeader(header)))) ?? null
  return {
    bookingDate: find(/^buchungstag$/, /^buchungsdatum$/, /^datum$/, /booking date/),
    valueDate: find(/^valuta$/, /^wertstellung$/, /value date/),
    amount: find(/^betrag$/, /^umsatz$/, /^amount$/),
    debit: find(/^soll$/, /^belastung$/, /debit/),
    credit: find(/^haben$/, /^gutschrift$/, /credit/),
    currency: find(/^wahrung$/, /^waehrung$/, /^currency$/),
    counterparty: find(/auftraggeber/, /begunstigter/, /zahlungspflichtiger/, /empfanger/, /name gegenkonto/, /counterparty/),
    counterpartyIban: find(/iban gegenkonto/, /gegenkonto iban/, /counterparty iban/),
    purpose: find(/verwendungszweck/, /buchungstext/, /umsatztext/, /purpose/, /description/),
    endToEndId: find(/end to end/, /endtoendid/),
    reference: find(/kundenreferenz/, /bankreferenz/, /mandatsreferenz/, /^referenz$/, /transaction id/),
    accountIban: find(/^iban$/, /konto iban/, /own iban/)
  }
}

function parseCsvStatement(buffer: Buffer, mapping?: BankCsvMapping): ParsedBankStatement {
  const csv = decodeCsv(buffer)
  const records = parseCsvRecords(csv, detectDelimiter(csv))
  const headers = (records[0] ?? []).map((header, index) => header || `Spalte ${index + 1}`)
  const suggestedMapping = suggestCsvMapping(headers)
  const selected = { ...suggestedMapping, ...(mapping ?? {}) }
  const accountIbans = new Set<string>()
  const rows: ParsedBankTransaction[] = []

  const read = (record: string[], field?: string | null) => {
    if (!field) return ''
    const index = headers.indexOf(field)
    return index >= 0 ? record[index] ?? '' : ''
  }

  records.slice(1).forEach((record, index) => {
    const amount = amountValue(read(record, selected.amount))
    const debit = amountValue(read(record, selected.debit))
    const credit = amountValue(read(record, selected.credit))
    let signedAmount = amount
    if (credit != null && credit !== 0) signedAmount = Math.abs(credit)
    else if (debit != null && debit !== 0) signedAmount = -Math.abs(debit)
    const bookingDate = isoDate(read(record, selected.bookingDate))
    const valueDate = isoDate(read(record, selected.valueDate))
    const currency = (read(record, selected.currency) || 'EUR').toUpperCase().trim()
    const accountIban = normalizeIban(read(record, selected.accountIban))
    if (accountIban) accountIbans.add(accountIban)
    const errors: string[] = []
    if (!bookingDate) errors.push('Buchungsdatum fehlt oder ist ungültig.')
    if (signedAmount == null || signedAmount === 0) errors.push('Betrag fehlt oder ist 0.')
    if (currency !== 'EUR') errors.push(`Währung ${currency} wird nicht unterstützt.`)

    const raw = Object.fromEntries(headers.map((header, column) => [header, record[column] ?? '']))
    rows.push({
      sourceRow: index + 2,
      bookingDate,
      valueDate: valueDate || undefined,
      direction: (signedAmount ?? 0) < 0 ? 'OUT' : 'IN',
      amount: Math.abs(signedAmount ?? 0),
      currency,
      counterparty: cleanBankText(read(record, selected.counterparty)) || undefined,
      counterpartyIban: normalizeIban(read(record, selected.counterpartyIban)) || undefined,
      purpose: cleanBankText(read(record, selected.purpose)) || undefined,
      endToEndId: read(record, selected.endToEndId) || undefined,
      bankReference: read(record, selected.reference) || undefined,
      accountIban: accountIban || undefined,
      raw,
      errors
    })
  })

  return { format: 'CSV', headers, suggestedMapping, accountIbans: [...accountIbans], rows }
}

export function parseBankStatement(fileBase64: string, fileName: string, mapping?: BankCsvMapping): ParsedBankStatement {
  const buffer = NodeBuffer.from(fileBase64, 'base64')
  const format = detectFormat(buffer, fileName)
  if (format === 'CAMT') return parseCamtStatement(decodeXml(buffer))
  return parseCsvStatement(buffer, mapping)
}
