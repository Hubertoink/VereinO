import { IconArrowDown, IconArrowUp, IconBuildingBank, IconCalendar, IconFileDescription, IconInfoCircle, IconMessage, IconPaperclip, IconUser } from '@tabler/icons-react'
import './bankReview.css'
import './bankImportDialog.css'
import './bankImportPage.css'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconAlertTriangle, IconCheck, IconChevronLeft, IconChevronRight, IconDotsVertical, IconExternalLink, IconFileUpload, IconHistory, IconLayoutGrid, IconLink, IconPlus, IconSparkles, IconX } from '@tabler/icons-react'
import AppIcon from '../../components/common/AppIcon'
import ReimbursementsDialog from '../reimbursements/ReimbursementsDialog'
import FilterDropdown from '../../components/dropdowns/FilterDropdown'
import BankImportRemapDialog from './BankImportRemapDialog'
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
  matchScore?: number | null
  possibleDuplicateCount?: number
  aiSuggestion?: BankAiSuggestion | null
}

type BankAiSuggestion = {
  matchedVoucher?: { grossAmount: number; date: string; description: string | null } | null
  action: 'LINK_EXISTING' | 'APPLY_RECURRING' | 'CREATE_BOOKING' | 'MARK_CHECKED' | 'NEEDS_MANUAL_REVIEW'
  confidence: number
  reason: string
  voucherId?: number | null
  voucherNo?: string | null
  recurringBookingId?: number | null
  recurringBookingName?: string | null
  occurrenceId?: number | null
  scheduledDate?: string | null
  bookingCandidate?: {
    date: string
    type: 'IN' | 'OUT'
    sphere: string
    primaryClassificationValueId?: number | null
    description: string
    grossAmount: number
    vatRate?: number | null
    paymentMethod?: string | null
    paymentAccountId?: number | null
    budgets?: Array<{ id: number; amount: number }>
    earmarks?: Array<{ id: number; amount: number }>
    tags?: string[]
  } | null
  warnings: string[]
  evidence: string[]
  reviewedAt?: string | null
}

type BankImportStatus = {
  lastBookingDate: string | null
  lastImportAt?: string | null
  total: number
  recentImports?: Array<{
    id: number
    fileName: string
    format: 'CAMT' | 'CSV'
    paymentAccountId: number
    paymentAccountName?: string | null
    paymentAccountColor?: string | null
    imported: number
    duplicates: number
    errors: number
    importedAt: string
    periodFrom?: string | null
    periodTo?: string | null
  }>
  accounts: Array<{
    id: number
    name: string
    color?: string | null
    lastBookingDate?: string | null
    lastImportAt?: string | null
    lastImportImportedCount?: number | null
    lastImportFileName?: string | null
    total: number
  }>
}

type BankImportHistoryEntry = NonNullable<BankImportStatus['recentImports']>[number]
type ImportOutcome = {
  batchId: number
  paymentAccountId: number
  fileName: string
  imported: number
  duplicates: number
  errors: number
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
  duplicateRows: ImportCommitResult['duplicateRows']
  warnings: string[]
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
  importedTransactionIds: number[]
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
    duplicateBy: 'REFERENCE' | 'FINGERPRINT' | 'RAW' | 'POTENTIAL'
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
  linkedBankTransactionId?: number | null
  matchKind?: 'VOUCHER' | 'RECURRING'
  voucherNo?: string | null
  date?: string | null
  description?: string | null
  grossAmount?: number | null
  paymentAccountName?: string | null
  paymentAccountColor?: string | null
  paymentAccountMismatch?: boolean
  paymentAccountWarning?: string | null
  score?: number
  occurrenceId?: number
  scheduledDate?: string
  recurringBookingId?: number
  recurringBookingName?: string | null
  expectedGrossAmount?: number
  variableAmount?: boolean
  matchedDateSource?: 'BOOKING_DATE' | 'VALUE_DATE'
}

