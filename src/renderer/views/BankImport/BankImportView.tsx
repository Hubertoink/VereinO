import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { addDataChangedListener, dispatchDataChanged } from '../../utils/refresh'

type PaymentAccount = {
  id: number
  name: string
  kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'
  iban?: string | null
  color?: string | null
  isActive: number
}

type BankTransaction = {
  id: number
  bookingDate: string
  valueDate?: string | null
  direction: 'IN' | 'OUT'
  amount: number
  currency: string
  counterparty?: string | null
  counterpartyIban?: string | null
  purpose?: string | null
  endToEndId?: string | null
  bankReference?: string | null
  status: 'OPEN' | 'LINKED' | 'CHECKED'
  paymentAccountId: number
  paymentAccountName: string
  paymentAccountColor?: string | null
  voucherId?: number | null
  voucherNo?: string | null
  voucherDescription?: string | null
  voucherReversedById?: number | null
  linkOrigin?: 'EXISTING' | 'CREATED' | null
  checkedNote?: string | null
  resolvedAt?: string | null
  sourceFileName: string
}

type BankImportStatus = {
  lastBookingDate: string | null
  lastImportAt?: string | null
  total: number
  accounts: Array<{
    id: number
    name: string
    color?: string | null
    lastBookingDate?: string | null
    lastImportAt?: string | null
    total: number
  }>
}

type CsvMapping = {
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

type ImportPreview = {
  format: 'CAMT' | 'CSV'
  headers: string[]
  suggestedMapping: CsvMapping
  accountIbans: string[]
  detectedPaymentAccountId: number | null
  rows: Array<{
    sourceRow: number
    bookingDate: string
    direction: 'IN' | 'OUT'
    amount: number
    currency: string
    counterparty?: string | null
    purpose?: string | null
    errors: string[]
  }>
  summary: { total: number; valid: number; errors: number }
}

type ImportCommitResult = {
  batchId: number
  imported: number
  duplicates: number
  duplicateRows: Array<{
    sourceRow: number
    bookingDate: string
    valueDate?: string | null
    direction: 'IN' | 'OUT'
    amount: number
    currency: string
    counterparty?: string | null
    purpose?: string | null
    endToEndId?: string | null
    bankReference?: string | null
    duplicateBy: 'REFERENCE' | 'FINGERPRINT'
    duplicateValue: string
    existing: {
      id: number
      status: string
      bookingDate: string
      direction: 'IN' | 'OUT'
      amount: number
      counterparty?: string | null
      purpose?: string | null
      endToEndId?: string | null
      bankReference?: string | null
      paymentAccountName: string
      sourceFileName: string
    }
  }>
  errors: Array<{ row: number; message: string }>
}

type BankTransactionMatch = {
  id: number
  voucherNo?: string | null
  date?: string | null
  description?: string | null
  grossAmount?: number | null
  paymentAccountName?: string | null
  paymentAccountColor?: string | null
  paymentAccountMismatch?: boolean
  paymentAccountWarning?: string | null
  score?: number
}

type Props = {
  paymentAccounts: PaymentAccount[]
  notify: (type: 'success' | 'error' | 'info', text: string) => void
  onCreateBooking: (transaction: BankTransaction) => void
  onOpenVoucher: (voucherId: number, voucherNo?: string | null, date?: string) => void
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const date = new Intl.DateTimeFormat('de-DE')

function formatDate(value?: string | null) {
  if (!value) return '–'
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? value : date.format(parsed)
}

function formatDateTime(value?: string | null) {
  if (!value) return '–'
  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(parsed)
}

function parseLocalDate(value?: string | null) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  const parsed = new Date(year, month - 1, day)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toISODate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function formatMonthRange(from: Date, to: Date) {
  const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })
  const fromMonth = monthFmt.format(from)
  const toMonth = monthFmt.format(to)
  return fromMonth === toMonth ? fromMonth : `${fromMonth} bis ${toMonth}`
}

function getBankImportReminder(status: BankImportStatus | null) {
  if (!status) return null
  if (status.total === 0) {
    return {
      title: 'Bankdaten importieren',
      summary: 'Erster Import offen',
      detail:
        'Es wurden noch keine Bankbelege importiert. Starte mit dem ersten Kontoauszug deines Zahlkontos.'
    }
  }
  const lastDate = parseLocalDate(status.lastBookingDate)
  if (!lastDate) return null
  const today = new Date()
  const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
  if (lastDate >= previousMonthEnd) return null
  const from = addDays(lastDate, 1)
  if (from > previousMonthEnd) return null
  return {
    title: 'Neuer Bankimport empfohlen',
    summary: `${formatMonthRange(from, previousMonthEnd)} fehlt`,
    detail: `Letzter Import: ${formatDateTime(status.lastImportAt)} · letzter importierter Buchungstag: ${formatDate(toISODate(lastDate))}. Empfohlener Importzeitraum: ${formatDate(toISODate(from))} bis ${formatDate(toISODate(previousMonthEnd))}.`
  }
}

function statusLabel(status: BankTransaction['status']) {
  if (status === 'LINKED') return 'Zugeordnet'
  if (status === 'CHECKED') return 'Geprüft'
  return 'Offen'
}

function MappingSelect({
  label,
  value,
  headers,
  onChange
}: {
  label: string
  value?: string | null
  headers: string[]
  onChange: (value: string | null) => void
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        className="input"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">Nicht zugeordnet</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </label>
  )
}

function duplicateReasonLabel(reason: 'REFERENCE' | 'FINGERPRINT') {
  return reason === 'REFERENCE'
    ? 'Bankreferenz / End-to-End-ID'
    : 'Fingerprint aus Konto, Datum, Betrag und Text'
}

