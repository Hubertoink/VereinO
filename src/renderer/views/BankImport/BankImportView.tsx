import { IconArrowDown, IconArrowUp, IconBuildingBank, IconCalendar, IconFileDescription, IconInfoCircle, IconMessage, IconPaperclip, IconUser } from '@tabler/icons-react'
import './bankReview.css'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconAlertTriangle, IconCheck, IconChevronLeft, IconChevronRight, IconDotsVertical, IconExternalLink, IconFileUpload, IconFilter, IconHistory, IconLayoutGrid, IconLink, IconPlus, IconSparkles, IconX } from '@tabler/icons-react'
import AppIcon from '../../components/common/AppIcon'
import ReimbursementsDialog from '../reimbursements/ReimbursementsDialog'
import FilterDropdown from '../../components/dropdowns/FilterDropdown'
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

function BankAccountFilterDropdown({
  accounts,
  value,
  onApply
}: {
  accounts: PaymentAccount[]
  value: number | null
  onApply: (value: number | null) => void
}) {
  const closeRef = React.useRef<(() => void) | null>(null)
  const [draftValue, setDraftValue] = useState<number | null>(value)

  useEffect(() => {
    setDraftValue(value)
  }, [value])

  const apply = () => {
    onApply(draftValue)
    closeRef.current?.()
  }

  const reset = () => {
    setDraftValue(null)
    onApply(null)
  }

  return (
    <FilterDropdown
      trigger={<AppIcon icon={IconFilter} size="action" />}
      title="Zahlkonto filtern"
      hasActiveFilters={value != null}
      alignRight
      width={340}
      ariaLabel="Nach Zahlkonto filtern"
      buttonTitle="Nach Zahlkonto filtern"
      colorVariant="filter"
      closeRef={closeRef}
    >
      <div className="filter-dropdown__field">
        <label className="filter-dropdown__label">Zahlkonto</label>
        <div className="bank-account-badge-list" role="listbox" aria-label="Zahlkonto auswählen">
          <button
            type="button"
            className={`bank-account-filter-badge ${draftValue == null ? 'is-selected' : ''}`}
            onClick={() => setDraftValue(null)}
            role="option"
            aria-selected={draftValue == null}
          >
            Alle Zahlkonten
          </button>
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              className={`bank-account-filter-badge ${draftValue === account.id ? 'is-selected' : ''}`}
              style={{ color: account.color || undefined }}
              onClick={() => setDraftValue(account.id)}
              role="option"
              aria-selected={draftValue === account.id}
            >
              <span
                className="bank-account-filter-badge__dot"
                style={{ background: account.color || 'var(--accent)' }}
                aria-hidden="true"
              />
              {account.name}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-dropdown__actions">
        <button className="btn" type="button" onClick={reset}>
          Zurücksetzen
        </button>
        <div className="filter-dropdown__actions-right">
          <button className="btn primary" type="button" onClick={apply}>
            Übernehmen
          </button>
        </div>
      </div>
    </FilterDropdown>
  )
}