type Props = {
  paymentAccounts: PaymentAccount[]
  notify: (type: 'success' | 'error' | 'info', text: string) => void
  onCreateBooking: (transaction: BankTransaction, acknowledgedBankVoucherIds?: number[]) => void
  onOpenVoucher: (voucherId: number, voucherNo?: string | null, date?: string) => void
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const date = new Intl.DateTimeFormat('de-DE')

function matchScorePresentation(score?: number | null) {
  const value = Number(score || 0)
  if (value >= 60) return { level: 'high', stars: '★★★', label: 'Hohe Übereinstimmung' }
  if (value >= 30) return { level: 'medium', stars: '★★', label: 'Mittlere Übereinstimmung' }
  if (value >= 15) return { level: 'low', stars: '★', label: 'Geringe Übereinstimmung' }
  return { level: 'none', stars: '–', label: 'Keine passende Buchung gefunden' }
}

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

function statusLabel(status: BankTransaction['status']) {
  if (status === 'LINKED') return 'Zugeordnet'
  if (status === 'CHECKED') return 'Geprüft'
  return 'Offen'
}

function BankImportActionDropdown({ onOpenImport }: { onOpenImport: (file?: File) => void }) {
  return <button className="btn primary btn-with-icon" onClick={() => onOpenImport()}>
    <AppIcon icon={IconFileUpload} size="action" /> Bankdaten importieren
  </button>
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

function duplicateReasonLabel(reason: 'REFERENCE' | 'FINGERPRINT' | 'RAW' | 'POTENTIAL') {
  if (reason === 'RAW') return 'Identische Originaldaten'
  if (reason === 'POTENTIAL') return 'Mögliches Duplikat: gleiches Konto, Datum und Betrag'
  return reason === 'REFERENCE'
    ? 'Bankreferenz / End-to-End-ID'
    : 'Fingerprint aus Konto, Datum, Betrag und Text'
}

function BankMatchRow({
  match,
  transaction,
  busy,
  onLink,
  onApplyRecurring
}: {
  match: BankTransactionMatch
  transaction: BankTransaction
  busy: boolean
  onLink: (voucherId: number) => void
  onApplyRecurring: (match: BankTransactionMatch) => void
}) {
  const scoreValue = Number(match.score || 0)
  const score = matchScorePresentation(scoreValue)
  const bookingAmount = match.matchKind === 'RECURRING' ? match.expectedGrossAmount : match.grossAmount
  const difference = bookingAmount == null ? null : Math.round((bookingAmount - transaction.amount) * 100) / 100

  return (
    <div className="bank-match-row">
      <div>
        <strong>
          {match.matchKind === 'RECURRING'
            ? `Dauerbuchung: ${match.recurringBookingName || match.description || 'Ohne Bezeichnung'}`
            : match.voucherNo}
        </strong>
        <span>
          {formatDate(match.date)} · {match.description || 'Ohne Beschreibung'}
        </span>
        <div className="bank-match-amounts">
          <span>{match.matchKind === 'RECURRING' ? 'Sollbetrag' : 'Buchungswert'}: <strong>{bookingAmount == null ? '–' : euro.format(bookingAmount)}</strong></span>
          <span>Bankbeleg: <strong>{euro.format(transaction.amount)}</strong></span>
          {difference != null && (
            <span className={difference === 0 ? 'text-success' : 'bank-match-warning'}>
              {difference === 0 ? 'Beträge stimmen überein' : `Abweichung: ${euro.format(difference)}`}
            </span>
          )}
        </div>
        {match.matchedDateSource === 'VALUE_DATE' && <span>Datumsabgleich über Wertstellung</span>}
        {match.matchKind === 'VOUCHER' && match.recurringBookingName && (
          <span>Bereits aus Dauerbuchung „{match.recurringBookingName}“ gebucht</span>
        )}
        {match.matchKind === 'RECURRING' && match.variableAmount && (
          <span>Betrag wird mit dem Bankbeleg aktualisiert</span>
        )}
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
        className={`fee-suggestion__score fee-suggestion__score--${score.level}`}
        title={
          scoreValue >= 15
            ? `Übereinstimmung: ${Math.round(scoreValue)} von 100 Punkten`
            : `Sehr schwacher Treffer: ${Math.round(scoreValue)} von 100 Punkten`
        }
        aria-label={
          scoreValue >= 15
            ? score.label
            : 'Sehr schwacher Treffer'
        }
      >
        {score.stars}
      </span>
      <button
        className="btn bank-match-link-button"
        disabled={busy}
        onClick={() => match.matchKind === 'RECURRING' ? onApplyRecurring(match) : onLink(match.id)}
      >
        {match.matchKind === 'RECURRING' ? 'Buchen & zuordnen' : 'Zuordnen'}
      </button>
    </div>
  )
}

function ManualAssignmentModal({
  transaction,
  busy,
  onClose,
  onLink,
  notify
}: {
  transaction: BankTransaction
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
        manual: true
      })
      setResults([...result.rows, ...result.alreadyLinked] as BankTransactionMatch[])
    } catch (reason: any) {
      notify('error', reason?.message || String(reason))
    } finally {
      setLoading(false)
    }
  }, [notify, query, transaction.id])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadResults()
    }, 160)
    return () => window.clearTimeout(timer)
  }, [loadResults])

  useEffect(() => {
    setSelectedVoucherId((current) =>
      current && results.some((row) => row.id === current && !row.linkedBankTransactionId) ? current : null
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
              {transaction.counterparty || 'Ohne Gegenpartei'} · {formatDate(transaction.bookingDate)} · {euro.format(transaction.amount)} ·{' '}
              {transaction.direction}
            </p>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Schließen"><AppIcon icon={IconX} size="control" /></button>
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
              Hier siehst du Buchungen desselben Zahlkontos im Abstand
              von bis zu 31 Tagen zum Buchungs- oder Wertstellungsdatum. Die Entscheidung triffst du
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
                      onClick={() => !match.linkedBankTransactionId && setSelectedVoucherId(match.id)}
                    >
                      <td>
                        <input
                          type="radio"
                          disabled={!!match.linkedBankTransactionId}
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
                          {match.linkedBankTransactionId && (
                            <span className="bank-match-warning">
                              Bereits Bankbeleg #{match.linkedBankTransactionId} zugeordnet – nicht erneut zuweisbar.
                            </span>
                          )}
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
          <button className="btn ghost" onClick={onClose} aria-label="Schließen"><AppIcon icon={IconX} size="control" /></button>
        </header>

        {result.duplicateRows.length > 0 && (
          <section className="bank-review-section">
            <div className="bank-section-title">
              <div>
                <strong>Erkannte Duplikate</strong>
                <span className="helper">Zum bewussten Importieren die jeweilige Zeile auswählen.</span>
              </div>
            </div>
            <div className="bank-duplicate-list">
              {result.duplicateRows.map((row) => {
                const selected = selectedRows.includes(row.sourceRow)
                return (
                  <div
                    key={row.sourceRow}
                    className={`bank-duplicate-row ${selected ? 'active' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    onClick={() => onToggleRow(row.sourceRow)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onToggleRow(row.sourceRow)
                      }
                    }}
                  >
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
                        <div>
                          <span>Importzeile</span>
                          <strong>{row.counterparty || row.purpose || 'Ohne Beschreibung'}</strong>
                          <small>
                            {formatDate(row.bookingDate)} · {row.direction} ·{' '}
                            {euro.format(row.amount)}
                          </small>
                        </div>
                        <div className="bank-duplicate-compact__equals" aria-hidden="true">→</div>
                        <div>
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
                    </div>
                  </div>
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
  initialFile,
  initialAccountId,
  onClose,
  onImported,
  notify
}: {
  accounts: PaymentAccount[]
  initialFile?: File | null
  initialAccountId?: number | null
  onClose: () => void
  onImported: (result: ImportCommitResult, context: { paymentAccountId: number; fileName: string }) => void
  notify: Props['notify']
}) {
  const paymentAccountRef = React.useRef<HTMLSelectElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<CsvMapping>({})
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(() => accounts.some(account => account.id === initialAccountId && account.isActive !== 0 && account.kind !== 'CASH') ? initialAccountId! : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [paymentAccountError, setPaymentAccountError] = useState(false)
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null)
  const [selectedDuplicateRows, setSelectedDuplicateRows] = useState<number[]>([])
  const [additionalImportRows, setAdditionalImportRows] = useState<number[]>([])
  const previewRequest = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const initialFileHandled = useRef(false)
  const [excludedRows, setExcludedRows] = useState<number[]>([])
  const [reviewFilter, setReviewFilter] = useState<'ALL' | 'NEW' | 'DUPLICATE' | 'ERROR'>('ALL')
  const [reviewQuery, setReviewQuery] = useState('')
  const [reviewPage, setReviewPage] = useState(1)
  const [importing, setImporting] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [aiAvailable, setAiAvailable] = useState(false)
  const [reviewWithAi, setReviewWithAi] = useState(false)
  const [importHistory, setImportHistory] = useState<BankImportStatus | null>(null)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyFailed, setHistoryFailed] = useState(false)

  useEffect(() => {
    let active = true
    void window.api.bankTransactions.importStatus()
      .then(status => { if (active) setImportHistory(status) })
      .catch(() => { if (active) setHistoryFailed(true) })
      .finally(() => { if (active) setHistoryLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    void window.api.ai.settings.get()
      .then((settings) => {
        if (!active) return
        setAiAvailable(settings.hasApiKey)
      })
      .catch(() => {
        if (active) setAiAvailable(false)
      })
    return () => {
      active = false
    }
  }, [])

  const loadPreview = async (nextFile: File, nextBytes: Uint8Array, nextMapping?: CsvMapping, nextAccount = paymentAccountId) => {
    if (!nextAccount) return
    const request = ++previewRequest.current
    setBusy(true)
    setExcludedRows([])
    setReviewPage(1)
    setAdditionalImportRows([])
    setError('')
    try {
      const result = (await window.api.bankImports.preview({
        fileBytes: nextBytes,
        fileName: nextFile.name,
        paymentAccountId: nextAccount,
        mapping: nextMapping
      })) as ImportPreview
      if (request !== previewRequest.current) return
      setPreview(result)
      setAdditionalImportRows([])
      if (!nextMapping) setMapping(result.suggestedMapping)
      if (result.detectedPaymentAccountId) {
        setPaymentAccountId(result.detectedPaymentAccountId)
        setPaymentAccountError(false)
      }
    } catch (reason: any) {
      if (request !== previewRequest.current) return
      setError(reason?.message || String(reason))
      setPreview(null)
    } finally {
      if (request === previewRequest.current) setBusy(false)
    }
  }

  const chooseFile = async (nextFile?: File) => {
    if (!nextFile || !paymentAccountId || importing) return
    if (!/\.(xml|csv)$/i.test(nextFile.name)) {
      setError('Bitte wähle eine CAMT-XML- oder CSV-Datei.')
      return
    }
    const request = ++previewRequest.current
    setFile(nextFile)
    setFileBytes(null)
    setPreview(null)
    setBusy(true)
    setError('')
    setReviewFilter('ALL')
    setReviewQuery('')
    try {
      const nextBytes = new Uint8Array(await nextFile.arrayBuffer())
      if (request !== previewRequest.current) return
      setFileBytes(nextBytes)
      await loadPreview(nextFile, nextBytes)
    } catch (reason: any) {
      if (request !== previewRequest.current) return
      setError(reason?.message || String(reason))
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!initialFile || !paymentAccountId || initialFileHandled.current) return
    initialFileHandled.current = true
    void chooseFile(initialFile)
  }, [initialFile, paymentAccountId])

  useEffect(() => () => { previewRequest.current++ }, [])

  const clearFile = () => {
    previewRequest.current++
    setFile(null)
    setFileBytes(null)
    setPreview(null)
    setMapping({})
    setAdditionalImportRows([])
    setExcludedRows([])
    setBusy(false)
    setError('')
  }

  const commit = async () => {
    if (!file || !fileBytes || !preview || busy || importing || !importCount) return
    if (!paymentAccountId) {
      setPaymentAccountError(true)
      window.setTimeout(() => paymentAccountRef.current?.focus(), 0)
      return
    }
    setBusy(true)
    setImporting(true)
    setError('')
    try {
      const result = (await window.api.bankImports.commit({
        fileBytes,
        fileName: file.name,
        paymentAccountId,
        additionalImportSourceRows: additionalImportRows,
        selectedSourceRows: preview.rows.filter(row => !row.errors.length && !excludedRows.includes(row.sourceRow)).map(row => row.sourceRow),
        mapping: preview?.format === 'CSV' ? mapping : undefined
      })) as ImportCommitResult
      notify(
        'success',
        `${result.imported} ${result.imported === 1 ? 'Bankbeleg' : 'Bankbelege'} importiert.${result.duplicates ? ` ${result.duplicates} Duplikat(e) übersprungen.` : ''}`
      )
      if (result.errors.length)
        notify('info', `${result.errors.length} fehlerhafte Zeile(n) wurden nicht übernommen.`)
      if (reviewWithAi && result.importedTransactionIds.length) {
        try {
          const review = await window.api.ai.bankImports.reviewOpen({
            transactionIds: result.importedTransactionIds
          })
          notify('success', `${review.suggestions.length} KI-Vorschlag/-Vorschläge vorbereitet.`)
        } catch (aiReason: any) {
          notify('info', `Import abgeschlossen, KI-Prüfung nicht verfügbar: ${aiReason?.message || String(aiReason)}`)
        }
      }
      onImported(result, { paymentAccountId, fileName: file.name })
      // Only ask again for conflicts that were not already reviewed and skipped.
      const unexpectedDuplicates = result.duplicateRows.filter(row =>
        additionalImportRows.includes(row.sourceRow) || !(preview?.duplicateRows || []).some(known =>
          known.sourceRow === row.sourceRow && known.existing.id === row.existing.id && known.duplicateBy === row.duplicateBy
        )
      )
      const unexpectedErrors = result.errors.filter(error => !preview.rows.some(row => row.sourceRow === error.row && row.errors.length))
      if (unexpectedDuplicates.length || unexpectedErrors.length) {
        setCommitResult({ ...result, duplicateRows: unexpectedDuplicates })
        setSelectedDuplicateRows([])
      } else {
        onClose()
      }
    } catch (reason: any) {
      setError(reason?.message || String(reason))
    } finally {
      setBusy(false)
      setImporting(false)
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
      onImported(result, { paymentAccountId, fileName: file.name })
    } catch (reason: any) {
      setError(reason?.message || String(reason))
    } finally {
      setBusy(false)
    }
  }

  const setMap = (key: keyof CsvMapping, value: string | null) => {
    const nextMapping = { ...mapping, [key]: value }
    setMapping(nextMapping)
    if (file && fileBytes) void loadPreview(file, fileBytes, nextMapping)
  }
  const previewDuplicates = preview?.duplicateRows ?? []
  const duplicatesByRow = new Map(previewDuplicates.map(row => [row.sourceRow, row]))
  const importCount = (preview?.rows || []).filter(row => !row.errors.length && !excludedRows.includes(row.sourceRow)
    && (!duplicatesByRow.has(row.sourceRow) || additionalImportRows.includes(row.sourceRow))).length
  const newCount = (preview?.summary.valid || 0) - previewDuplicates.length
  const filteredRows = (preview?.rows || []).filter(row => {
    const kind = row.errors.length ? 'ERROR' : duplicatesByRow.has(row.sourceRow) ? 'DUPLICATE' : 'NEW'
    const haystack = [row.sourceRow, row.bookingDate, formatDate(row.bookingDate), row.counterparty, row.purpose, row.amount, euro.format(row.amount), row.errors.join(' ')].join(' ').toLocaleLowerCase('de-DE')
    return (reviewFilter === 'ALL' || kind === reviewFilter) && haystack.includes(reviewQuery.toLocaleLowerCase('de-DE').trim())
  })
  const reviewPageSize = 10
  const reviewPages = Math.max(1, Math.ceil(filteredRows.length / reviewPageSize))
  const currentReviewPage = Math.min(reviewPage, reviewPages)
  const visibleRows = filteredRows.slice((currentReviewPage - 1) * reviewPageSize, currentReviewPage * reviewPageSize)
  const activeAccounts = accounts.filter(
    (account) => account.isActive !== 0 && account.kind !== 'CASH'
  )
  const paymentAccountsById = new Map(activeAccounts.map((account) => [account.id, account]))
  const selectedPaymentAccountColor =
    paymentAccountsById.get(Number(paymentAccountId || 0))?.color || undefined
  const accountHistory = importHistory?.accounts.find(account => account.id === paymentAccountId)

  return createPortal(
    <div
      className="modal-overlay bank-import-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Bankdaten importieren"
      onMouseDown={(event) => !importing && event.target === event.currentTarget && onClose()}
    >
      <div className="modal bank-import-modal bank-import-dialog">
        <header className="bank-modal-header">
          <div>
            <h2>Bankdaten importieren</h2>
            <p>CAMT.052/053 oder CSV prüfen und als offene Bankbelege übernehmen.</p>
          </div>
          <button className="btn ghost" disabled={importing} onClick={onClose} aria-label="Schließen"><AppIcon icon={IconX} size="control" /></button>
        </header>

        <div className="bank-import-scroll">
          <section className="bank-import-account-card">
            {!preview && <div className="bank-import-step-heading"><AppIcon icon={IconBuildingBank} size="action" /><div><strong>1. Konto auswählen</strong><span>Alle Umsätze werden für dieses Vereinskonto geprüft.</span></div></div>}
            <div className="bank-import-account-options">
              <label className="field">
                <span>Zahlkonto <span className="req-asterisk" aria-hidden="true">*</span></span>
                <select ref={paymentAccountRef} className="input" value={paymentAccountId ?? ''} disabled={importing}
                  style={{ color: selectedPaymentAccountColor }} aria-invalid={paymentAccountError}
                  onChange={event => {
                    const next = event.target.value ? Number(event.target.value) : null
                    previewRequest.current++
                    setPaymentAccountId(next)
                    setPaymentAccountError(false)
                    setPreview(null)
                    setAdditionalImportRows([])
                    setExcludedRows([])
                    if (!next) clearFile()
                    else if (file && fileBytes) void loadPreview(file, fileBytes, mapping, next)
                    else { setBusy(false); setFile(null) }
                  }}>
                  <option value="">Zahlkonto wählen</option>
                  {activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.iban ? ` · ${account.iban}` : ''}</option>)}
                </select>
              </label>
              {paymentAccountId && aiAvailable && <label className="bank-import-ai-option">
                <input type="checkbox" checked={reviewWithAi} disabled={busy} onChange={event => setReviewWithAi(event.target.checked)} />
                <span><strong>KI-Vorschläge nach dem Import erstellen</strong><small>Nur die neu übernommenen Bankbelege werden geprüft.</small></span>
              </label>}
            </div>
            {!paymentAccountId && <p className="helper">{activeAccounts.length ? 'Wähle zuerst das Konto. Danach kannst du eine Datei laden und die Umsätze prüfen.' : 'Lege zuerst ein aktives Zahlkonto in den Einstellungen an.'}</p>}
            {paymentAccountId && <section className="bank-import-account-history" aria-label="Importhistorie des ausgewählten Kontos" aria-live="polite" aria-busy={historyLoading}>
              <strong className="bank-import-history-heading"><AppIcon icon={IconHistory} size="control" /> Importstand dieses Kontos</strong>
              {historyLoading ? <p>Importhistorie wird geladen …</p> : historyFailed ? <p>Die Importhistorie konnte nicht geladen werden. Du kannst die Datei trotzdem prüfen.</p> : accountHistory?.lastImportAt ? <>
                <dl className="bank-import-history-facts">
                  <div><dt>Letzter Import mit Buchungen</dt><dd>{formatDateTime(accountHistory.lastImportAt)}</dd></div>
                  <div><dt>Dabei übernommen</dt><dd>{accountHistory.lastImportImportedCount == null ? '–' : `${accountHistory.lastImportImportedCount} Buchungssätze`}</dd></div>
                  <div><dt>Neuester importierter Umsatz</dt><dd>{accountHistory.lastBookingDate ? formatDate(accountHistory.lastBookingDate) : 'Noch keine Umsätze'}</dd></div>
                </dl>
                {accountHistory.lastImportFileName && <p className="bank-import-history-file">Letzte Datei: {accountHistory.lastImportFileName}</p>}
                {accountHistory.lastBookingDate && <p>Nächsten Auszug ab <strong>{formatDate(accountHistory.lastBookingDate)}</strong> wählen. Überschneidungen werden auf Duplikate geprüft.</p>}
              </> : <p>Für dieses Konto wurden noch keine Buchungen importiert.</p>}
            </section>}
          </section>

          {paymentAccountId && <>
            <input ref={fileInputRef} type="file" accept=".xml,.csv,text/csv,application/xml,text/xml" hidden disabled={busy}
              onChange={event => { void chooseFile(event.target.files?.[0]); event.target.value = '' }} />
            <section className={`bank-import-file-card ${file ? 'has-file' : ''} ${dragActive ? 'is-dragging' : ''}`}
              aria-label="Bankdatei auswählen"
              onDragOver={event => { event.preventDefault(); if (!busy) setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={event => { event.preventDefault(); setDragActive(false); if (!busy) void chooseFile(event.dataTransfer.files[0]) }}>
              <AppIcon icon={file ? IconFileDescription : IconFileUpload} size="action" />
              <div><strong>{file?.name || '2. Kontoauszug auswählen oder hier ablegen'}</strong>
                <small>{file ? `${preview?.format || 'Bankdatei'} · ${Math.max(1, Math.ceil(file.size / 1024))} KB` : 'CAMT.052/053 oder CSV'}</small></div>
              {file && <button className="btn ghost" disabled={busy} onClick={clearFile} aria-label="Datei entfernen"><AppIcon icon={IconX} size="control" /></button>}
              <button className="btn" disabled={busy} onClick={() => fileInputRef.current?.click()}>{file ? 'Andere Datei wählen' : 'Datei wählen'}</button>
            </section>
            {busy && <div className="bank-import-loading" role="status">{importing ? 'Bankbelege werden importiert …' : 'Datei und vorhandene Umsätze werden geprüft …'}</div>}
            {preview && <>
              <div className={`bank-import-file-status ${preview.summary.errors ? 'has-errors' : ''}`} role="status">
                <AppIcon icon={preview.summary.errors ? IconAlertTriangle : IconCheck} size="action" />
                <div><strong>{preview.summary.errors ? 'Datei geprüft – bitte Hinweise beachten' : 'Datei erfolgreich geladen'}</strong>
                  <small>{preview.format} erkannt · {preview.summary.total} Zeilen · {preview.summary.valid} gültig · {preview.summary.errors} fehlerhaft</small></div>
              </div>
              {preview.accountIbans.length > 0 && <span className="helper">IBAN im Auszug: {preview.accountIbans.join(', ')}</span>}
              {preview.format === 'CSV' && <section className="bank-import-mapping-card">
                <div className="bank-import-section-heading"><div><strong>Spaltenzuordnung</strong><small>Weise die CSV-Spalten den passenden Feldern zu. Änderungen werden automatisch geprüft.</small></div>
                  <button className="btn ghost" disabled={busy} onClick={() => { if (file && fileBytes) void loadPreview(file, fileBytes) }}><AppIcon icon={IconSparkles} size="control" /> Automatisch zuordnen</button></div>
                <fieldset disabled={busy} className="bank-import-mapping-fields">
                  <div className="bank-import-mapping-grid bank-import-mapping-grid--primary">
                    <MappingSelect label="Buchungsdatum *" value={mapping.bookingDate} headers={preview.headers} onChange={value => setMap('bookingDate', value)} />
                    <MappingSelect label="Betrag mit Vorzeichen" value={mapping.amount} headers={preview.headers} onChange={value => setMap('amount', value)} />
                    <MappingSelect label="Soll / Belastung" value={mapping.debit} headers={preview.headers} onChange={value => setMap('debit', value)} />
                    <MappingSelect label="Haben / Gutschrift" value={mapping.credit} headers={preview.headers} onChange={value => setMap('credit', value)} />
                    <MappingSelect label="Gegenpartei *" value={mapping.counterparty} headers={preview.headers} onChange={value => setMap('counterparty', value)} />
                    <MappingSelect label="Verwendungszweck" value={mapping.purpose} headers={preview.headers} onChange={value => setMap('purpose', value)} />
                  </div>
                  <details className="bank-more-options"><summary className="btn btn-with-icon"><AppIcon icon={IconPlus} size="control" />Weitere Spalten</summary>
                    <div className="bank-import-mapping-grid">
                      {([['valueDate', 'Wertstellung'], ['currency', 'Währung'], ['counterpartyIban', 'IBAN Gegenkonto'], ['reference', 'Bankreferenz'], ['endToEndId', 'End-to-End-ID'], ['accountIban', 'IBAN Vereinskonto']] as const).map(([key, label]) =>
                        <MappingSelect key={key} label={label} value={mapping[key]} headers={preview.headers} onChange={value => setMap(key, value)} />)}
                    </div>
                  </details>
                </fieldset>
              </section>}
              {preview.warnings?.map(warning => <p className="bank-import-warning" role="alert" key={warning}><AppIcon icon={IconAlertTriangle} size="action" /> {warning}</p>)}
              <section className="bank-import-review" aria-label="Datenvorschau und Prüfung" aria-busy={busy}>
                <div className="bank-import-section-heading"><div><strong>3. Datenvorschau und Prüfung</strong><small>Neue Umsätze übernehmen, Duplikate vergleichen und Probleme prüfen.</small></div>
                  <span className="helper">{importCount} zum Import ausgewählt</span></div>
                {previewDuplicates.length > 0 && <div className="bank-import-duplicate-banner">
                  <AppIcon icon={IconAlertTriangle} size="action" /><div><strong>{previewDuplicates.length} Duplikatverdacht / Duplikate erkannt</strong>
                    <small>Diese Zeilen werden übersprungen. Aktiviere den Import nur bei einer zusätzlichen, tatsächlich erfolgten Zahlung.</small></div>
                  <button className="btn" onClick={() => { setReviewFilter(reviewFilter === 'DUPLICATE' ? 'ALL' : 'DUPLICATE'); setReviewPage(1) }}>{reviewFilter === 'DUPLICATE' ? 'Alle anzeigen' : 'Nur Duplikate anzeigen'}</button>
                </div>}
                <div className="bank-import-review-toolbar">
                  <div className="bank-import-review-tabs" role="group" aria-label="Vorschau filtern">
                    {([['ALL', 'Alle Buchungen', preview.summary.total], ['NEW', 'Neu', newCount], ['DUPLICATE', 'Duplikate', previewDuplicates.length], ['ERROR', 'Fehlerhaft', preview.summary.errors]] as const).map(([key, label, count]) =>
                      <button key={key} className={reviewFilter === key ? 'active' : ''} aria-pressed={reviewFilter === key} onClick={() => { setReviewFilter(key); setReviewPage(1) }}>{label} ({count})</button>)}
                  </div>
                  <input className="input" aria-label="Importvorschau durchsuchen" placeholder="Buchungen durchsuchen …" value={reviewQuery} onChange={event => { setReviewQuery(event.target.value); setReviewPage(1) }} />
                </div>
                <div className="bank-import-review-table-wrap">
                  <table className="bank-table bank-import-review-table" aria-label="Umsätze vor dem Import prüfen">
                    <thead><tr><th>#</th><th>Status</th><th>Datum</th><th>Gegenpartei / Verwendungszweck</th><th className="number">Betrag</th><th>Passender Bankbeleg</th><th>Importieren</th></tr></thead>
                    <tbody>{visibleRows.map(row => {
                      const duplicate = duplicatesByRow.get(row.sourceRow)
                      const invalid = row.errors.length > 0
                      const selected = !invalid && !excludedRows.includes(row.sourceRow) && (!duplicate || additionalImportRows.includes(row.sourceRow))
                      const kind = invalid ? 'error' : duplicate ? duplicate.duplicateBy === 'POTENTIAL' ? 'potential' : 'duplicate' : 'new'
                      const label = invalid ? 'Fehler' : duplicate ? duplicate.duplicateBy === 'POTENTIAL' ? 'Prüfen' : 'Duplikat' : 'Neu'
                      return <tr key={row.sourceRow} className={`bank-import-review-row--${kind}`}>
                        <td>{row.sourceRow}</td><td><span className={`bank-import-status bank-import-status--${kind}`} title={duplicate ? duplicateReasonLabel(duplicate.duplicateBy) : row.errors.join(' ')}><AppIcon icon={kind === 'new' ? IconCheck : IconAlertTriangle} size="control" />{label}</span></td>
                        <td>{formatDate(row.bookingDate)}</td>
                        <td><div className="bank-import-cell-text">{row.counterparty && <strong>{row.counterparty}</strong>}<span>{row.purpose || (!row.counterparty ? 'Ohne Verwendungszweck' : '')}</span>{invalid && <small className="text-danger">{row.errors.join(' ')}</small>}</div></td>
                        <td className={`number bank-amount--${row.direction.toLowerCase()}`}>{row.direction === 'OUT' ? '−' : '+'}{row.currency === 'EUR' ? euro.format(row.amount) : `${row.amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })} ${row.currency}`}</td>
                        <td>{duplicate ? <details className="bank-import-match"><summary>{formatDate(duplicate.existing.bookingDate)} · {duplicate.existing.direction === 'OUT' ? '−' : '+'}{euro.format(duplicate.existing.amount)}<small>Bankbeleg #{duplicate.existing.id} · Details</small></summary>
                          <div><span>{duplicate.existing.counterparty}</span><span>{duplicate.existing.purpose || 'Ohne Verwendungszweck'}</span><small>{duplicate.existing.paymentAccountName} · {duplicate.existing.sourceFileName}</small><small>{duplicateReasonLabel(duplicate.duplicateBy)}</small></div></details> : <span className="helper">—</span>}</td>
                        <td>{invalid ? <span className="helper">Nicht möglich</span> : <label className="bank-import-choice"><input type="checkbox" role="switch" checked={selected} disabled={busy}
                          aria-label={`${duplicate ? 'Als zusätzlichen Umsatz importieren' : 'Importieren'}: Zeile ${row.sourceRow}`}
                          onChange={event => {
                            const checked = event.target.checked
                            if (duplicate) setAdditionalImportRows(current => checked ? [...current, row.sourceRow] : current.filter(value => value !== row.sourceRow))
                            else setExcludedRows(current => checked ? current.filter(value => value !== row.sourceRow) : [...current, row.sourceRow])
                          }} /><span>{selected ? duplicate ? 'Zusätzlich importieren' : 'Importieren' : 'Nicht importieren'}</span></label>}</td>
                      </tr>
                    })}{!visibleRows.length && <tr><td colSpan={7}><div className="bank-empty">Keine Buchungen für diesen Filter.</div></td></tr>}</tbody>
                  </table>
                </div>
                <div className="bank-import-review-pagination"><span>{filteredRows.length ? (currentReviewPage - 1) * reviewPageSize + 1 : 0}–{Math.min(currentReviewPage * reviewPageSize, filteredRows.length)} von {filteredRows.length} Buchungen</span><div>
                  <button className="btn ghost" aria-label="Vorherige Vorschauseite" disabled={currentReviewPage === 1} onClick={() => setReviewPage(currentReviewPage - 1)}><AppIcon icon={IconChevronLeft} size="control" /></button>
                  <span>Seite {currentReviewPage} / {reviewPages}</span>
                  <button className="btn ghost" aria-label="Nächste Vorschauseite" disabled={currentReviewPage === reviewPages} onClick={() => setReviewPage(currentReviewPage + 1)}><AppIcon icon={IconChevronRight} size="control" /></button>
                </div></div>
              </section>
            </>}
          </>}
          {error && <div className="inline-error" role="alert">{error}</div>}
        </div>
        <footer className="bank-modal-footer">
          <span className="helper">{!paymentAccountId ? 'Zuerst ein Zahlkonto auswählen' : preview ? `${importCount} ausgewählt · ${previewDuplicates.length - additionalImportRows.length} Duplikate übersprungen` : 'Kontoauszug als CSV oder CAMT laden'}</span>
          <button className="btn" disabled={importing} onClick={onClose}>{preview && !importCount ? 'Schließen' : 'Abbrechen'}</button>
          <button className="btn primary" disabled={busy || !paymentAccountId || !preview || importCount === 0} onClick={() => void commit()}>
            {importing ? 'Import läuft …' : busy ? 'Wird geprüft …' : `${importCount} Beleg(e) importieren`}
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
          <button className="btn ghost" onClick={onClose} aria-label="Schließen"><AppIcon icon={IconX} size="control" /></button>
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
  const [alreadyLinked, setAlreadyLinked] = useState<BankTransactionMatch[]>([])
  const [matchesLoaded, setMatchesLoaded] = useState(false)
  const [duplicateReviewed, setDuplicateReviewed] = useState(false)
  const [loading, setLoading] = useState(transaction.status === 'OPEN')
  const [busy, setBusy] = useState(false)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [showManualAssign, setShowManualAssign] = useState(false)
  const [showReimbursement, setShowReimbursement] = useState(false)
  const actionMenuRef = React.useRef<HTMLDivElement | null>(null)

  const loadMatches = useCallback(async () => {
    if (transaction.status !== 'OPEN') return
    setLoading(true)
    setMatchesLoaded(false)
    setDuplicateReviewed(false)
    try {
      const result = await window.api.bankTransactions.matches({
        id: transaction.id
      })
      setMatches(result.rows as BankTransactionMatch[])
      setAlreadyLinked(result.alreadyLinked as BankTransactionMatch[])
      setMatchesLoaded(true)
    } catch (reason: any) {
      notify('error', reason?.message || String(reason))
    } finally {
      setLoading(false)
    }
  }, [notify, transaction.id, transaction.status])

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

  const applyRecurring = async (match: BankTransactionMatch) => {
    if (!match.recurringBookingId || (!match.occurrenceId && !match.scheduledDate)) return
    setBusy(true)
    try {
      const result = await window.api.recurringBookings.book({
        recurringBookingId: match.recurringBookingId,
        occurrenceId: match.occurrenceId,
        scheduledDate: match.scheduledDate || match.date || undefined,
        bookingDate: transaction.bookingDate,
        amount: transaction.amount,
        bankTransactionId: transaction.id
      })
      notify('success', `Dauerbuchung und Bankbeleg wurden als ${result.voucherNo} zusammengeführt.`)
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

  const createBooking = () => {
    if (transaction.status !== 'OPEN' || busy || loading || !matchesLoaded || (alreadyLinked.length > 0 && !duplicateReviewed)) return
    setActionMenuOpen(false)
    onCreateBooking(transaction, duplicateReviewed ? alreadyLinked.map((match) => match.id) : [])
    onClose()
  }

  return createPortal(
    <div
      className="modal-overlay bank-import-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      >
      <div className="modal bank-review-modal bank-review-modal--structured">
        <header className="bank-modal-header">
          <div className="bank-review-title"><IconFileDescription size={23} aria-hidden="true" /><div><div className="bank-review-title-line"><h2>Bankbeleg #{transaction.id}</h2><span className={`bank-status bank-review-status-badge bank-status--${transaction.status.toLowerCase()}`}>{statusLabel(transaction.status)}</span></div><p>Alle Informationen zu diesem Bankbeleg</p></div></div>
          <div className="bank-header-actions">
            <div className="bank-action-menu" ref={actionMenuRef}>
              <button
                className="btn bank-action-menu__trigger"
                onClick={() => setActionMenuOpen((open) => !open)}
                aria-label="Aktionen"
                aria-expanded={actionMenuOpen}
              >
                <AppIcon icon={IconDotsVertical} size="action" />
              </button>
              {actionMenuOpen && (
                <div className="bank-action-menu__popover">
                  {transaction.status === 'OPEN' && (
                    <>
                      <button
                        className="btn"
                        disabled={busy || loading || !matchesLoaded || (alreadyLinked.length > 0 && !duplicateReviewed)}
                        onClick={createBooking}
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
                    <button className="btn" onClick={() => { setActionMenuOpen(false); setShowReimbursement(true) }}>
                      {transaction.direction === 'IN' ? 'Als Erstattung zuordnen' : 'Erstattung erwarten'}
                    </button>
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
            <button
              className="btn ghost booking-modal-icon-btn booking-modal-close-btn"
              type="button"
              onClick={onClose}
              title="Schließen (ESC)"
              aria-label="Schließen"
            >
              <AppIcon icon={IconX} size="action" />
            </button>
          </div>
        </header>

        <div className="bank-review-scroll">
        <section className="bank-review-summary">
          <div className="bank-review-summary-main">
            <div className={`bank-review-amount bank-review-amount--${transaction.direction.toLowerCase()}`}>
              <span className="bank-review-eyebrow">Betrag</span>
              <strong><span className="bank-review-direction-icon">{transaction.direction === 'IN' ? <IconArrowUp size={22} /> : <IconArrowDown size={22} />}</span>{transaction.direction === 'OUT' ? '−' : '+'}{euro.format(transaction.amount)}</strong>
              <span className={`badge ${transaction.direction.toLowerCase()}`}>{transaction.direction === 'IN' ? 'Einnahme' : 'Ausgabe'}</span>
            </div>
            <div className="bank-review-purpose"><span className="bank-review-eyebrow">Verwendungszweck</span><h3>{transaction.purpose || 'Ohne Verwendungszweck'}</h3><p><IconUser size={15} />{transaction.counterparty || 'Ohne Gegenpartei'}</p></div>
          </div>
          <div className="bank-review-facts">
            <div><IconCalendar size={21} /><span><small>Datum</small><strong>{formatDate(transaction.bookingDate)}</strong></span></div>
            <div><IconBuildingBank size={21} /><span><small>Zahlkonto</small><strong style={{ color: transaction.paymentAccountColor || undefined }}>{transaction.paymentAccountName || '–'}</strong></span></div>
            <div><IconCalendar size={21} /><span><small>Wertstellung</small><strong>{formatDate(transaction.valueDate)}</strong></span></div>
          </div>
        </section>
        <div className="bank-review-info-grid">
          <section className="bank-review-info"><h3><IconInfoCircle size={18} />Weitere Informationen</h3><dl><div><dt>IBAN Gegenkonto</dt><dd>{transaction.counterpartyIban || '–'}</dd></div><div><dt>End-to-End-ID</dt><dd>{transaction.endToEndId || '–'}</dd></div></dl></section>
          <section className="bank-review-info"><h3><IconPaperclip size={18} />Belegdaten</h3><dl><div><dt>Bankreferenz</dt><dd>{transaction.bankReference || '–'}</dd></div><div><dt>Quelldatei</dt><dd>{transaction.sourceFileName || '–'}</dd></div></dl></section>
        </div>

        {transaction.status === 'OPEN' ? (
          <div className="bank-review-layout">
            {!loading && alreadyLinked.length > 0 && (
              <section className="bank-review-section bank-duplicate-card" aria-label="Mögliche Doppelbuchung">
                <div className="bank-duplicate-card__heading">
                  <span className="bank-duplicate-card__icon"><AppIcon icon={IconAlertTriangle} size="action" /></span>
                  <div>
                    <h3>Mögliche Doppelbuchung</h3>
                    <p>Passende Buchungen sind bereits zugeordnet. Ist es derselbe Umsatz, erledige diesen Bankbeleg ohne neue Buchung.</p>
                  </div>
                </div>
                <div className="bank-duplicate-card__matches">
                  {alreadyLinked.map((match) => (
                    <div className="bank-duplicate-card__match" key={match.id}>
                      <div className="bank-duplicate-card__booking">
                        <strong>{match.description || match.voucherNo}</strong>
                        <span>{formatDate(match.date)} · {match.voucherNo}</span>
                        <span className="bank-duplicate-card__link">
                          <AppIcon icon={IconLink} size="inline" />
                          Bereits Bankbeleg #{match.linkedBankTransactionId} zugeordnet
                        </span>
                      </div>
                      <strong className="bank-duplicate-card__amount">{euro.format(Number(match.grossAmount))}</strong>
                      <button className="btn ghost" onClick={() => {
                        onOpenVoucher(match.id, match.voucherNo, match.date || undefined)
                        onClose()
                      }}><AppIcon icon={IconExternalLink} size="control" /> Buchung öffnen</button>
                    </div>
                  ))}
                </div>
                <div className="bank-duplicate-card__actions">
                  <button className="btn bank-duplicate-card__resolve" disabled={busy} onClick={() => {
                    onCheckWithoutBooking(transaction)
                    onClose()
                  }}><AppIcon icon={IconCheck} size="control" /> Ohne neue Buchung erledigen</button>
                  <span>Die bestehende Buchung bleibt erhalten.</span>
                </div>
                <details className="bank-duplicate-card__alternative" onToggle={(event) => {
                  if (!event.currentTarget.open) setDuplicateReviewed(false)
                }}>
                  <summary>Es ist ein zusätzlicher Umsatz</summary>
                  <label>
                    <input type="checkbox" checked={duplicateReviewed} onChange={(event) => setDuplicateReviewed(event.target.checked)} />
                    Ich habe die Zuordnungen geprüft. Für diesen zusätzlichen Umsatz ist eine neue Buchung nötig.
                  </label>
                  <button className="btn ghost" disabled={busy || !duplicateReviewed} onClick={() => {
                    onCreateBooking(transaction, alreadyLinked.map((match) => match.id))
                    onClose()
                  }}><AppIcon icon={IconPlus} size="control" /> Zusätzliche Buchung anlegen</button>
                </details>
              </section>
            )}
            <section className="bank-review-section">
              <div className="bank-section-title">
                <div className="bank-section-title__label">
                  <IconMessage size={18} /><strong>Passende Buchungen und Dauerbuchungen</strong>
                </div>
                <div className="bank-match-toolbar">
                  <button className="btn" type="button" onClick={() => setShowManualAssign(true)}>
                    <AppIcon icon={IconLink} size="control" />
                    Manuell zuweisen
                  </button>
                </div>
              </div>
              <div className="bank-match-list">
                {loading && <div className="helper">Treffer werden gesucht …</div>}
                {!loading &&
                  matches.map((match) => (
                    <BankMatchRow
                      key={`${match.matchKind || 'VOUCHER'}-${match.id}`}
                      match={match}
                      transaction={transaction}
                      busy={busy}
                      onLink={(voucherId) => {
                          void link(voucherId)
                      }}
                      onApplyRecurring={(candidate) => {
                        void applyRecurring(candidate)
                      }}
                    />
                  ))}
                {!loading && matches.length === 0 && (
                  <div className="bank-empty-small">{alreadyLinked.length
                    ? 'Keine weitere, noch nicht zugeordnete Buchung gefunden.'
                    : 'Keine kompatible Buchung gefunden.'}</div>
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

        {showReimbursement && transaction.voucherId && <ReimbursementsDialog
          notify={notify}
          voucher={{ id: transaction.voucherId, type: transaction.direction, grossAmount: transaction.amount, description: transaction.purpose }}
          startCreate={transaction.direction === 'OUT'}
          onClose={() => setShowReimbursement(false)}
          onNavigate={onClose}
        />}
        {showManualAssign && (
          <ManualAssignmentModal
            transaction={transaction}
            busy={busy}
            onClose={() => setShowManualAssign(false)}
            onLink={(voucherId) => {
              void link(voucherId)
            }}
            notify={notify}
          />
        )}

        </div>
        <footer className="bank-modal-footer">
          <button className="btn" onClick={onClose}>
            Schließen
          </button>
          {transaction.status === 'OPEN' && matchesLoaded && !loading && alreadyLinked.length === 0 && (
            <button className="btn primary btn-with-icon" disabled={busy} onClick={createBooking}>
              <AppIcon icon={IconPlus} size="control" /> Buchung anlegen
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body
  )
}

function BankAiSuggestionModal({
  transaction,
  suggestion: initialSuggestion,
  onClose,
  onChanged,
  onOpenReview,
  notify
}: {
  transaction: BankTransaction
  suggestion: BankAiSuggestion
  onClose: () => void
  onChanged: () => void
  onOpenReview: (transaction: BankTransaction) => void
  notify: Props['notify']
}) {
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [suggestion, setSuggestion] = useState<BankAiSuggestion>(initialSuggestion)
  const actionLabel = {
    LINK_EXISTING: 'Bestehende Buchung zuordnen',
    APPLY_RECURRING: 'Dauerbuchung anwenden',
    CREATE_BOOKING: 'Neue Buchung vorbereiten',
    MARK_CHECKED: 'Ohne Buchung prüfen',
    NEEDS_MANUAL_REVIEW: 'Manuelle Prüfung'
  }[suggestion.action]

  const complete = async (run: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try {
      await run()
      notify('success', success)
      onChanged()
      onClose()
    } catch (reason: any) {
      notify('error', reason?.message || String(reason))
    } finally {
      setBusy(false)
    }
  }

  const refreshSuggestion = async () => {
    setBusy(true)
    setRefreshing(true)
    try {
      const review = await window.api.ai.bankImports.reviewOpen({ transactionIds: [transaction.id] })
      const nextSuggestion = review.suggestions.find(
        (candidate) => Number(candidate.transactionId) === transaction.id
      )
      if (!nextSuggestion) throw new Error('Die KI hat keinen aktualisierten Vorschlag zurückgegeben.')
      setSuggestion(nextSuggestion as BankAiSuggestion)
      notify('success', 'KI-Vorschlag wurde mit den aktuellen Treffern neu erstellt.')
      onChanged()
    } catch (reason: any) {
      notify('error', reason?.message || String(reason))
    } finally {
      setRefreshing(false)
      setBusy(false)
    }
  }

  const openBookingDraft = () => {
    const candidate = suggestion.bookingCandidate
    if (!candidate) return
    window.dispatchEvent(
      new CustomEvent('ai:open-booking-draft', {
        detail: {
          qa: {
            date: candidate.date,
            type: candidate.type,
            sphere: candidate.sphere,
            primaryClassificationValueId: candidate.primaryClassificationValueId ?? undefined,
            mode: 'GROSS',
            grossAmount: candidate.grossAmount,
            vatRate: candidate.vatRate ?? 0,
            description: candidate.description,
            note: ['Aus KI-Bankimport-Vorschlag vorbereitet.', suggestion.reason].filter(Boolean).join('\n'),
            paymentMethod: candidate.paymentMethod || 'BANK',
            paymentAccountId: candidate.paymentAccountId ?? transaction.paymentAccountId,
            paymentAccountName: transaction.paymentAccountName,
            budgets: (candidate.budgets || []).map((budget) => ({ budgetId: budget.id, amount: budget.amount })),
            earmarksAssigned: (candidate.earmarks || []).map((earmark) => ({ earmarkId: earmark.id, amount: earmark.amount })),
            tags: candidate.tags || [],
            bankTransactionId: transaction.id
          }
        }
      })
    )
    onClose()
  }

  const existing = suggestion.action === 'LINK_EXISTING'
  const newBooking = suggestion.action === 'CREATE_BOOKING'
  const recurring = suggestion.action === 'APPLY_RECURRING'
  const target = existing ? suggestion.matchedVoucher : suggestion.bookingCandidate
  const targetDate = recurring ? suggestion.scheduledDate : target?.date
  const targetAmount = recurring ? transaction.amount : target?.grossAmount
  const amountDifference = targetAmount == null ? null : Math.round((targetAmount - transaction.amount) * 100) / 100
  const confidence = Math.round(suggestion.confidence * 100)
  const strongMatch = (existing || recurring) && confidence >= 80 && !suggestion.warnings.length && (!existing || amountDifference === 0)

  return createPortal(
    <div className="modal-overlay bank-import-overlay" role="dialog" aria-modal="true" aria-labelledby="bank-ai-review-title" onMouseDown={(event) => !busy && event.target === event.currentTarget && onClose()}>
      <div className={`modal bank-ai-suggestion-modal${newBooking ? ' bank-ai-draft-modal' : ''}`}>
        <header className="bank-modal-header bank-ai-review-header">
          <div>
            <h2 id="bank-ai-review-title">{newBooking ? 'Neue Buchung aus Bankbeleg' : existing || recurring ? 'KI-Zuordnungsempfehlung' : 'KI-Prüfung'}</h2>
            <p>Bankbeleg #{transaction.id} · {formatDate(transaction.bookingDate)}</p>
          </div>
          <div className={`bank-ai-confidence${strongMatch ? ' bank-ai-confidence--high' : ''}`}>
            <strong>{newBooking ? 'Entwurf · noch nicht gebucht' : strongMatch ? 'Hohe Übereinstimmung' : actionLabel}</strong>
            <span>{newBooking ? 'KI-Vorschlag zur Erfassung' : `KI-Einschätzung: ${confidence} %`}</span>
          </div>
          <button className="btn ghost" type="button" disabled={busy} onClick={onClose} aria-label="Schließen"><AppIcon icon={IconX} size="control" /></button>
        </header>

        <section className="bank-ai-suggestion-card">
          {refreshing && (
            <div className="bank-ai-refresh-state" role="status">
              <span aria-hidden="true" />
              KI prüft den Bankbeleg mit den aktuellen Treffern …
            </div>
          )}
          <p className="bank-ai-intro">{existing
            ? 'Die KI empfiehlt, diesen Bankbeleg der folgenden bestehenden Buchung zuzuordnen.'
            : newBooking ? 'Die KI schlägt vor, eine neue Buchung zu erstellen. Prüfe und bearbeite den Entwurf; gespeichert wird erst im Buchungsformular.'
            : recurring ? 'Die KI empfiehlt, diesen Bankbeleg mit einer Dauerbuchung zu verbuchen.' : actionLabel}</p>
          <div className={newBooking ? 'bank-ai-draft-group' : 'bank-ai-review-group'}>
          <div className={`bank-ai-comparison${newBooking ? ' bank-ai-draft-layout' : !existing ? ' bank-ai-comparison--no-arrow' : ''}`}>
            <section className="bank-ai-comparison-card">
              <header><h3>{newBooking ? 'Quelle: importierter Bankbeleg' : 'Bankbeleg'}</h3><p>{transaction.direction === 'OUT' ? 'Ausgang vom Konto' : 'Eingang auf dem Konto'}</p></header>
              <dl>
                <div><dt>Datum</dt><dd>{formatDate(transaction.bookingDate)}</dd></div>
                {transaction.valueDate && <div><dt>Wertstellung</dt><dd>{formatDate(transaction.valueDate)}</dd></div>}
                <div><dt>Gegenpartei</dt><dd>{transaction.counterparty || 'Ohne Gegenpartei'}</dd></div>
                <div><dt>Zahlkonto</dt><dd>{transaction.paymentAccountName}</dd></div>
                <div><dt>Verwendungszweck</dt><dd>{transaction.purpose || '–'}</dd></div>
                {transaction.bankReference && <div><dt>Bankreferenz</dt><dd>{transaction.bankReference}</dd></div>}
              </dl>
              <div className="bank-ai-comparison-amount"><span>Betrag</span><strong>{euro.format(transaction.amount)}</strong></div>
            </section>
            {existing && <span className="bank-ai-comparison-arrow" aria-hidden="true">↔</span>}
            <section className="bank-ai-comparison-card">
              <header><h3>{existing ? 'Vorgeschlagene Buchung' : recurring ? 'Dauerbuchung' : newBooking ? 'Entwurf für eine neue Buchung' : 'Prüfergebnis'}</h3>
                <p>{existing ? 'Bereits in der Buchhaltung vorhanden' : recurring ? 'Wird beim Übernehmen gebucht' : newBooking ? 'Diese Buchung wird erst nach deiner Prüfung und dem Speichern angelegt.' : 'Keine Buchung zur Zuordnung vorgeschlagen'}</p></header>
              {(existing || recurring || suggestion.bookingCandidate) ? <>
                <dl>
                  <div><dt>{recurring ? 'Fälligkeit' : 'Datum'}</dt><dd>{formatDate(targetDate)}</dd></div>
                  {existing && <div><dt>Buchungsnummer</dt><dd>{suggestion.voucherNo || `#${suggestion.voucherId}`}</dd></div>}
                  <div><dt>Beschreibung</dt><dd>{recurring ? suggestion.recurringBookingName || 'Ohne Bezeichnung' : target?.description || 'Keine Beschreibung verfügbar'}</dd></div>
                </dl>
                <div className="bank-ai-comparison-amount"><span>{newBooking ? 'Vorgeschlagener Betrag' : recurring ? 'Zu buchender Betrag' : 'Buchungswert'}</span><strong>{targetAmount == null ? 'Nicht verfügbar' : euro.format(targetAmount)}</strong></div>
              </> : <p>{suggestion.action === 'MARK_CHECKED' ? 'Der Bankbeleg soll ohne Buchung als geprüft markiert werden.' : 'Bitte den Bankbeleg und mögliche Buchungen manuell vergleichen.'}</p>}
            </section>
          </div>
          <section className="bank-ai-reasoning">
            <h3>{newBooking ? 'Warum schlägt die KI eine neue Buchung vor?' : existing || recurring ? 'Warum diese Zuordnung?' : 'Begründung der KI'}</h3>
            <p>{suggestion.reason}</p>
            {existing && amountDifference != null && <div className="bank-ai-comparison-facts">
              <div><strong className={amountDifference === 0 ? 'text-success' : 'bank-match-warning'}>{amountDifference === 0 ? 'Beträge stimmen überein' : 'Beträge weichen ab'}</strong>
                <span>{amountDifference === 0 ? `${euro.format(transaction.amount)} = ${euro.format(targetAmount!)}` : `Differenz: ${euro.format(amountDifference)}`}</span></div>
              <div><strong>Datumsvergleich</strong><span>{formatDate(transaction.bookingDate)} ↔ {formatDate(targetDate)}</span></div>
            </div>}
            {!!suggestion.evidence.length && <ul className="bank-ai-evidence">{suggestion.evidence.map((item, index) => <li key={index}>{item}</li>)}</ul>}
          </section>
          </div>
          {suggestion.warnings.length > 0 && (
            <div className="bank-ai-review-warnings"><strong>Bitte beachten</strong><ul className="bank-ai-suggestion-warnings">
              {suggestion.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul></div>
          )}
        </section>

        <footer className="bank-modal-footer">
          <button className="btn" type="button" disabled={busy} onClick={onClose}>Schließen</button>
          <button className="btn" type="button" disabled={busy} onClick={() => void refreshSuggestion()}>
            {refreshing ? 'KI prüft …' : 'KI erneut prüfen'}
          </button>
          {suggestion.action === 'CREATE_BOOKING' && suggestion.bookingCandidate && (
            <button className="btn primary" type="button" disabled={busy} onClick={openBookingDraft}>Entwurf prüfen und bearbeiten</button>
          )}
          {suggestion.action === 'LINK_EXISTING' && suggestion.voucherId && (
            <button className="btn primary" type="button" disabled={busy} onClick={() => void complete(
              () => window.api.bankTransactions.link({ id: transaction.id, voucherId: suggestion.voucherId! }),
              'Bankbeleg wurde der vorgeschlagenen Buchung zugeordnet.'
            )}>Zuordnung übernehmen</button>
          )}
          {suggestion.action === 'APPLY_RECURRING' && suggestion.recurringBookingId && (suggestion.occurrenceId || suggestion.scheduledDate) && (
            <button className="btn primary" type="button" disabled={busy} onClick={() => void complete(
              () => window.api.recurringBookings.book({
                recurringBookingId: suggestion.recurringBookingId!,
                occurrenceId: suggestion.occurrenceId ?? undefined,
                scheduledDate: suggestion.scheduledDate ?? undefined,
                bookingDate: transaction.bookingDate,
                amount: transaction.amount,
                bankTransactionId: transaction.id
              }),
              'Dauerbuchung und Bankbeleg wurden zusammengeführt.'
            )}>Dauerbuchung übernehmen</button>
          )}
          {suggestion.action === 'MARK_CHECKED' && (
            <button className="btn primary" type="button" disabled={busy} onClick={() => void complete(
              () => window.api.bankTransactions.check({ id: transaction.id, note: suggestion.reason }),
              'Bankbeleg wurde als geprüft markiert.'
            )}>Als geprüft markieren</button>
          )}
          {suggestion.action === 'NEEDS_MANUAL_REVIEW' && (
            <button className="btn primary" type="button" disabled={busy} onClick={() => {
              onClose()
              onOpenReview(transaction)
            }}>Bankbeleg manuell prüfen</button>
          )}
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
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [stats, setStats] = useState({ total: 0, open: 0, linked: 0, checked: 0 })
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'ALL' | BankTransaction['status']>('OPEN')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [batchFilter, setBatchFilter] = useState<{ id: number; fileName: string } | null>(null)
  const [importOutcome, setImportOutcome] = useState<ImportOutcome | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyRows, setHistoryRows] = useState<BankImportHistoryEntry[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [remapBatchId, setRemapBatchId] = useState<number | null>(null)
  const [listRefresh, setListRefresh] = useState(0)
  const [sortBy, setSortBy] = useState<
    'status' | 'date' | 'description' | 'account' | 'type' | 'amount'
  >('date')
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC')
  const [showImport, setShowImport] = useState(false)
  const [initialImportFile, setInitialImportFile] = useState<File | null>(null)
  const [selected, setSelected] = useState<BankTransaction | null>(null)
  const [aiSuggestionTransaction, setAiSuggestionTransaction] = useState<BankTransaction | null>(null)
  const [checkTransaction, setCheckTransaction] = useState<BankTransaction | null>(null)
  const [importStatus, setImportStatus] = useState<BankImportStatus | null>(null)
  const [importStatusLoading, setImportStatusLoading] = useState(true)
  const [importStatusFailed, setImportStatusFailed] = useState(false)
  const [reviewingWithAi, setReviewingWithAi] = useState(false)
  useEffect(() => setExpandedId(null), [page, query, status, accountId, from, to, batchFilter])
  const aiReviewInFlight = React.useRef(false)
  const listRequest = React.useRef(0)
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
    const request = ++listRequest.current
    setLoading(true)
    try {
      const result = await window.api.bankTransactions.list({
        status,
        paymentAccountId: accountId || undefined,
        batchId: batchFilter?.id,
        from: from || undefined,
        to: to || undefined,
        q: query || undefined,
        sortBy,
        sortDir,
        page,
        limit
      })
      if (request !== listRequest.current) return
      setRows(result.rows as BankTransaction[])
      setStats(result.stats)
      setTotal(result.total)
    } catch (reason: any) {
      if (request === listRequest.current) notify('error', reason?.message || String(reason))
    } finally {
      if (request === listRequest.current) setLoading(false)
    }
  }, [accountId, batchFilter, from, to, notify, page, query, status, sortBy, sortDir, listRefresh])

  const loadImportStatus = useCallback(async () => {
    setImportStatusLoading(true)
    try {
      const result = await window.api.bankTransactions.importStatus()
      setImportStatus(result as BankImportStatus)
      setImportStatusFailed(false)
    } catch {
      setImportStatus(null)
      setImportStatusFailed(true)
    } finally {
      setImportStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    listRequest.current++
    const timer = window.setTimeout(() => void load(), 180)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    void loadImportStatus()
  }, [loadImportStatus])

  useEffect(() => {
    if (!historyOpen) return
    let active = true
    setHistoryLoading(true)
    setHistoryError(false)
    void window.api.bankTransactions.importHistory({ paymentAccountId: accountId || undefined, page: historyPage, limit: 10 })
      .then(result => {
        if (!active) return
        setHistoryRows(result.rows)
        setHistoryTotal(result.total)
      })
      .catch(() => {
        if (active) { setHistoryRows([]); setHistoryError(true) }
      })
      .finally(() => { if (active) setHistoryLoading(false) })
    return () => { active = false }
  }, [accountId, historyOpen, historyPage, historyRefresh])

  useEffect(() => {
    const refresh = () => {
      void load()
      void loadImportStatus()
    }
    return addDataChangedListener(['bank-imports', 'vouchers'], refresh)
  }, [load, loadImportStatus])

  const bankAccounts = useMemo(
    () => paymentAccounts.filter((account) => account.kind !== 'CASH'),
    [paymentAccounts]
  )
  const pageCount = Math.max(1, Math.ceil(total / limit))
  const historyPageCount = Math.max(1, Math.ceil(historyTotal / 10))
  const selectedAccountHistory = importStatus?.accounts?.find(account => account.id === accountId)
  const selectedAccount = bankAccounts.find(account => account.id === accountId)
  const hasPageFilters = Boolean(batchFilter || query || accountId || from || to)
  const lastBookingDate = parseLocalDate(selectedAccountHistory?.lastBookingDate)
  const previousMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0)
  const olderBankData = selectedAccount?.isActive !== 0 && lastBookingDate != null && lastBookingDate < previousMonthEnd
  const openVisibleIds = rows.filter((row) => row.status === 'OPEN').map((row) => row.id)

  const showImportBatch = (entry: { id: number; fileName: string; paymentAccountId: number }) => {
    setAccountId(entry.paymentAccountId)
    setBatchFilter({ id: entry.id, fileName: entry.fileName })
    setHistoryOpen(false)
    setHistoryPage(1)
    setStatus('ALL')
    setFrom('')
    setTo('')
    setQuery('')
    setPage(1)
  }

  const clearFilters = () => {
    setQuery('')
    setAccountId(null)
    setFrom('')
    setTo('')
    setBatchFilter(null)
    setStatus('ALL')
    setHistoryPage(1)
    setPage(1)
  }

  const reviewVisibleWithAi = async () => {
    if (aiReviewInFlight.current || loading || !openVisibleIds.length) return
    aiReviewInFlight.current = true
    setReviewingWithAi(true)
    notify('info', `KI prüft passende Zuordnungen für ${openVisibleIds.length} offene Bankbelege …`)
    try {
      const result = await window.api.ai.bankImports.reviewOpen({ transactionIds: openVisibleIds })
      const matches = result.suggestions.filter((suggestion) =>
        suggestion.action === 'LINK_EXISTING' || suggestion.action === 'APPLY_RECURRING'
      ).length
      const manual = result.suggestions.filter((suggestion) => suggestion.action === 'NEEDS_MANUAL_REVIEW').length
      notify(manual ? 'info' : 'success', `${result.suggestions.length} Bankbelege geprüft · ${matches} Zuordnungsvorschläge${manual ? ` · ${manual} manuell prüfen` : ''}. Über das KI-Symbol in der Spalte „Zuordnung“ öffnen.`)
      await load()
    } catch (reason: any) {
      notify('error', `KI-Prüfung fehlgeschlagen: ${reason?.message || String(reason)}`)
    } finally {
      aiReviewInFlight.current = false
      setReviewingWithAi(false)
    }
  }

  return (
    <div className="bank-import-container">
      <div className="bank-page-header">
        <h1>Bankimport</h1>
      </div>

      <div className="bank-import-context-toolbar">
        <label className="bank-import-context-account">
          <span>Zahlkonto</span>
          <select className="input" value={accountId ?? ''} onChange={event => {
            setAccountId(event.target.value ? Number(event.target.value) : null)
            setBatchFilter(null)
            setHistoryPage(1)
            setPage(1)
          }}>
            <option value="">Alle Zahlkonten</option>
            {bankAccounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.iban ? ` · ${account.iban}` : ''}{account.isActive === 0 ? ' · Inaktiv' : ''}</option>)}
          </select>
        </label>
        <div className="bank-import-date-range" role="group" aria-label="Buchungsdatum filtern">
          <label><span>Von</span><input className="input" type="date" value={from} max={to || undefined} onChange={event => {
            const value = event.target.value
            setFrom(value)
            if (to && value > to) setTo('')
            setPage(1)
          }} /></label>
          <label><span>Bis</span><input className="input" type="date" value={to} min={from || undefined} onChange={event => {
            const value = event.target.value
            setTo(value)
            if (value && from && value < from) setFrom('')
            setPage(1)
          }} /></label>
        </div>
        <FilterDropdown
          trigger={<><AppIcon icon={IconHistory} size="control" /> Importhistorie</>}
          title="Importhistorie"
          ariaLabel="Importhistorie"
          panelClassName="bank-import-history-dropdown"
          width={560}
          alignRight
          open={historyOpen}
          onOpenChange={setHistoryOpen}
        >
          <div className="bank-import-history-panel">
            <p className="bank-import-history-context">{selectedAccount ? `Importe für ${selectedAccount.name}` : 'Importe aller Zahlkonten'} · {historyTotal} Vorgänge</p>
            {historyLoading ? <p role="status">Importhistorie wird geladen …</p> : historyError ? <p role="alert">Die Importhistorie konnte nicht geladen werden. Bitte erneut öffnen.</p> : historyRows.length ? <div className="bank-import-history-entries">
              {historyRows.map(entry => <div className={`bank-import-history-entry${entry.imported === 0 ? ' bank-import-history-entry--empty' : ''}`} key={entry.id}>
                <div className="bank-import-history-entry-main"><strong title={entry.fileName}>{entry.fileName}</strong><span>{formatDateTime(entry.importedAt)} · {entry.paymentAccountName || 'Zahlkonto'} · {entry.format}</span></div>
                <div className="bank-import-history-entry-details"><span>{entry.imported} neu · {entry.duplicates} Duplikate · {entry.errors} Fehler</span><span>{entry.periodFrom ? `Übernommene Buchungstage: ${formatDate(entry.periodFrom)}${entry.periodTo && entry.periodTo !== entry.periodFrom ? ` – ${formatDate(entry.periodTo)}` : ''}` : 'Keine neuen Buchungen'}</span></div>
                {entry.imported > 0 && <FilterDropdown
                  trigger={<AppIcon icon={IconDotsVertical} size="action" />}
                  title={`Aktionen für ${entry.fileName}`}
                  ariaLabel={`Aktionen für Import ${entry.fileName}`}
                  panelClassName="bank-import-history-actions-panel"
                  alignRight width={238}
                >
                  <div className="bank-import-history-actions">
                    <button type="button" onClick={() => showImportBatch({ id: entry.id, fileName: entry.fileName, paymentAccountId: entry.paymentAccountId })}>Belege anzeigen</button>
                    {entry.format === 'CSV' && <button type="button" onClick={() => { setHistoryOpen(false); setRemapBatchId(entry.id) }}>Zuordnungen aktualisieren</button>}
                  </div>
                </FilterDropdown>}
              </div>)}
            </div> : <p>Für {selectedAccount?.name || 'die Zahlkonten'} liegt noch kein Import vor.</p>}
            {historyTotal > 10 && <div className="bank-import-history-pages"><span>Seite {historyPage} / {historyPageCount}</span><button className="btn" type="button" disabled={historyPage <= 1 || historyLoading} onClick={() => setHistoryPage(page => page - 1)} aria-label="Vorherige Historienseite"><AppIcon icon={IconChevronLeft} size="control" /></button><button className="btn" type="button" disabled={historyPage >= historyPageCount || historyLoading} onClick={() => setHistoryPage(page => page + 1)} aria-label="Nächste Historienseite"><AppIcon icon={IconChevronRight} size="control" /></button></div>}
          </div>
        </FilterDropdown>
      </div>

      {accountId && <div className="bank-import-account-overview" role="status">
        <strong>{selectedAccount?.name || 'Zahlkonto'}</strong>
        {importStatusLoading ? <span>Importstand wird geladen …</span> : importStatusFailed ? <span>Importstand derzeit nicht verfügbar.</span> : <>
          <span>{selectedAccountHistory?.lastImportAt ? `Letzter Import mit Buchungen: ${formatDateTime(selectedAccountHistory.lastImportAt)}` : 'Noch keine Buchungen importiert'}</span>
          <span>Neuester erfasster Umsatz: {formatDate(selectedAccountHistory?.lastBookingDate)}</span>
          {selectedAccountHistory?.lastImportAt && <span>Dabei übernommen: {selectedAccountHistory.lastImportImportedCount} Buchungssätze</span>}
          {olderBankData && <small>Prüfe, ob seitdem weitere Kontoauszüge vorliegen. Auch überlappende Auszüge können auf Duplikate geprüft werden.</small>}
        </>}
      </div>}

      {importOutcome && <div className="bank-import-outcome" role="status">
        <div><strong>Import abgeschlossen: {importOutcome.fileName}</strong><span>{importOutcome.imported} übernommen · {importOutcome.duplicates} Duplikate übersprungen · {importOutcome.errors} fehlerhaft</span></div>
        {importOutcome.imported > 0 && <button className="btn primary" type="button" onClick={() => showImportBatch({ id: importOutcome.batchId, fileName: importOutcome.fileName, paymentAccountId: importOutcome.paymentAccountId })}>{importOutcome.imported === 1 ? 'Diesen Beleg anzeigen' : `Diese ${importOutcome.imported} Belege anzeigen`}</button>}
        <button className="btn ghost" type="button" aria-label="Importzusammenfassung schließen" onClick={() => setImportOutcome(null)}><AppIcon icon={IconX} size="control" /></button>
      </div>}

      <div className="bank-overview-row">
        <div className="bank-status-tabs" role="group" aria-label="Bankbelegstatus">
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
            aria-pressed={status === key}
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
                <AppIcon icon={IconX} size="control" />
              </button>
            )}
          </div>
          <div className="journal-filter-toolbar bank-import-filter-toolbar">
            <button
              className="btn ghost bank-ai-review-button"
              type="button"
              disabled={loading || reviewingWithAi || !openVisibleIds.length}
              onClick={() => void reviewVisibleWithAi()}
              title={`KI prüft die ${openVisibleIds.length} offenen Bankbelege auf dieser Seite unter Berücksichtigung der aktuellen Filter. Zuordnungen werden als Vorschläge gespeichert.`}
              aria-label="Sichtbare offene Bankbelege mit KI prüfen"
              aria-busy={reviewingWithAi}
            >
              <AppIcon icon={IconSparkles} size="control" />
              {reviewingWithAi ? 'KI prüft …' : 'KI prüfen'}
            </button>
            <BankImportActionDropdown
              onOpenImport={(file) => {
                setInitialImportFile(file || null)
                setShowImport(true)
              }}
            />
          </div>
        </div>
      </div>

      <div className="bank-list-caption">
        <span>{total} Bankbelege · {status === 'ALL' ? 'Alle Status' : statusLabel(status)}</span>
        <span>Details über + öffnen</span>
        {hasPageFilters && <div className="bank-import-filter-chips" aria-label="Aktive Bankfilter">
          {batchFilter && <span className="chip bank-import-filter-chip" title={`Import #${batchFilter.id}: ${batchFilter.fileName}`}><span>Import #{batchFilter.id}: {batchFilter.fileName}</span><button className="chip-x" type="button" aria-label="Importfilter entfernen" onClick={() => { setBatchFilter(null); setPage(1) }}><AppIcon icon={IconX} size="inline" /></button></span>}
          {accountId && <span className="chip bank-import-filter-chip"><span>Zahlkonto: {selectedAccount?.name || accountId}</span><button className="chip-x" type="button" aria-label="Zahlkontofilter entfernen" onClick={() => { setAccountId(null); setBatchFilter(null); setHistoryPage(1); setPage(1) }}><AppIcon icon={IconX} size="inline" /></button></span>}
          {from && <span className="chip bank-import-filter-chip"><span>Von: {formatDate(from)}</span><button className="chip-x" type="button" aria-label="Von-Filter entfernen" onClick={() => { setFrom(''); setPage(1) }}><AppIcon icon={IconX} size="inline" /></button></span>}
          {to && <span className="chip bank-import-filter-chip"><span>Bis: {formatDate(to)}</span><button className="chip-x" type="button" aria-label="Bis-Filter entfernen" onClick={() => { setTo(''); setPage(1) }}><AppIcon icon={IconX} size="inline" /></button></span>}
          {query && <span className="chip bank-import-filter-chip"><span>Suche: {query}</span><button className="chip-x" type="button" aria-label="Suchfilter entfernen" onClick={() => { setQuery(''); setPage(1) }}><AppIcon icon={IconX} size="inline" /></button></span>}
          <button className="btn ghost bank-import-clear-filters" type="button" title="Alle Filter zurücksetzen" aria-label="Alle Filter zurücksetzen" onClick={clearFilters}><AppIcon icon={IconX} size="control" /></button>
        </div>}
      </div>
      <div className="bank-table-card bank-master-table" role="region" aria-label="Bankbelege" tabIndex={0}>
        <table className="bank-table" aria-label="Importierte Bankbelege" aria-busy={loading}>
          <colgroup>
            <col className="bank-column-details" />
            <col className="bank-column-status" />
            <col className="bank-column-date" />
            <col />
            <col className="bank-column-assignment" />
            <col className="bank-column-account" />
            <col className="bank-column-type" />
            <col className="bank-column-amount" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col"><span className="helper">Details</span></th>
              <th className="sortable" aria-sort={sortBy === 'status' ? (sortDir === 'ASC' ? 'ascending' : 'descending') : 'none'}><button className="bank-sort-button" onClick={() => toggleSort('status')}> Status {renderSort('status')}</button></th>
              <th className="sortable" aria-sort={sortBy === 'date' ? (sortDir === 'ASC' ? 'ascending' : 'descending') : 'none'}><button className="bank-sort-button" onClick={() => toggleSort('date')}> Datum {renderSort('date')}</button></th>
              <th className="sortable" aria-sort={sortBy === 'description' ? (sortDir === 'ASC' ? 'ascending' : 'descending') : 'none'}><button className="bank-sort-button" onClick={() => toggleSort('description')}> Beschreibung {renderSort('description')}</button></th>
              <th>Zuordnung</th>
              <th className="sortable" aria-sort={sortBy === 'account' ? (sortDir === 'ASC' ? 'ascending' : 'descending') : 'none'}><button className="bank-sort-button" onClick={() => toggleSort('account')}> Zahlkonto {renderSort('account')}</button></th>
              <th className="sortable" aria-sort={sortBy === 'type' ? (sortDir === 'ASC' ? 'ascending' : 'descending') : 'none'}><button className="bank-sort-button" onClick={() => toggleSort('type')}> Typ {renderSort('type')}</button></th>
              <th className="number sortable" aria-sort={sortBy === 'amount' ? (sortDir === 'ASC' ? 'ascending' : 'descending') : 'none'}><button className="bank-sort-button" onClick={() => toggleSort('amount')}> Summe {renderSort('amount')}</button></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <React.Fragment key={row.id}>
              <tr className={expandedId === row.id ? 'bank-row-expanded' : undefined}>
                <td><button className="btn ghost bank-expand" aria-expanded={expandedId === row.id} aria-controls={`bank-inline-${row.id}`} aria-label={`Bankbeleg ${row.id}: Details ${expandedId === row.id ? 'schließen' : 'anzeigen'}`} onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}>{expandedId === row.id ? '−' : '+'}</button></td>
                <td>
                  <span
                    className={`bank-status bank-status--${row.status.toLowerCase()}`}
                    title={statusLabel(row.status)}
                  >
                    <i />
                    {statusLabel(row.status)}
                  </span>
                </td>
                <td><span className="bank-import-row-date"><strong>{Number(row.bookingDate.slice(8, 10)) || '–'}</strong><span>{new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(parseLocalDate(row.bookingDate) || new Date())}<small>{row.bookingDate.slice(0, 4)}</small></span></span></td>
                <td>
                  <div className="bank-description-cell bank-import-description-hierarchy">
                    <span className={`bank-import-direction-symbol bank-import-direction-symbol--${row.direction.toLowerCase()}`} aria-hidden="true"><AppIcon icon={row.direction === 'OUT' ? IconArrowUp : IconArrowDown} size="action" /></span>
                    <div><button className="bank-description-button" onClick={() => setExpandedId(expandedId === row.id ? null : row.id)} aria-expanded={expandedId === row.id}>{row.counterparty || row.purpose || 'Ohne Beschreibung'}</button>
                      {row.counterparty && row.purpose && <span className="bank-import-purpose-subline" title={row.purpose}>{row.purpose}</span>}
                    </div>
                  </div>
                </td>
                <td>
                  {(() => {
                    const match = matchScorePresentation(row.matchScore)
                    return (
                      <div className="bank-assignment-cell">
                        {row.status === 'OPEN' && Number(row.possibleDuplicateCount) > 0 && (
                          <button
                            className="bank-duplicate-indicator"
                            type="button"
                            title="Mögliche Doppelbuchung: passende Buchung bereits zugeordnet. Zuordnung prüfen."
                            aria-label="Mögliche Doppelbuchung – Zuordnung prüfen"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelected(row)
                            }}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <AppIcon icon={IconAlertTriangle} size="action" />
                          </button>
                        )}
                        {row.aiSuggestion && (
                          <button
                            className="bank-ai-suggestion-trigger"
                            type="button"
                            title="KI-Vorschlag öffnen"
                            aria-label="KI-Vorschlag öffnen"
                            onClick={(event) => {
                              event.stopPropagation()
                              setAiSuggestionTransaction(row)
                            }}
                          >
                            <span aria-hidden="true">✦</span>
                          </button>
                        )}
                        <span
                          className={`bank-match-indicator bank-match-indicator--${match.level}`}
                          title={match.level === 'none' ? match.label : `${match.label}: ${Math.round(Number(row.matchScore))} von 100 Punkten`}
                          aria-label={match.label}
                        >
                          {match.stars}
                        </span>
                      </div>
                    )
                  })()}
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
                    {row.direction === 'IN' ? 'Eingang' : 'Ausgang'}
                  </span>
                </td>
                <td className={`number bank-amount bank-amount--${row.direction.toLowerCase()}`}>
                  {row.direction === 'OUT' ? '−' : '+'}
                  {euro.format(row.amount)}
                </td>
              </tr>
              {expandedId === row.id && <tr id={`bank-inline-${row.id}`} className="bank-inline-detail"><td className="bank-inline-indent" aria-hidden="true" /><td colSpan={7}><div className="bank-inline-panel">
                <div className="bank-inline-heading"><div><strong>Bankbeleg #{row.id}</strong><span>{row.sourceFileName}</span></div><button className="btn primary" onClick={() => setSelected(row)}>{row.status === 'OPEN' ? 'Zuordnung prüfen' : 'Beleg öffnen'}</button></div>
                <dl className="bank-inline-facts"><div><dt>Verwendungszweck</dt><dd>{row.purpose || '—'}</dd></div><div><dt>Gegenpartei / IBAN</dt><dd>{row.counterparty || '—'}<br />{row.counterpartyIban || 'Keine IBAN hinterlegt'}</dd></div><div><dt>Wertstellung</dt><dd>{formatDate(row.valueDate || row.bookingDate)}</dd></div><div><dt>Referenz</dt><dd>{row.bankReference || row.endToEndId || '—'}</dd></div></dl>
                <div className="bank-inline-assignment"><strong>Zuordnung</strong>{row.voucherId ? <button className="btn" onClick={() => onOpenVoucher(row.voucherId!, row.voucherNo, row.bookingDate)}>{row.voucherNo || `Buchung #${row.voucherId}`}{row.voucherDescription ? ` · ${row.voucherDescription}` : ''}</button> : <span>{row.status === 'CHECKED' ? row.checkedNote || 'Ohne Buchung geprüft' : 'Noch keiner Buchung zugeordnet'}</span>}</div>
                {Number(row.possibleDuplicateCount) > 0 && <p className="bank-inline-warning">Mögliche Doppelbuchung: {row.possibleDuplicateCount} bereits zugeordnete Treffer. Bitte Zuordnung prüfen.</p>}
                {row.aiSuggestion && <div className="bank-inline-ai"><p><strong>KI-Vorschlag</strong> · {row.aiSuggestion.reason}</p><button className="btn" onClick={() => setAiSuggestionTransaction(row)}>Vorschlag prüfen</button></div>}
              </div></td></tr>}
              </React.Fragment>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="bank-empty">Keine Bankbelege für diesen Filter gefunden.</div>
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={8}>
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
            <AppIcon icon={IconChevronLeft} size="control" />
          </button>
          <button
            className="btn"
            disabled={page >= pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            <AppIcon icon={IconChevronRight} size="control" />
          </button>
        </div>
      </footer>

      {showImport && (
        <BankImportModal
          accounts={paymentAccounts}
          initialFile={initialImportFile}
          initialAccountId={accountId}
          notify={notify}
          onClose={() => {
            setShowImport(false)
            setInitialImportFile(null)
          }}
          onImported={(result, context) => {
            setImportOutcome({ batchId: result.batchId, paymentAccountId: context.paymentAccountId, fileName: context.fileName,
              imported: result.imported, duplicates: result.duplicates, errors: result.errors.length })
            setAccountId(context.paymentAccountId)
            setBatchFilter(null)
            setPage(1)
            setHistoryPage(1)
            setHistoryRefresh(value => value + 1)
            setListRefresh(value => value + 1)
            void loadImportStatus()
          }}
        />
      )}
      {remapBatchId != null && <BankImportRemapDialog batchId={remapBatchId} onClose={() => setRemapBatchId(null)} onApplied={() => { setListRefresh(value => value + 1); setHistoryRefresh(value => value + 1) }} notify={notify} />}
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
      {aiSuggestionTransaction?.aiSuggestion && (
        <BankAiSuggestionModal
          transaction={aiSuggestionTransaction}
          suggestion={aiSuggestionTransaction.aiSuggestion}
          notify={notify}
          onClose={() => setAiSuggestionTransaction(null)}
          onChanged={() => {
            dispatchDataChanged(['bank-imports', 'vouchers', 'recurring-bookings'])
            void load()
          }}
          onOpenReview={(transaction) => setSelected(transaction)}
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