function DuplicateRecordCard({
  title,
  row
}: {
  title: string
  row: {
    bookingDate: string
    direction: 'IN' | 'OUT'
    amount: number
    counterparty?: string | null
    purpose?: string | null
    bankReference?: string | null
    endToEndId?: string | null
    paymentAccountName?: string | null
    sourceFileName?: string | null
    idLabel?: string | null
  }
}) {
  return (
    <div className="bank-duplicate-record">
      <div className="bank-duplicate-record__title">{title}</div>
      <div className="bank-duplicate-record__grid">
        <div>
          <span>Datum</span>
          <strong>{formatDate(row.bookingDate)}</strong>
        </div>
        <div>
          <span>Typ</span>
          <strong>{row.direction}</strong>
        </div>
        <div>
          <span>Summe</span>
          <strong>{euro.format(row.amount)}</strong>
        </div>
        <div>
          <span>Beleg</span>
          <strong>{row.idLabel || '–'}</strong>
        </div>
        <div>
          <span>Partei</span>
          <strong>{row.counterparty || '–'}</strong>
        </div>
        <div>
          <span>Zweck</span>
          <strong>{row.purpose || '–'}</strong>
        </div>
        <div>
          <span>Bankreferenz</span>
          <strong>{row.bankReference || '–'}</strong>
        </div>
        <div>
          <span>End-to-End-ID</span>
          <strong>{row.endToEndId || '–'}</strong>
        </div>
        <div>
          <span>Zahlkonto</span>
          <strong>{row.paymentAccountName || '–'}</strong>
        </div>
        <div>
          <span>Quelldatei</span>
          <strong>{row.sourceFileName || '–'}</strong>
        </div>
      </div>
    </div>
  )
}

function BankMatchRow({
  match,
  busy,
  onLink
}: {
  match: BankTransactionMatch
  busy: boolean
  onLink: (voucherId: number) => void
}) {
  const scoreValue = Number(match.score || 0)
  const scoreLevel = scoreValue >= 60 ? 'high' : scoreValue >= 30 ? 'medium' : 'low'
  const scoreLabel =
    scoreValue >= 60 ? '★★★' : scoreValue >= 30 ? '★★' : scoreValue >= 15 ? '★' : '–'

  return (
    <div className="bank-match-row">
      <div>
        <strong>{match.voucherNo}</strong>
        <span>
          {formatDate(match.date)} · {match.description || 'Ohne Beschreibung'}
        </span>
        {!match.paymentAccountMismatch && match.paymentAccountName ? (
          <span style={{ color: match.paymentAccountColor || undefined }}>
            Zahlkonto: {match.paymentAccountName}
          </span>
        ) : null}
        {match.paymentAccountMismatch && (
          <span className="bank-match-warning">
            {match.paymentAccountWarning ||
              `Zahlkonto abweichend: ${match.paymentAccountName || 'ohne Konto'}`}
          </span>
        )}
      </div>
      <span
        className={`fee-suggestion__score fee-suggestion__score--${scoreLevel}`}
        title={
          scoreValue >= 15
            ? `Übereinstimmung: ${Math.round(scoreValue)} %`
            : `Sehr schwacher Treffer: ${Math.round(scoreValue)} %`
        }
        aria-label={
          scoreValue >= 15
            ? `${scoreLevel === 'high' ? 'Hohe' : scoreLevel === 'medium' ? 'Mittlere' : 'Geringe'} Übereinstimmung`
            : 'Sehr schwacher Treffer'
        }
      >
        {scoreLabel}
      </span>
      <button className="btn" disabled={busy} onClick={() => onLink(match.id)}>
        Zuordnen
      </button>
    </div>
  )
}

function ManualAssignmentModal({
  transaction,
  includeAllDates,
  busy,
  onClose,
  onLink,
  notify
}: {
  transaction: BankTransaction
  includeAllDates: boolean
  busy: boolean
  onClose: () => void
  onLink: (voucherId: number) => void
  notify: Props['notify']
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BankTransactionMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVoucherId, setSelectedVoucherId] = useState<number | null>(null)

  const loadResults = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.api.bankTransactions.matches({
        id: transaction.id,
        q: query || undefined,
        includeAllDates,
        manual: true
      })
      setResults(result.rows as BankTransactionMatch[])
    } catch (reason: any) {
      notify('error', reason?.message || String(reason))
    } finally {
      setLoading(false)
    }
  }, [includeAllDates, notify, query, transaction.id])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadResults()
    }, 160)
    return () => window.clearTimeout(timer)
  }, [loadResults])

  useEffect(() => {
    setSelectedVoucherId((current) =>
      current && results.some((row) => row.id === current) ? current : null
    )
  }, [results])

  return createPortal(
    <div
      className="modal-overlay bank-import-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="modal bank-manual-assign-modal">
        <header className="bank-modal-header">
          <div>
            <h2>Manuelle Zuweisung</h2>
            <p>
              {transaction.counterparty || 'Ohne Gegenpartei'} · {euro.format(transaction.amount)} ·{' '}
              {transaction.direction}
            </p>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </header>

        <section className="bank-review-section">
          <div className="bank-manual-assign-toolbar">
            <input
              className="input bank-match-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buchungsnummer oder Text suchen …"
              autoFocus
            />
            <span className="helper">
              Hier siehst du alle Buchungen rund um den Zeitraum. Die Entscheidung triffst du
              manuell.
            </span>
          </div>
          <div className="bank-manual-assign-table-wrap">
            <table className="bank-manual-assign-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Datum</th>
                  <th>Beschreibung</th>
                  <th>Summe</th>
                  <th>Zahlweg</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5}>
                      <div className="bank-empty-small">Buchungen werden gesucht …</div>
                    </td>
                  </tr>
                )}
                {!loading &&
                  results.map((match) => (
                    <tr
                      key={match.id}
                      className={selectedVoucherId === match.id ? 'is-selected' : undefined}
                      onClick={() => setSelectedVoucherId(match.id)}
                    >
                      <td>
                        <input
                          type="radio"
                          name={`manual-assign-${transaction.id}`}
                          checked={selectedVoucherId === match.id}
                          onChange={() => setSelectedVoucherId(match.id)}
                          aria-label={`Buchung ${match.voucherNo || match.id} auswählen`}
                        />
                      </td>
                      <td>{formatDate(match.date)}</td>
                      <td>
                        <div className="bank-manual-assign-description">
                          <strong>{match.voucherNo || `#${match.id}`}</strong>
                          <span>{match.description || 'Ohne Beschreibung'}</span>
                        </div>
                      </td>
                      <td>{euro.format(Number(match.grossAmount ?? transaction.amount ?? 0))}</td>
                      <td>
                        <span
                          className={
                            match.paymentAccountMismatch
                              ? 'bank-match-warning'
                              : 'bank-manual-assign-account'
                          }
                          style={
                            !match.paymentAccountMismatch
                              ? { color: match.paymentAccountColor || undefined }
                              : undefined
                          }
                        >
                          {match.paymentAccountName || '–'}
                        </span>
                      </td>
                    </tr>
                  ))}
                {!loading && results.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="bank-empty-small">
                        Keine passende Buchung für die manuelle Zuweisung gefunden.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="bank-modal-footer">
          <button
            className="btn primary"
            disabled={busy || !selectedVoucherId}
            onClick={() => selectedVoucherId && onLink(selectedVoucherId)}
          >
            Ausgewählte Buchung zuweisen
          </button>
          <button className="btn" onClick={onClose}>
            Schließen
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}