function BankImportHistoryDropdown({ status }: { status: BankImportStatus | null }) {
  const recentImports = status?.recentImports || []
  const periodLabel = (entry: NonNullable<BankImportStatus['recentImports']>[number]) => {
    if (!entry.periodFrom) return 'Kein neuer Buchungstag'
    const from = formatDate(entry.periodFrom)
    const to = formatDate(entry.periodTo || entry.periodFrom)
    return from === to ? from : `${from} – ${to}`
  }

  return (
    <FilterDropdown
      trigger={<AppIcon icon={IconHistory} size="action" />}
      title="Importhistorie"
      alignRight
      width={390}
      ariaLabel="Importhistorie anzeigen"
      buttonTitle="Importhistorie"
      colorVariant="time"
    >
      <div className="bank-history-list">
        {recentImports.map((entry) => (
          <div className="bank-history-item" key={entry.id}>
            <div className="bank-history-item__main">
              <strong title={entry.fileName}>{entry.fileName}</strong>
              <span>
                {formatDateTime(entry.importedAt)} · {periodLabel(entry)}
              </span>
            </div>
            <span className="bank-history-item__account" style={{ color: entry.paymentAccountColor || undefined }}>
              {entry.paymentAccountName || 'Zahlkonto'}
            </span>
            <div className="bank-history-item__stats">
              <span>{entry.imported} neu</span>
              {entry.duplicates > 0 && <span>{entry.duplicates} Duplikat(e)</span>}
              {entry.errors > 0 && <span>{entry.errors} Fehler</span>}
            </div>
          </div>
        ))}
        {recentImports.length === 0 && status?.lastImportAt && (
          <div className="bank-history-empty">
            Dateiname wird bei zukünftigen Importen in dieser Historie angezeigt.
          </div>
        )}
        {recentImports.length === 0 && !status?.lastImportAt && (
          <div className="bank-history-empty">Noch kein Bankimport vorhanden.</div>
        )}
      </div>
    </FilterDropdown>
  )
}

function BankImportActionDropdown({ onOpenImport }: { onOpenImport: (file?: File) => void }) {
  const closeRef = React.useRef<(() => void) | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState('')

  const selectFile = (fileList: FileList | null) => {
    const nextFile = fileList?.[0]
    if (!nextFile) return
    if (!/\.(xml|csv)$/i.test(nextFile.name)) {
      setError('Bitte eine CAMT-XML- oder CSV-Datei auswählen.')
      return
    }
    setError('')
    closeRef.current?.()
    onOpenImport(nextFile)
  }

  return (
    <FilterDropdown
      trigger={<AppIcon icon={IconPlus} size="action" />}
      title="Import"
      alignRight
      width={320}
      ariaLabel="Bankdaten importieren"
      buttonTitle="Import"
      colorVariant="action"
      closeRef={closeRef}
    >
      <div className="bank-import-action-dropdown">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.csv,text/csv,application/xml,text/xml"
          hidden
          onChange={(event) => selectFile(event.target.files)}
        />
        <button
          className={`bank-import-action-dropzone ${dragActive ? 'is-dragging' : ''}`}
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault()
            setDragActive(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault()
            if (event.currentTarget === event.target) setDragActive(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragActive(false)
            selectFile(event.dataTransfer.files)
          }}
        >
          <span className="bank-import-action-dropzone__icon" aria-hidden="true"><AppIcon icon={IconFileUpload} size="action" /></span>
          <strong>Bankdatei hier ablegen</strong>
          <span>oder Datei auswählen</span>
          <small>CAMT-XML oder CSV</small>
          {error && <span className="bank-import-action-dropzone__error">{error}</span>}
        </button>
      </div>
    </FilterDropdown>
  )
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
  onClose,
  onImported,
  notify
}: {
  accounts: PaymentAccount[]
  initialFile?: File | null
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
  const [additionalImportRows, setAdditionalImportRows] = useState<number[]>([])
  const previewRequest = useRef(0)
  const [aiAvailable, setAiAvailable] = useState(false)
  const [reviewWithAi, setReviewWithAi] = useState(false)

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
    const request = ++previewRequest.current
    setBusy(true)
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

  useEffect(() => {
    if (!initialFile) return
    void chooseFile(initialFile)
  }, [initialFile])

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
        additionalImportSourceRows: additionalImportRows,
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
      onImported()
      // Only ask again for conflicts that were not already reviewed and skipped.
      const unexpectedDuplicates = result.duplicateRows.filter(row =>
        additionalImportRows.includes(row.sourceRow) || !(preview?.duplicateRows || []).some(known =>
          known.sourceRow === row.sourceRow && known.existing.id === row.existing.id && known.duplicateBy === row.duplicateBy
        )
      )
      if (unexpectedDuplicates.length || result.errors.length) {
        setCommitResult({ ...result, duplicateRows: unexpectedDuplicates })
        setSelectedDuplicateRows([])
      } else {
        onClose()
      }
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

  const setMap = (key: keyof CsvMapping, value: string | null) => {
    const nextMapping = { ...mapping, [key]: value }
    setMapping(nextMapping)
    if (file && fileBytes) void loadPreview(file, fileBytes, nextMapping)
  }
  const previewDuplicates = preview?.duplicateRows ?? []
  const importCount = (preview?.summary.valid ?? 0) - previewDuplicates.length + additionalImportRows.length
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
          <button className="btn ghost" onClick={onClose} aria-label="Schließen"><AppIcon icon={IconX} size="control" /></button>
        </header>

        <div className="bank-import-scroll">
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
                  if (file && fileBytes) void loadPreview(file, fileBytes, mapping, nextValue)
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

            {aiAvailable && (
              <label className="bank-import-ai-option">
                <input
                  type="checkbox"
                  checked={reviewWithAi}
                  onChange={(event) => setReviewWithAi(event.target.checked)}
                />
                <span>
                  <strong>KI-Vorschläge nach dem Import erstellen</strong>
                  <small>Nur neue, nicht doppelte Bankbelege werden geprüft.</small>
                </span>
              </label>
            )}

            {preview.format === 'CSV' && (
              <section className="bank-mapping-card">
                <div className="bank-section-title">
                  <strong>Spaltenzuordnung</strong>
                  <span className="helper" role="status">{busy ? 'Vorschau wird aktualisiert …' : 'Vorschau aktualisiert sich automatisch'}</span>
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
                  <summary className="btn btn-with-icon"><AppIcon icon={IconLayoutGrid} size="control" />Weitere Spalten</summary>
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

            {preview.warnings?.map((warning) => <p className="bank-import-warning" role="alert" key={warning}><AppIcon icon={IconAlertTriangle} size="action" /> {warning}</p>)}
            {!paymentAccountId && <p className="helper">Wähle das Zahlkonto, um vorhandene Bankbelege auf Duplikate zu prüfen.</p>}
            {previewDuplicates.length > 0 && <section className="bank-import-duplicates" aria-label="Duplikate vor dem Import prüfen">
              <h3><AppIcon icon={IconAlertTriangle} size="action" /> {previewDuplicates.length} vorhandene oder möglicherweise doppelte Umsätze</h3>
              <p>Diese Zeilen werden zunächst übersprungen. Vergleiche die Daten und wähle nur zusätzliche, tatsächlich erfolgte Zahlungen aus.</p>
              <div className="bank-duplicate-table-wrap">
                <table className="bank-table bank-duplicate-table" aria-label="Vergleich möglicher Duplikate">
                  <thead><tr><th>Zeile / Prüfung</th><th>Aus der Importdatei</th><th>Bereits vorhandener Bankbeleg</th><th>Zusätzlich<br />importieren</th></tr></thead>
                  <tbody>{previewDuplicates.map((duplicate) => <tr key={duplicate.sourceRow} className={additionalImportRows.includes(duplicate.sourceRow) ? 'is-selected' : ''}>
                    <td><strong>{duplicate.sourceRow}</strong><small>{duplicateReasonLabel(duplicate.duplicateBy)}</small></td>
                    <td><div className="bank-duplicate-table__numbers"><span>{formatDate(duplicate.bookingDate)}</span><strong>{duplicate.direction === 'OUT' ? '−' : '+'}{euro.format(duplicate.amount)}</strong></div>{duplicate.counterparty && <span className="bank-duplicate-table__party">{duplicate.counterparty}</span>}<span>{duplicate.purpose || 'Ohne Verwendungszweck'}</span></td>
                    <td><div className="bank-duplicate-table__numbers"><span>{formatDate(duplicate.existing.bookingDate)}</span><strong>{duplicate.existing.direction === 'OUT' ? '−' : '+'}{euro.format(duplicate.existing.amount)}</strong></div>{duplicate.existing.counterparty && <span className="bank-duplicate-table__party">{duplicate.existing.counterparty}</span>}<span>{duplicate.existing.purpose || 'Ohne Verwendungszweck'}</span><small>Bankbeleg #{duplicate.existing.id} · {duplicate.existing.paymentAccountName}</small></td>
                    <td className="bank-duplicate-table__choice"><input type="checkbox" aria-label={`Als zusätzlichen Umsatz importieren: Zeile ${duplicate.sourceRow}`} title="Nur auswählen, wenn es sich um eine weitere, tatsächlich erfolgte Zahlung handelt." disabled={busy} checked={additionalImportRows.includes(duplicate.sourceRow)} onChange={(event) => setAdditionalImportRows((current) => event.target.checked ? [...current, duplicate.sourceRow] : current.filter((row) => row !== duplicate.sourceRow))} /></td>
                  </tr>)}</tbody>
                </table>
              </div>
            </section>}
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
                  {preview.rows.map((row) => (
                    <tr key={row.sourceRow} className={row.errors.length ? 'bank-row-error' : ''}>
                      <td>{row.sourceRow}</td>
                      <td>{formatDate(row.bookingDate)}</td>
                      <td>{[row.counterparty, row.purpose].filter(Boolean).join(' - ') || '–'}</td>
                      <td>{row.direction}</td>
                      <td className="number">{euro.format(row.amount)}</td>
                      <td>{row.errors.join(' ') || (previewDuplicates.some((duplicate) => duplicate.sourceRow === row.sourceRow)
                        ? <span className="bank-import-warning"><AppIcon icon={IconAlertTriangle} size="action" /> {additionalImportRows.includes(row.sourceRow) ? 'Zusätzlich importieren' : 'Duplikatprüfung · wird übersprungen'}</span>
                        : paymentAccountId ? 'Neu' : 'Zahlkonto für Prüfung wählen')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        </div>
        <footer className="bank-modal-footer">
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="btn primary"
            disabled={busy || !preview || preview.summary.valid === 0}
            onClick={() => void commit()}
          >
            {busy ? 'Bitte warten …' : importCount === 0 && previewDuplicates.length ? 'Ohne neue Bankbelege abschließen' : `${importCount} Beleg(e) importieren`}
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
                        onClick={() => {
                          setActionMenuOpen(false)
                          onCreateBooking(transaction, duplicateReviewed ? alreadyLinked.map((match) => match.id) : [])
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
  const [initialImportFile, setInitialImportFile] = useState<File | null>(null)
  const [selected, setSelected] = useState<BankTransaction | null>(null)
  const [aiSuggestionTransaction, setAiSuggestionTransaction] = useState<BankTransaction | null>(null)
  const [checkTransaction, setCheckTransaction] = useState<BankTransaction | null>(null)
  const [importStatus, setImportStatus] = useState<BankImportStatus | null>(null)
  const [reviewingWithAi, setReviewingWithAi] = useState(false)
  const aiReviewInFlight = React.useRef(false)
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
  const pageCount = Math.max(1, Math.ceil(total / limit))
  const importReminder = useMemo(() => getBankImportReminder(importStatus), [importStatus])
  const openVisibleIds = rows.filter((row) => row.status === 'OPEN').map((row) => row.id)

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

      <div className="bank-overview-row">
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
            <BankImportHistoryDropdown status={importStatus} />
            <BankAccountFilterDropdown
              accounts={activeAccounts}
              value={accountId}
              onApply={(nextAccountId) => {
                setAccountId(nextAccountId)
                setPage(1)
              }}
            />
            <div className="filter-divider" />
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

      {importReminder && (
        <div className="helper bank-page-summary">
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
        </div>
      )}

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
              <th>Zuordnung</th>
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
                <td colSpan={7}>
                  <div className="bank-empty">Keine Bankbelege für diesen Filter gefunden.</div>
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7}>
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
          notify={notify}
          onClose={() => {
            setShowImport(false)
            setInitialImportFile(null)
          }}
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