function BankImportResultModal({
  result,
  selectedRows,
  onToggleRow,
  onImportSelected,
  onClose,
  busy
}: {
  result: ImportCommitResult
  selectedRows: number[]
  onToggleRow: (row: number) => void
  onImportSelected: () => void
  onClose: () => void
  busy: boolean
}) {
  const selectedCount = selectedRows.length

  return createPortal(
    <div
      className="modal-overlay bank-import-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="modal bank-import-result-modal">
        <header className="bank-modal-header">
          <div>
            <h2>Import geprüft</h2>
            <p>
              {result.imported} importiert, {result.duplicates} als Duplikat erkannt,{' '}
              {result.errors.length} fehlerhaft.
            </p>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </header>

        {result.duplicateRows.length > 0 && (
          <section className="bank-review-section">
            <div className="bank-section-title">
              <div>
                <strong>Erkannte Duplikate</strong>
                <span className="helper">
                  Hier siehst du, warum eine Zeile übersprungen wurde und auf welchen bestehenden
                  Bankbeleg sie gematcht hat.
                </span>
              </div>
            </div>
            <div className="bank-duplicate-list">
              {result.duplicateRows.map((row) => {
                const selected = selectedRows.includes(row.sourceRow)
                return (
                  <label
                    key={row.sourceRow}
                    className={`bank-duplicate-row ${selected ? 'active' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleRow(row.sourceRow)}
                    />
                    <div className="bank-duplicate-row__content">
                      <div className="bank-duplicate-row__head">
                        <strong>
                          Zeile {row.sourceRow}: {formatDate(row.bookingDate)} · {row.direction} ·{' '}
                          {euro.format(row.amount)}
                        </strong>
                        <span className="bank-duplicate-pill">
                          {duplicateReasonLabel(row.duplicateBy)}
                        </span>
                      </div>
                      <div className="bank-duplicate-compact">
                        <div className="bank-duplicate-compact__card">
                          <span>Importzeile</span>
                          <strong>{row.counterparty || row.purpose || 'Ohne Beschreibung'}</strong>
                          <small>
                            {formatDate(row.bookingDate)} · {row.direction} ·{' '}
                            {euro.format(row.amount)}
                          </small>
                        </div>
                        <div className="bank-duplicate-compact__equals">=</div>
                        <div className="bank-duplicate-compact__card">
                          <span>Bestehender Bankbeleg</span>
                          <strong>
                            {row.existing.counterparty ||
                              row.existing.purpose ||
                              `#${row.existing.id}`}
                          </strong>
                          <small>
                            #{row.existing.id} · {formatDate(row.existing.bookingDate)} ·{' '}
                            {row.existing.direction} · {euro.format(row.existing.amount)}
                          </small>
                        </div>
                      </div>
                      <details className="bank-duplicate-details">
                        <summary className="bank-duplicate-details__summary">
                          Mehr Vergleich anzeigen
                        </summary>
                        <div className="bank-duplicate-grid">
                          <DuplicateRecordCard
                            title="Importzeile"
                            row={{
                              bookingDate: row.bookingDate,
                              direction: row.direction,
                              amount: row.amount,
                              counterparty: row.counterparty,
                              purpose: row.purpose,
                              bankReference: row.bankReference,
                              endToEndId: row.endToEndId,
                              paymentAccountName: null,
                              sourceFileName: null,
                              idLabel: `Zeile ${row.sourceRow}`
                            }}
                          />
                          <DuplicateRecordCard
                            title="Bestehender Bankbeleg"
                            row={{
                              bookingDate: row.existing.bookingDate,
                              direction: row.existing.direction,
                              amount: row.existing.amount,
                              counterparty: row.existing.counterparty,
                              purpose: row.existing.purpose,
                              bankReference: row.existing.bankReference,
                              endToEndId: row.existing.endToEndId,
                              paymentAccountName: row.existing.paymentAccountName,
                              sourceFileName: row.existing.sourceFileName,
                              idLabel: `#${row.existing.id}`
                            }}
                          />
                          <div className="bank-duplicate-grid__wide">
                            <span>Abgleich über</span>
                            <strong className="word-break-all">{row.duplicateValue}</strong>
                          </div>
                        </div>
                      </details>
                    </div>
                  </label>
                )
              })}
            </div>
          </section>
        )}

        {result.errors.length > 0 && (
          <section className="bank-review-section">
            <div className="bank-section-title">
              <strong>Fehlerhafte Zeilen</strong>
            </div>
            <div className="bank-error-list">
              {result.errors.map((entry) => (
                <div key={`${entry.row}-${entry.message}`}>
                  Zeile {entry.row}: {entry.message}
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="bank-modal-footer">
          {result.duplicateRows.length > 0 && (
            <button
              className="btn"
              disabled={busy || selectedCount === 0}
              onClick={onImportSelected}
            >
              {busy ? 'Importiere …' : `${selectedCount} Duplikat(e) trotzdem importieren`}
            </button>
          )}
          <button className="btn primary" onClick={onClose}>
            Fertig
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}

function BankImportModal({
  accounts,
  onClose,
  onImported,
  notify
}: {
  accounts: PaymentAccount[]
  onClose: () => void
  onImported: () => void
  notify: Props['notify']
}) {
  const paymentAccountRef = React.useRef<HTMLSelectElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<CsvMapping>({})
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [paymentAccountError, setPaymentAccountError] = useState(false)
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null)
  const [selectedDuplicateRows, setSelectedDuplicateRows] = useState<number[]>([])

  const loadPreview = async (nextFile: File, nextBytes: Uint8Array, nextMapping?: CsvMapping) => {
    setBusy(true)
    setError('')
    try {
      const result = (await window.api.bankImports.preview({
        fileBytes: nextBytes,
        fileName: nextFile.name,
        mapping: nextMapping
      })) as ImportPreview
      setPreview(result)
      if (!nextMapping) setMapping(result.suggestedMapping)
      if (result.detectedPaymentAccountId) {
        setPaymentAccountId(result.detectedPaymentAccountId)
        setPaymentAccountError(false)
      }
    } catch (reason: any) {
      setError(reason?.message || String(reason))
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  const chooseFile = async (nextFile?: File) => {
    if (!nextFile) return
    if (!/\.(xml|csv)$/i.test(nextFile.name)) {
      setError('Bitte wähle eine CAMT-XML- oder CSV-Datei.')
      return
    }
    setFile(nextFile)
    const nextBytes = new Uint8Array(await nextFile.arrayBuffer())
    setFileBytes(nextBytes)
    await loadPreview(nextFile, nextBytes)
  }

  const commit = async () => {
    if (!file || !fileBytes) return
    if (!paymentAccountId) {
      setPaymentAccountError(true)
      window.setTimeout(() => paymentAccountRef.current?.focus(), 0)
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = (await window.api.bankImports.commit({
        fileBytes,
        fileName: file.name,
        paymentAccountId,
        mapping: preview?.format === 'CSV' ? mapping : undefined
      })) as ImportCommitResult
      notify(
        'success',
        `${result.imported} Bankbeleg(e) importiert${result.duplicates ? `, ${result.duplicates} Duplikat(e) übersprungen` : ''}.`
      )
      if (result.errors.length)
        notify('info', `${result.errors.length} fehlerhafte Zeile(n) wurden nicht übernommen.`)
      setCommitResult(result)
      setSelectedDuplicateRows([])
      onImported()
    } catch (reason: any) {
      setError(reason?.message || String(reason))
    } finally {
      setBusy(false)
    }
  }

  const importSelectedDuplicates = async () => {
    if (!file || !fileBytes || !paymentAccountId || selectedDuplicateRows.length === 0) return
    setBusy(true)
    setError('')
    try {
      const result = (await window.api.bankImports.commit({
        fileBytes,
        fileName: file.name,
        paymentAccountId,
        mapping: preview?.format === 'CSV' ? mapping : undefined,
        forceImportSourceRows: selectedDuplicateRows
      })) as ImportCommitResult
      notify('success', `${result.imported} Duplikat(e) bewusst importiert.`)
      setCommitResult((current) =>
        current
          ? {
              ...current,
              imported: current.imported + result.imported,
              duplicates: Math.max(0, current.duplicates - result.imported),
              duplicateRows: current.duplicateRows.filter(
                (row) => !selectedDuplicateRows.includes(row.sourceRow)
              )
            }
          : current
      )
      setSelectedDuplicateRows([])
      onImported()
    } catch (reason: any) {
      setError(reason?.message || String(reason))
    } finally {
      setBusy(false)
    }
  }

  const setMap = (key: keyof CsvMapping, value: string | null) =>
    setMapping((current) => ({ ...current, [key]: value }))
  const activeAccounts = accounts.filter(
    (account) => account.isActive !== 0 && account.kind !== 'CASH'
  )
  const paymentAccountsById = new Map(activeAccounts.map((account) => [account.id, account]))
  const selectedPaymentAccountColor =
    paymentAccountsById.get(Number(paymentAccountId || 0))?.color || undefined

  return createPortal(
    <div
      className="modal-overlay bank-import-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="modal bank-import-modal">
        <header className="bank-modal-header">
          <div>
            <h2>Bankdaten importieren</h2>
            <p>CAMT.052/053 oder CSV prüfen und als offene Bankbelege übernehmen.</p>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </header>

        <div className="bank-import-drop">
          <strong>{file?.name || 'Kontoauszug auswählen'}</strong>
          <span className="helper">
            XML oder CSV, die Originaldatei wird nicht als Anhang gespeichert.
          </span>
          <label className="btn">
            Datei wählen
            <input
              type="file"
              accept=".xml,.csv,text/csv,application/xml,text/xml"
              hidden
              onChange={(event) => void chooseFile(event.target.files?.[0])}
            />
          </label>
        </div>

        {error && <div className="inline-error">{error}</div>}
        {busy && <div className="helper">Datei wird geprüft …</div>}

        {preview && (
          <>
            <div className="bank-import-summary">
              <span>
                <strong>{preview.format}</strong> erkannt
              </span>
              <span>{preview.summary.total} Zeilen</span>
              <span className="text-success">{preview.summary.valid} gültig</span>
              <span className={preview.summary.errors ? 'text-danger' : ''}>
                {preview.summary.errors} fehlerhaft
              </span>
            </div>

            <label className="field">
              <span>
                Zahlkonto{' '}
                <span className="req-asterisk" aria-hidden="true">
                  *
                </span>
                {paymentAccountError && (
                  <span
                    className="booking-field-error has-tooltip"
                    data-tooltip="Bitte ein Zahlkonto für den Import auswählen."
                    tabIndex={0}
                  >
                    !
                  </span>
                )}
              </span>
              <select
                ref={paymentAccountRef}
                className={`input ${paymentAccountError ? 'input-error' : ''}`}
                value={paymentAccountId ?? ''}
                style={{ color: selectedPaymentAccountColor }}
                onChange={(event) => {
                  const nextValue = event.target.value ? Number(event.target.value) : null
                  setPaymentAccountId(nextValue)
                  if (nextValue) setPaymentAccountError(false)
                }}
                aria-invalid={paymentAccountError}
              >
                <option value="">Zahlkonto wählen</option>
                {activeAccounts.map((account) => (
                  <option
                    key={account.id}
                    value={account.id}
                    style={{ color: account.color || undefined }}
                  >
                    {account.name}
                    {account.iban ? ` · ${account.iban}` : ''}
                  </option>
                ))}
              </select>
              {paymentAccountError && (
                <span className="helper text-danger">Bitte wähle ein Zahlkonto aus.</span>
              )}
              {preview.accountIbans.length > 0 && (
                <span className="helper">IBAN im Auszug: {preview.accountIbans.join(', ')}</span>
              )}
            </label>

            {preview.format === 'CSV' && (
              <section className="bank-mapping-card">
                <div className="bank-section-title">
                  <strong>Spaltenzuordnung</strong>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => file && fileBytes && void loadPreview(file, fileBytes, mapping)}
                  >
                    Vorschau aktualisieren
                  </button>
                </div>
                <div className="bank-mapping-grid">
                  <MappingSelect
                    label="Buchungsdatum *"
                    value={mapping.bookingDate}
                    headers={preview.headers}
                    onChange={(value) => setMap('bookingDate', value)}
                  />
                  <MappingSelect
                    label="Betrag mit Vorzeichen"
                    value={mapping.amount}
                    headers={preview.headers}
                    onChange={(value) => setMap('amount', value)}
                  />
                  <MappingSelect
                    label="Soll / Belastung"
                    value={mapping.debit}
                    headers={preview.headers}
                    onChange={(value) => setMap('debit', value)}
                  />
                  <MappingSelect
                    label="Haben / Gutschrift"
                    value={mapping.credit}
                    headers={preview.headers}
                    onChange={(value) => setMap('credit', value)}
                  />
                  <MappingSelect
                    label="Verwendungszweck"
                    value={mapping.purpose}
                    headers={preview.headers}
                    onChange={(value) => setMap('purpose', value)}
                  />
                </div>
                <details className="bank-more-options">
                  <summary className="btn">... Weitere Spalten</summary>
                  <div className="bank-mapping-grid">
                    <MappingSelect
                      label="Wertstellung"
                      value={mapping.valueDate}
                      headers={preview.headers}
                      onChange={(value) => setMap('valueDate', value)}
                    />
                    <MappingSelect
                      label="Währung"
                      value={mapping.currency}
                      headers={preview.headers}
                      onChange={(value) => setMap('currency', value)}
                    />
                    <MappingSelect
                      label="Gegenpartei"
                      value={mapping.counterparty}
                      headers={preview.headers}
                      onChange={(value) => setMap('counterparty', value)}
                    />
                    <MappingSelect
                      label="IBAN Gegenkonto"
                      value={mapping.counterpartyIban}
                      headers={preview.headers}
                      onChange={(value) => setMap('counterpartyIban', value)}
                    />
                    <MappingSelect
                      label="Bankreferenz"
                      value={mapping.reference}
                      headers={preview.headers}
                      onChange={(value) => setMap('reference', value)}
                    />
                  </div>
                </details>
              </section>
            )}

            <div className="bank-preview-table-wrap">
              <table className="bank-table bank-preview-table">
                <thead>
                  <tr>
                    <th>Zeile</th>
                    <th>Datum</th>
                    <th>Gegenpartei / Zweck</th>
                    <th>Typ</th>
                    <th className="number">Summe</th>
                    <th>Prüfung</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 30).map((row) => (
                    <tr key={row.sourceRow} className={row.errors.length ? 'bank-row-error' : ''}>
                      <td>{row.sourceRow}</td>
                      <td>{formatDate(row.bookingDate)}</td>
                      <td>{[row.counterparty, row.purpose].filter(Boolean).join(' - ') || '–'}</td>
                      <td>{row.direction}</td>
                      <td className="number">{euro.format(row.amount)}</td>
                      <td>{row.errors.join(' ') || 'OK'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <footer className="bank-modal-footer">
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="btn primary"
            disabled={busy || !preview || preview.summary.valid === 0}
            onClick={() => void commit()}
          >
            {busy ? 'Importiere …' : `${preview?.summary.valid ?? 0} Beleg(e) importieren`}
          </button>
        </footer>
      </div>
      {commitResult && (
        <BankImportResultModal
          result={commitResult}
          selectedRows={selectedDuplicateRows}
          onToggleRow={(row) =>
            setSelectedDuplicateRows((current) =>
              current.includes(row) ? current.filter((entry) => entry !== row) : [...current, row]
            )
          }
          onImportSelected={() => void importSelectedDuplicates()}
          onClose={() => {
            if (
              (commitResult.duplicateRows.length === 0 || selectedDuplicateRows.length === 0) &&
              commitResult.errors.length === 0
            ) {
              onClose()
              return
            }
            onClose()
          }}
          busy={busy}
        />
      )}
    </div>,
    document.body
  )
}

function BankCheckModal({
  transaction,
  notify,
  onClose,
  onChecked
}: {
  transaction: BankTransaction
  notify: Props['notify']
  onClose: () => void
  onChecked: () => void
}) {
  const [checkedNote, setCheckedNote] = useState(transaction.checkedNote || '')
  const [busy, setBusy] = useState(false)

  const check = async () => {
    setBusy(true)
    try {
      await window.api.bankTransactions.check({ id: transaction.id, note: checkedNote || null })
      notify('success', 'Bankbeleg wurde als geprüft abgeschlossen.')
      onChecked()
      onClose()
    } catch (reason: any) {
      notify('error', reason?.message || String(reason))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="modal-overlay bank-import-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bank-check-modal-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="modal bank-check-modal">
        <header className="bank-modal-header">
          <div>
            <h2 id="bank-check-modal-title">Ohne Buchung erledigen</h2>
            <p>Bankbeleg #{transaction.id}</p>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </header>

        <section className="bank-check-modal__content">
          <p>
            Die Bewegung wird als geprüft abgeschlossen, ohne eine Buchung anzulegen oder zuzuordnen.
          </p>
          <dl>
            <div>
              <dt>Datum</dt>
              <dd>{formatDate(transaction.bookingDate)}</dd>
            </div>
            <div>
              <dt>Summe</dt>
              <dd>{euro.format(transaction.amount)}</dd>
            </div>
            <div>
              <dt>Gegenpartei</dt>
              <dd>{transaction.counterparty || '–'}</dd>
            </div>
          </dl>
          <label className="field">
            <span>Prüfhinweis <small>(optional)</small></span>
            <textarea
              className="input booking-note-textarea"
              value={checkedNote}
              onChange={(event) => setCheckedNote(event.target.value)}
              placeholder="Warum wird der Bankbeleg ohne Buchung erledigt?"
            />
          </label>
        </section>

        <footer className="bank-modal-footer">
          <button className="btn" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={busy} onClick={() => void check()}>
            {busy ? 'Markiere …' : 'Als geprüft markieren'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}

function BankReviewModal({
  transaction,
  onClose,
  onChanged,
  onCreateBooking,
  onCheckWithoutBooking,
  onOpenVoucher,
  notify
}: {
  transaction: BankTransaction
  onClose: () => void
  onChanged: () => void
  onCreateBooking: Props['onCreateBooking']
  onCheckWithoutBooking: (transaction: BankTransaction) => void
  onOpenVoucher: Props['onOpenVoucher']
  notify: Props['notify']
}) {
  const [matches, setMatches] = useState<BankTransactionMatch[]>([])
  const [loading, setLoading] = useState(transaction.status === 'OPEN')
  const [includeAllDates, setIncludeAllDates] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [showManualAssign, setShowManualAssign] = useState(false)
  const actionMenuRef = React.useRef<HTMLDivElement | null>(null)

  const loadMatches = useCallback(async () => {
    if (transaction.status !== 'OPEN') return
    setLoading(true)
    try {
      const result = await window.api.bankTransactions.matches({
        id: transaction.id,
        includeAllDates
      })
      setMatches(result.rows as BankTransactionMatch[])
    } catch (reason: any) {
      notify('error', reason?.message || String(reason))
    } finally {
      setLoading(false)
    }
  }, [includeAllDates, notify, transaction.id, transaction.status])

  useEffect(() => {
    void loadMatches()
  }, [loadMatches])

  useEffect(() => {
    if (!actionMenuOpen) return
    const closeMenu = (event: MouseEvent) => {
      if (!actionMenuRef.current?.contains(event.target as Node)) setActionMenuOpen(false)
    }
    window.addEventListener('mousedown', closeMenu)
    return () => window.removeEventListener('mousedown', closeMenu)
  }, [actionMenuOpen])

  const link = async (voucherId: number) => {
    setBusy(true)
    try {
      await window.api.bankTransactions.link({ id: transaction.id, voucherId })
      notify('success', 'Bankbeleg wurde der Buchung zugeordnet.')
      onChanged()
      onClose()
    } catch (reason: any) {
      notify('error', reason?.message || String(reason))
    } finally {
      setBusy(false)
    }
  }

  const reopen = async () => {
    setBusy(true)
    try {
      await window.api.bankTransactions.reopen({ id: transaction.id })
      notify('success', 'Bankbeleg ist wieder offen.')
      onChanged()
      onClose()
    } catch (reason: any) {
      notify('error', reason?.message || String(reason))
    } finally {
      setBusy(false)
    }
  }

  const openLinkedVoucher = () => {
    if (!transaction.voucherId) return
    onOpenVoucher(transaction.voucherId, transaction.voucherNo, transaction.bookingDate)
    onClose()
  }

  return createPortal(
    <div
      className="modal-overlay bank-import-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="modal bank-review-modal">
        <header className="bank-modal-header">
          <div>
            <h2>Bankbeleg #{transaction.id}</h2>
            <p>{transaction.counterparty || 'Ohne Gegenpartei'}</p>
          </div>
          <div className="bank-header-actions">
            <span className={`bank-status bank-status--${transaction.status.toLowerCase()}`}>
              {statusLabel(transaction.status)}
            </span>
            <div className="bank-action-menu" ref={actionMenuRef}>
              <button
                className="btn bank-action-menu__trigger"
                onClick={() => setActionMenuOpen((open) => !open)}
                aria-label="Aktionen"
                aria-expanded={actionMenuOpen}
              >
                ...
              </button>
              {actionMenuOpen && (
                <div className="bank-action-menu__popover">
                  {transaction.status === 'OPEN' && (
                    <>
                      <button
                        className="btn"
                        onClick={() => {
                          setActionMenuOpen(false)
                          onCreateBooking(transaction)
                          onClose()
                        }}
                      >
                        Buchung anlegen
                      </button>
                      <button
                        className="btn"
                        onClick={() => {
                          setActionMenuOpen(false)
                          onCheckWithoutBooking(transaction)
                          onClose()
                        }}
                      >
                        Ohne Buchung erledigen
                      </button>
                    </>
                  )}
                  {transaction.status === 'LINKED' && transaction.voucherId && (
                    <button
                      className="btn"
                      onClick={() => {
                        setActionMenuOpen(false)
                        openLinkedVoucher()
                      }}
                    >
                      Buchung öffnen
                    </button>
                  )}
                  {transaction.status !== 'OPEN' && (
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => {
                        setActionMenuOpen(false)
                        void reopen()
                      }}
                    >
                      Wieder öffnen
                    </button>
                  )}
                </div>
              )}
            </div>
            <button className="btn ghost" onClick={onClose} aria-label="Schließen">
              ×
            </button>
          </div>
        </header>

        <section className="bank-detail-card">
          <div>
            <span>Datum</span>
            <strong>{formatDate(transaction.bookingDate)}</strong>
          </div>
          <div>
            <span>Wertstellung</span>
            <strong>{formatDate(transaction.valueDate)}</strong>
          </div>
          <div>
            <span>Typ</span>
            <strong className={transaction.direction === 'IN' ? 'text-success' : 'text-danger'}>
              {transaction.direction}
            </strong>
          </div>
          <div>
            <span>Summe</span>
            <strong>{euro.format(transaction.amount)}</strong>
          </div>
          <div>
            <span>Zahlkonto</span>
            <strong style={{ color: transaction.paymentAccountColor || undefined }}>
              {transaction.paymentAccountName}
            </strong>
          </div>
          <div>
            <span>IBAN Gegenkonto</span>
            <strong>{transaction.counterpartyIban || '–'}</strong>
          </div>
          <div className="bank-detail-wide">
            <span>Verwendungszweck</span>
            <strong>{transaction.purpose || '–'}</strong>
          </div>
          <div>
            <span>End-to-End-ID</span>
            <strong>{transaction.endToEndId || '–'}</strong>
          </div>
          <div>
            <span>Bankreferenz</span>
            <strong>{transaction.bankReference || '–'}</strong>
          </div>
          <div className="bank-detail-wide">
            <span>Quelldatei</span>
            <strong title={transaction.sourceFileName}>{transaction.sourceFileName}</strong>
          </div>
        </section>

        {transaction.status === 'OPEN' ? (
          <div className="bank-review-layout">
            <section className="bank-review-section">
              <div className="bank-section-title">
                <div className="bank-section-title__label">
                  <strong>Passende Buchungen</strong>
                </div>
                <div className="bank-match-toolbar">
                  <button className="btn" type="button" onClick={() => setShowManualAssign(true)}>
                    Manuell zuweisen
                  </button>
                  <div className="bank-check-toggle">
                    <label className="bank-check-label">
                      <input
                        type="checkbox"
                        checked={includeAllDates}
                        onChange={(event) => setIncludeAllDates(event.target.checked)}
                      />{' '}
                      Alle Daten
                    </label>
                  </div>
                </div>
              </div>
              <div className="bank-match-list">
                {loading && <div className="helper">Treffer werden gesucht …</div>}
                {!loading &&
                  matches.map((match) => (
                    <BankMatchRow
                      key={match.id}
                      match={match}
                      busy={busy}
                      onLink={(voucherId) => {
                        void link(voucherId)
                      }}
                    />
                  ))}
                {!loading && matches.length === 0 && (
                  <div className="bank-empty-small">Keine kompatible Buchung gefunden.</div>
                )}
              </div>
            </section>
          </div>
        ) : (
          <section className="bank-resolution-card">
            {transaction.status === 'LINKED' ? (
              <>
                <div>
                  <span>Zugeordnete Buchung</span>
                  <button
                    type="button"
                    className="bank-voucher-link"
                    onClick={openLinkedVoucher}
                    title="Buchung öffnen"
                  >
                    {transaction.voucherNo || `#${transaction.voucherId}`}
                    {transaction.voucherReversedById ? ' · storniert' : ''}
                  </button>
                  <small>
                    {transaction.linkOrigin === 'CREATED'
                      ? 'Aus diesem Bankbeleg angelegt'
                      : 'Bestehender Buchung zugeordnet'}
                  </small>
                </div>
              </>
            ) : (
              <div>
                <span>Prüfvermerk</span>
                <strong>{transaction.checkedNote || 'Ohne zusätzlichen Hinweis geprüft.'}</strong>
              </div>
            )}
          </section>
        )}

        {showManualAssign && (
          <ManualAssignmentModal
            transaction={transaction}
            includeAllDates={includeAllDates}
            busy={busy}
            onClose={() => setShowManualAssign(false)}
            onLink={(voucherId) => {
              void link(voucherId)
            }}
            notify={notify}
          />
        )}

        <footer className="bank-modal-footer">
          <button className="btn" onClick={onClose}>
            Schließen
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}

export default function BankImportView({
  paymentAccounts,
  notify,
  onCreateBooking,
  onOpenVoucher
}: Props) {
  const [rows, setRows] = useState<BankTransaction[]>([])
  const [stats, setStats] = useState({ total: 0, open: 0, linked: 0, checked: 0 })
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'ALL' | BankTransaction['status']>('OPEN')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<
    'status' | 'date' | 'description' | 'account' | 'type' | 'amount'
  >('date')
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC')
  const [showImport, setShowImport] = useState(false)
  const [selected, setSelected] = useState<BankTransaction | null>(null)
  const [checkTransaction, setCheckTransaction] = useState<BankTransaction | null>(null)
  const [importStatus, setImportStatus] = useState<BankImportStatus | null>(null)
  const limit = 50

  const toggleSort = (
    column: 'status' | 'date' | 'description' | 'account' | 'type' | 'amount'
  ) => {
    if (sortBy === column) {
      setSortDir((dir) => (dir === 'DESC' ? 'ASC' : 'DESC'))
    } else {
      setSortBy(column)
      setSortDir(column === 'date' || column === 'amount' ? 'DESC' : 'ASC')
    }
    setPage(1)
  }

  const renderSort = (
    column: 'status' | 'date' | 'description' | 'account' | 'type' | 'amount'
  ) => {
    const active = sortBy === column
    const symbol = active ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'
    return (
      <span className={`bank-sort-icon ${active ? 'active' : ''}`} aria-hidden="true">
        {symbol}
      </span>
    )
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.api.bankTransactions.list({
        status,
        paymentAccountId: accountId || undefined,
        q: query || undefined,
        sortBy,
        sortDir,
        page,
        limit
      })
      setRows(result.rows as BankTransaction[])
      setStats(result.stats)
      setTotal(result.total)
    } catch (reason: any) {
      notify('error', reason?.message || String(reason))
    } finally {
      setLoading(false)
    }
  }, [accountId, notify, page, query, status, sortBy, sortDir])

  const loadImportStatus = useCallback(async () => {
    try {
      const result = await window.api.bankTransactions.importStatus()
      setImportStatus(result as BankImportStatus)
    } catch {
      setImportStatus(null)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    void loadImportStatus()
  }, [loadImportStatus])

  useEffect(() => {
    const refresh = () => {
      void load()
      void loadImportStatus()
    }
    return addDataChangedListener(['bank-imports', 'vouchers'], refresh)
  }, [load, loadImportStatus])

  const activeAccounts = useMemo(
    () => paymentAccounts.filter((account) => account.isActive !== 0 && account.kind !== 'CASH'),
    [paymentAccounts]
  )
  const paymentAccountsById = useMemo(
    () => new Map(activeAccounts.map((account) => [account.id, account])),
    [activeAccounts]
  )
  const pageCount = Math.max(1, Math.ceil(total / limit))
  const importReminder = useMemo(() => getBankImportReminder(importStatus), [importStatus])

  return (
    <div className="card bank-import-container">
      <div className="bank-page-header">
        <h1>Bankimport</h1>
        <div className="bank-page-tools">
          <div className="bank-search-wrap">
            <input
              className="input bank-import-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              placeholder="Suche Bankbelege (Text, Referenz, Gegenpartei)..."
              aria-label="Bankbelege durchsuchen"
            />
            {query && (
              <button
                className="btn ghost bank-search-clear"
                type="button"
                aria-label="Suche leeren"
                onClick={() => {
                  setQuery('')
                  setPage(1)
                }}
              >
                ×
              </button>
            )}
          </div>
          <select
            className="input bank-account-filter"
            value={accountId ?? ''}
            style={{ color: paymentAccountsById.get(Number(accountId || 0))?.color || undefined }}
            onChange={(event) => {
              setAccountId(event.target.value ? Number(event.target.value) : null)
              setPage(1)
            }}
            aria-label="Nach Zahlkonto filtern"
          >
            <option value="">Alle Zahlkonten</option>
            {activeAccounts.map((account) => (
              <option
                key={account.id}
                value={account.id}
                style={{ color: account.color || undefined }}
              >
                {account.name}
              </option>
            ))}
          </select>
          <div className="filter-divider" />
          <button className="btn primary" onClick={() => setShowImport(true)}>
            + Import
          </button>
        </div>
      </div>

      <div className="helper bank-page-summary">
        Offene Bankbelege: <strong>{stats.open}</strong>
        <span className="summary-remaining">
          ({stats.total} gesamt; Zugeordnet: {stats.linked}, Geprüft: {stats.checked})
        </span>
        {importReminder && (
          <span
            className="bank-import-reminder"
            tabIndex={0}
            aria-label={`${importReminder.title}: ${importReminder.detail}`}
          >
            <span className="bank-import-reminder__icon" aria-hidden="true">
              !
            </span>
            <span className="bank-import-reminder__summary">{importReminder.summary}</span>
            <span className="bank-import-reminder__popover" role="tooltip">
              <strong>{importReminder.title}</strong>
              <span>{importReminder.detail}</span>
            </span>
          </span>
        )}
      </div>

      <div className="bank-status-tabs" role="tablist" aria-label="Bankbelegstatus">
        {(
          [
            ['ALL', 'Gesamt', stats.total],
            ['OPEN', 'Offen', stats.open],
            ['LINKED', 'Zugeordnet', stats.linked],
            ['CHECKED', 'Geprüft', stats.checked]
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            className={status === key ? 'active' : ''}
            onClick={() => {
              setStatus(key)
              setPage(1)
            }}
          >
            <span>{label}</span>
            <strong>{count}</strong>
          </button>
        ))}
      </div>

      <div className="bank-table-card">
        <table className="bank-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => toggleSort('status')}>
                Status {renderSort('status')}
              </th>
              <th className="sortable" onClick={() => toggleSort('date')}>
                Datum {renderSort('date')}
              </th>
              <th className="sortable" onClick={() => toggleSort('description')}>
                Beschreibung {renderSort('description')}
              </th>
              <th className="sortable" onClick={() => toggleSort('account')}>
                Zahlkonto {renderSort('account')}
              </th>
              <th className="sortable" onClick={() => toggleSort('type')}>
                Typ {renderSort('type')}
              </th>
              <th className="number sortable" onClick={() => toggleSort('amount')}>
                Summe {renderSort('amount')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={0}
                onClick={() => setSelected(row)}
                onKeyDown={(event) =>
                  (event.key === 'Enter' || event.key === ' ') && setSelected(row)
                }
              >
                <td>
                  <span
                    className={`bank-status bank-status--${row.status.toLowerCase()}`}
                    title={statusLabel(row.status)}
                  >
                    <i />
                    {statusLabel(row.status)}
                  </span>
                </td>
                <td>{formatDate(row.bookingDate)}</td>
                <td>
                  <div className="bank-description-cell">
                    <strong>{row.counterparty || row.purpose || 'Ohne Beschreibung'}</strong>
                    {row.counterparty && row.purpose && <span>{row.purpose}</span>}
                  </div>
                </td>
                <td style={{ color: row.paymentAccountColor || undefined }}>
                  <span
                    className="bank-account-dot"
                    style={{ background: row.paymentAccountColor || 'var(--accent)' }}
                  />
                  {row.paymentAccountName}
                </td>
                <td>
                  <span className={`badge ${row.direction === 'IN' ? 'in' : 'out'}`}>
                    {row.direction}
                  </span>
                </td>
                <td className={`number bank-amount bank-amount--${row.direction.toLowerCase()}`}>
                  {row.direction === 'OUT' ? '−' : '+'}
                  {euro.format(row.amount)}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="bank-empty">Keine Bankbelege für diesen Filter gefunden.</div>
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={6}>
                  <div className="bank-empty">Bankbelege werden geladen …</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="bank-pagination">
        <span>
          {total} Einträge · Seite {page} / {pageCount}
        </span>
        <div>
          <button
            className="btn"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            ‹
          </button>
          <button
            className="btn"
            disabled={page >= pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            ›
          </button>
        </div>
      </footer>

      {showImport && (
        <BankImportModal
          accounts={paymentAccounts}
          notify={notify}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setPage(1)
            void load()
            void loadImportStatus()
          }}
        />
      )}
      {selected && (
        <BankReviewModal
          transaction={selected}
          notify={notify}
          onClose={() => setSelected(null)}
          onChanged={() => {
            dispatchDataChanged(['bank-imports', 'vouchers'])
            void load()
          }}
          onCreateBooking={onCreateBooking}
          onCheckWithoutBooking={setCheckTransaction}
          onOpenVoucher={onOpenVoucher}
        />
      )}
      {checkTransaction && (
        <BankCheckModal
          transaction={checkTransaction}
          notify={notify}
          onClose={() => setCheckTransaction(null)}
          onChecked={() => {
            dispatchDataChanged(['bank-imports', 'vouchers'])
            void load()
          }}
        />
      )}
    </div>
  )
}
