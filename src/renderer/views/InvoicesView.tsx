import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from '../context/useToast'
import ModalHeader from '../components/ModalHeader'
import LoadingState from '../components/LoadingState'
import ColumnSelectDropdown from '../components/dropdowns/ColumnSelectDropdown'
import InvoiceFilterDropdown from '../components/dropdowns/InvoiceFilterDropdown'
import { encodeFilesForUpload } from '../utils/fileEncoding'
import { addDataChangedListener, dispatchDataChanged } from '../utils/refresh'
import InvoiceDetailModal from './invoicesShared/InvoiceDetailModal'
import InvoiceFormModal from './invoicesShared/InvoiceFormModal'
import InvoiceActionMenu from './invoicesShared/InvoiceActionMenu'
import LocalInvoiceScanModal, { type LocalInvoiceScanResult } from '../components/modals/LocalInvoiceScanModal'
import type {
  EditInvoiceFile,
  InvoiceBudgetAssignment,
  InvoiceBudgetOption,
  InvoiceDetail,
  InvoiceDraft,
  InvoiceEarmarkAssignment,
  InvoiceEarmarkOption,
  InvoiceFormState,
  InvoicePaymentAccountOption,
  InvoiceListRow,
  InvoiceStatus,
  InvoiceTagDef
} from './invoicesShared/types'

function contrastText(bg?: string | null) {
  if (!bg) return '#000'
  const m = /^#?([0-9a-fA-F]{6})$/.exec((bg || '').trim())
  if (!m) return '#000'
  const hex = m[1]
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#000' : '#fff'
}

type PageShortcutAction = {
  id: string
  key: string
  label: string
  action: () => void
}

interface InvoicesViewProps {
  registerPageShortcuts?: (shortcuts: PageShortcutAction[]) => void
}

function firstBudgetId(budgets: InvoiceBudgetAssignment[]) {
  return typeof budgets[0]?.budgetId === 'number' && budgets[0].budgetId > 0 ? budgets[0].budgetId : ''
}

function firstEarmarkId(earmarks: InvoiceEarmarkAssignment[]) {
  return typeof earmarks[0]?.earmarkId === 'number' && earmarks[0].earmarkId > 0 ? earmarks[0].earmarkId : ''
}

function parseScannedAmount(value: string) {
  const clean = String(value || '').replace(/[^0-9,.-]/g, '')
  const decimalIndex = Math.max(clean.lastIndexOf(','), clean.lastIndexOf('.'))
  const normalized = decimalIndex >= 0
    ? `${clean.slice(0, decimalIndex).replace(/[.,-]/g, '')}.${clean.slice(decimalIndex + 1).replace(/[^0-9]/g, '')}`
    : clean.replace(/[^0-9-]/g, '')
  const amount = Number(normalized)
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null
}

function normalizeInvoiceDraft(row?: Partial<InvoiceListRow & InvoiceDetail>): InvoiceDraft {
  const budgets = Array.isArray(row?.budgets) && row.budgets.length
    ? row.budgets.map((item) => ({ budgetId: Number(item.budgetId || 0), amount: Number(item.amount || 0) }))
    : typeof row?.budgetId === 'number'
      ? [{ budgetId: row.budgetId, amount: Number(row?.grossAmount || 0) }]
      : []
  const earmarks = Array.isArray(row?.earmarks) && row.earmarks.length
    ? row.earmarks.map((item) => ({ earmarkId: Number(item.earmarkId || 0), amount: Number(item.amount || 0) }))
    : typeof row?.earmarkId === 'number'
      ? [{ earmarkId: row.earmarkId, amount: Number(row?.grossAmount || 0) }]
      : []

  return {
    id: row?.id,
    date: row?.date || new Date().toISOString().slice(0, 10),
    dueDate: row?.dueDate ?? null,
    invoiceNo: row?.invoiceNo ?? '',
    party: row?.party ?? '',
    partyId: row?.partyId ?? null,
    description: row?.description ?? '',
    note: row?.note ?? '',
    grossAmount: row?.grossAmount != null ? String(row.grossAmount) : '',
    paymentMethod: row?.paymentMethod === 'BAR' || row?.paymentMethod === 'BANK' ? row.paymentMethod : '',
    paymentAccountId: typeof row?.paymentAccountId === 'number' ? row.paymentAccountId : '',
    sphere: row?.sphere ?? 'IDEELL',
    earmarkId: firstEarmarkId(earmarks),
    budgetId: firstBudgetId(budgets),
    budgets,
    earmarks,
    autoPost: !!(row?.autoPost ?? true),
    voucherType: row?.voucherType ?? 'OUT',
    tags: Array.isArray(row?.tags) ? row.tags : []
  }
}

export default function InvoicesView({ registerPageShortcuts }: InvoicesViewProps = {}) {
  const { notify } = useToast()

  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'ALL' | 'OPEN' | 'PARTIAL' | 'PAID'>('ALL')
  const [sphere, setSphere] = useState<'' | 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'>('')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [budgetId, setBudgetId] = useState<number | ''>('')
  const [tag, setTag] = useState('')
  const [limit, setLimit] = useState(20)
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<{ count: number; gross: number; paid: number; remaining: number; grossIn: number; grossOut: number } | null>(null)
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>(() => { try { return ((localStorage.getItem('invoices.sort') as 'ASC' | 'DESC') || 'ASC') } catch { return 'ASC' } })
  const [sortBy, setSortBy] = useState<'date' | 'due' | 'amount' | 'status'>(() => { try { return ((localStorage.getItem('invoices.sortBy') as 'date' | 'due' | 'amount' | 'status') || 'due') } catch { return 'due' } })
  const [yearsAvail, setYearsAvail] = useState<number[]>([])

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<InvoiceListRow[]>([])
  const [error, setError] = useState('')
  const [tags, setTags] = useState<InvoiceTagDef[]>([])
  const [budgets, setBudgets] = useState<InvoiceBudgetOption[]>([])
  const [earmarks, setEarmarks] = useState<InvoiceEarmarkOption[]>([])
  const [paymentAccounts, setPaymentAccounts] = useState<InvoicePaymentAccountOption[]>([])
  const [flashId, setFlashId] = useState<number | null>(null)

  const [colPrefs, setColPrefs] = useState<{ showTags: boolean; showBezahlt: boolean; showRest: boolean; showAttachments: boolean }>(() => {
    try {
      const raw = localStorage.getItem('invoices.columns')
      if (raw) {
        const parsed = JSON.parse(raw)
        return {
          showTags: parsed.showTags ?? true,
          showBezahlt: parsed.showBezahlt ?? true,
          showRest: parsed.showRest ?? true,
          showAttachments: parsed.showAttachments ?? true
        }
      }
    } catch {}
    return { showTags: true, showBezahlt: true, showRest: true, showAttachments: true }
  })

  useEffect(() => {
    try { localStorage.setItem('invoices.columns', JSON.stringify(colPrefs)) } catch {}
  }, [colPrefs])

  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const dateFmtPref = useMemo(() => { try { return (localStorage.getItem('ui.dateFmt') as 'ISO' | 'PRETTY' | 'DOT') || 'ISO' } catch { return 'ISO' } }, [])
  const fmtDateLocal = useMemo(() => {
    const pretty = (s?: string) => {
      if (!s) return ''
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '')
      if (!m) return s || ''
      const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
      const mon = dt.toLocaleString('de-DE', { month: 'short' }).replace('.', '')
      return `${m[3]} ${mon} ${m[1]}`
    }
    const dot = (s?: string) => {
      if (!s) return ''
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '')
      if (!m) return s || ''
      return `${m[3]}.${m[2]}.${m[1]}`
    }
    return (s?: string) => dateFmtPref === 'PRETTY' ? pretty(s) : dateFmtPref === 'DOT' ? dot(s) : (s || '')
  }, [dateFmtPref])

  const [qDebounced, setQDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const tagsRes = await window.api?.tags?.list?.({})
        if (!cancelled) setTags((tagsRes?.rows || []).map((row) => ({ id: row.id, name: row.name, color: row.color ?? null })))
      } catch {}
      try {
        const budgetsRes = await window.api?.budgets?.list?.({})
        if (!cancelled) setBudgets((budgetsRes?.rows || []).map((row) => ({ id: row.id, name: row.name || row.categoryName || row.projectName || undefined, year: row.year })))
      } catch {}
      try {
        const bindingsRes = await window.api?.bindings?.list?.({ activeOnly: true })
        if (!cancelled) setEarmarks((bindingsRes?.rows || []).map((row) => ({ id: row.id, code: row.code, name: row.name, color: row.color ?? null })))
      } catch {}
      try {
        const paymentAccountsRes = await window.api?.paymentAccounts?.list?.()
        if (!cancelled) setPaymentAccounts((paymentAccountsRes?.rows || []).map((row: any) => ({ id: row.id, name: row.name, kind: row.kind ?? null, color: row.color ?? null })))
      } catch {}
      try {
        const yearsRes = await window.api?.reports?.years?.()
        if (!cancelled && yearsRes?.years) setYearsAvail(yearsRes.years)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await window.api?.invoices?.list?.({
        limit,
        offset,
        sort: sortDir,
        sortBy,
        status,
        sphere: sphere || undefined,
        budgetId: typeof budgetId === 'number' ? budgetId : undefined,
        q: qDebounced || undefined,
        dueFrom: dueFrom || undefined,
        dueTo: dueTo || undefined,
        tag: tag || undefined
      })
      setRows(res?.rows || [])
      setTotal(res?.total || 0)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadSummary() {
    try {
      const res = await window.api?.invoices?.summary?.({
        status,
        sphere: sphere || undefined,
        budgetId: typeof budgetId === 'number' ? budgetId : undefined,
        q: qDebounced || undefined,
        dueFrom: dueFrom || undefined,
        dueTo: dueTo || undefined,
        tag: tag || undefined
      })
      setSummary(res || null)
    } catch {
      setSummary(null)
    }
  }

  useEffect(() => { void load() }, [limit, offset, status, sphere, budgetId, qDebounced, dueFrom, dueTo, tag, sortDir, sortBy])
  useEffect(() => { void loadSummary() }, [status, sphere, budgetId, qDebounced, dueFrom, dueTo, tag])
  useEffect(() => {
    const onChanged = () => { void loadSummary() }
    return addDataChangedListener(['invoices', 'vouchers'], onChanged)
  }, [status, sphere, budgetId, qDebounced, dueFrom, dueTo, tag])
  useEffect(() => { try { localStorage.setItem('invoices.sort', sortDir) } catch {} }, [sortDir])
  useEffect(() => { try { localStorage.setItem('invoices.sortBy', sortBy) } catch {} }, [sortBy])

  function clearFilters() {
    setQ('')
    setStatus('ALL')
    setSphere('')
    setDueFrom('')
    setDueTo('')
    setBudgetId('')
    setTag('')
    setOffset(0)
  }

  const page = Math.floor(offset / limit) + 1
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)))
  const canPrev = offset > 0
  const canNext = offset + limit < total

  const [showPayModal, setShowPayModal] = useState<null | { id: number; party?: string; invoiceNo?: string | null; remaining: number }>(null)
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [payAmount, setPayAmount] = useState('')
  const [busyAction, setBusyAction] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<null | { id: number; party?: string; invoiceNo?: string | null }>(null)
  const [postToVoucherModal, setPostToVoucherModal] = useState<null | { id: number; party: string; invoiceNo?: string | null }>(null)
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState<null | { invoiceId: number; invoiceNo?: string | null; party?: string; paymentAmount: number; paymentDate: string; willCreateVoucher: boolean }>(null)

  const [detailId, setDetailId] = useState<number | null>(null)
  const [detail, setDetail] = useState<InvoiceDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  async function openDetails(id: number) {
    setDetailId(id)
  }

  useEffect(() => {
    let cancelled = false
    async function fetchDetail() {
      if (!detailId) return
      setLoadingDetail(true)
      try {
        const res = await window.api?.invoices?.get?.({ id: detailId })
        if (!cancelled) setDetail(res || null)
      } catch {
        if (!cancelled) setDetail(null)
      } finally {
        if (!cancelled) setLoadingDetail(false)
      }
    }
    void fetchDetail()
    return () => { cancelled = true }
  }, [detailId])

  useEffect(() => {
    if (detailId == null) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetailId(null)
        setDetail(null)
      }
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [detailId])

  useEffect(() => {
    function onOpen(e: any) {
      const id = Number(e?.detail?.id)
      if (isFinite(id) && id > 0) void openDetails(id)
    }
    window.addEventListener('open-invoice-details', onOpen as EventListener)
    return () => window.removeEventListener('open-invoice-details', onOpen as EventListener)
  }, [])

  async function addPayment() {
    if (!showPayModal) return
    const amount = Number(payAmount.replace(',', '.'))
    if (!isFinite(amount) || Math.abs(amount) < 0.01) {
      notify('error', 'Bitte einen Betrag angeben')
      return
    }
    const remainingCap = Math.max(0, Math.round(showPayModal.remaining * 100) / 100)
    if (amount - remainingCap > 1e-6) {
      notify('error', `Der Betrag übersteigt den offenen Rest (${eurFmt.format(remainingCap)}).`)
      return
    }

    const invoiceRow = rows.find((row) => row.id === showPayModal.id)
    if (!invoiceRow) {
      notify('error', 'Verbindlichkeit nicht gefunden')
      return
    }

    const hasAutoPost = !!(invoiceRow.autoPost ?? 0)
    const hasPaymentMethod = !!(invoiceRow.paymentMethod && invoiceRow.paymentMethod !== '')
    const paidAfter = (invoiceRow.paidSum || 0) + amount
    const willBePaid = paidAfter >= (invoiceRow.grossAmount || 0) - 0.01

    if (!hasPaymentMethod && hasAutoPost && willBePaid && !invoiceRow.postedVoucherId) {
      setShowPaymentMethodModal({
        invoiceId: showPayModal.id,
        invoiceNo: showPayModal.invoiceNo,
        party: showPayModal.party,
        paymentAmount: amount,
        paymentDate: payDate,
        willCreateVoucher: true
      })
      return
    }

    setBusyAction(true)
    try {
      const res = await window.api?.invoices?.addPayment?.({ invoiceId: showPayModal.id, date: payDate, amount })
      if (res) {
        setRows((prev) => prev.map((row) => row.id === showPayModal.id ? { ...row, paidSum: res.paidSum ?? ((row.paidSum || 0) + amount), status: res.status } : row))
        if (res.status === 'PAID' && hasAutoPost) {
          notify('success', `${invoiceRow.invoiceNo ? `Verbindlichkeit ${invoiceRow.invoiceNo}` : `Verbindlichkeit #${invoiceRow.id}`} wurde automatisch als Buchung erstellt.`)
        }
        setShowPayModal(null)
        dispatchDataChanged(['invoices', 'vouchers'])
        await loadSummary()
      }
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setBusyAction(false)
    }
  }

  async function confirmPaymentMethod(method: 'BAR' | 'BANK') {
    if (!showPaymentMethodModal) return
    setBusyAction(true)
    try {
      const invoiceRow = rows.find((row) => row.id === showPaymentMethodModal.invoiceId)
      if (!invoiceRow) throw new Error('Verbindlichkeit nicht gefunden')

      await window.api?.invoices?.update?.({
        id: showPaymentMethodModal.invoiceId,
        date: invoiceRow.date,
        dueDate: invoiceRow.dueDate || null,
        invoiceNo: invoiceRow.invoiceNo || null,
        party: invoiceRow.party,
        description: invoiceRow.description || null,
        grossAmount: invoiceRow.grossAmount,
        paymentMethod: method,
        paymentAccountId: invoiceRow.paymentAccountId ?? null,
        sphere: invoiceRow.sphere,
        earmarkId: invoiceRow.earmarkId || null,
        budgetId: invoiceRow.budgetId || null,
        budgets: invoiceRow.budgets || [],
        earmarks: invoiceRow.earmarks || [],
        autoPost: !!(invoiceRow.autoPost ?? 0),
        voucherType: invoiceRow.voucherType,
        tags: invoiceRow.tags || []
      })

      setRows((prev) => prev.map((row) => row.id === showPaymentMethodModal.invoiceId ? { ...row, paymentMethod: method } : row))

      if (showPaymentMethodModal.willCreateVoucher) {
        const res = await window.api?.invoices?.addPayment?.({
          invoiceId: showPaymentMethodModal.invoiceId,
          date: showPaymentMethodModal.paymentDate,
          amount: showPaymentMethodModal.paymentAmount
        })
        if (res) {
          setRows((prev) => prev.map((row) => row.id === showPaymentMethodModal.invoiceId ? { ...row, paidSum: res.paidSum ?? ((row.paidSum || 0) + showPaymentMethodModal.paymentAmount), status: res.status } : row))
          if (res.status === 'PAID') {
            notify('success', `Verbindlichkeit ${showPaymentMethodModal.invoiceNo || `#${showPaymentMethodModal.invoiceId}`} wurde automatisch als Buchung gebucht`)
          }
          setShowPaymentMethodModal(null)
          setShowPayModal(null)
        }
      } else {
        setPostToVoucherModal({
          id: showPaymentMethodModal.invoiceId,
          party: showPaymentMethodModal.party || '',
          invoiceNo: showPaymentMethodModal.invoiceNo
        })
        setShowPaymentMethodModal(null)
      }

      dispatchDataChanged(['invoices', 'vouchers'])
      await loadSummary()
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setBusyAction(false)
    }
  }

  async function deleteInvoice(id: number) {
    setBusyAction(true)
    try {
      const res = await window.api?.invoices?.delete?.({ id })
      if (res) {
        setRows((prev) => prev.filter((row) => row.id !== id))
        setTotal((current) => Math.max(0, current - 1))
        await loadSummary()
      }
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setBusyAction(false)
      setDeleteConfirm(null)
    }
  }

  const statusBadge = (s: InvoiceStatus) => {
    const map: Record<string, string> = { OPEN: 'var(--danger)', PARTIAL: '#f9a825', PAID: 'var(--success)' }
    const bg = map[s] || 'var(--muted)'
    const fg = contrastText(bg)
    return <span className="badge" style={{ background: bg, color: fg }}>{s}</span>
  }

  const [form, setForm] = useState<InvoiceFormState | null>(null)
  const [formFiles, setFormFiles] = useState<File[]>([])
  const [editInvoiceFiles, setEditInvoiceFiles] = useState<EditInvoiceFile[]>([])
  const [formError, setFormError] = useState('')
  const [requiredTouched, setRequiredTouched] = useState(false)
  const [showInvoiceScan, setShowInvoiceScan] = useState(false)

  const openCreate = useCallback(() => {
    setForm({
      mode: 'create',
      draft: normalizeInvoiceDraft({ voucherType: 'OUT' })
    })
    setFormFiles([])
    setFormError('')
    setRequiredTouched(false)
  }, [])

  async function createInvoiceFromScan(result: LocalInvoiceScanResult) {
    const grossAmount = parseScannedAmount(result.fields.grossAmount)
    const missing = [
      !result.fields.invoiceDate && 'Rechnungsdatum',
      !result.fields.invoiceNumber.trim() && 'Rechnungsnummer',
      !result.fields.supplier.trim() && 'Lieferant',
      (!grossAmount || grossAmount <= 0) && 'Bruttobetrag'
    ].filter(Boolean)
    if (missing.length) {
      notify('error', `Bitte ergänze: ${missing.join(', ')}.`)
      return false
    }
    const normalizedGrossAmount = grossAmount ?? 0

    const invoiceFacts = [
      result.note.trim(),
      result.fields.netAmount && `Netto: ${result.fields.netAmount} €`,
      result.fields.taxAmount && `Umsatzsteuer: ${result.fields.taxAmount} €`,
      result.fields.iban && `IBAN: ${result.fields.iban}`
    ].filter(Boolean).join('\n')

    try {
      const [file] = await encodeFilesForUpload([result.file])
      const response = await window.api.invoices.create({
        date: result.fields.invoiceDate,
        dueDate: result.fields.dueDate || null,
        invoiceNo: result.fields.invoiceNumber.trim(),
        party: result.fields.supplier.trim(),
        partyId: result.partyId,
        description: result.fields.description.trim() || null,
        note: invoiceFacts || null,
        grossAmount: normalizedGrossAmount,
        paymentMethod: result.bookingMeta.paymentMethod || null,
        paymentAccountId: result.bookingMeta.paymentAccountId ?? null,
        sphere: result.bookingMeta.sphere || 'IDEELL',
        budgetId: result.budgets[0]?.budgetId || null,
        earmarkId: result.earmarksAssigned[0]?.earmarkId || null,
        budgets: result.budgets.map((item) => ({ budgetId: item.budgetId, amount: item.amount })),
        earmarks: result.earmarksAssigned.map((item) => ({ earmarkId: item.earmarkId, amount: item.amount })),
        autoPost: true,
        voucherType: 'OUT',
        files: file ? [file] : undefined,
        tags: result.tags
      })
      setOffset(0)
      setFlashId(response.id)
      window.setTimeout(() => setFlashId((current) => current === response.id ? null : current), 3000)
      void Promise.all([load(), loadSummary()])
      dispatchDataChanged(['invoices'])
      notify('success', 'Verbindlichkeit angelegt')
      return true
    } catch (error: any) {
      notify('error', error?.message || String(error))
      return false
    }
  }

  async function openEdit(row: InvoiceListRow | InvoiceDetail) {
    if (row.status === 'PAID') {
      notify('info', 'Bezahlte Einträge können nicht mehr bearbeitet werden.')
      return
    }
    let source = row as Partial<InvoiceListRow & InvoiceDetail>
    if (!Array.isArray(source.budgets) || !Array.isArray(source.earmarks)) {
      try {
        const full = await window.api?.invoices?.get?.({ id: row.id })
        if (full) source = full
      } catch {
      }
    }
    setForm({
      mode: 'edit',
      draft: normalizeInvoiceDraft(source),
      sourceRow: row
    })
    setFormFiles([])
    setFormError('')
    setRequiredTouched(false)
  }

  function parseAmount(input: string): number | null {
    if (!input) return null
    const normalized = input.replace(/\./g, '').replace(',', '.')
    const amount = Number(normalized)
    return isFinite(amount) ? Math.round(amount * 100) / 100 : null
  }

  async function saveForm() {
    if (!form) return
    setRequiredTouched(true)
    setFormError('')
    const draft = form.draft
    const missing: string[] = []
    if (!draft.date) missing.push('Datum')
    if (!(draft.invoiceNo || '').trim()) missing.push('Verbindlichkeitsnummer')
    if (!draft.party?.trim()) missing.push('Partei')
    const amount = parseAmount(draft.grossAmount)
    if (amount == null || amount <= 0) missing.push('Betrag')
    if (missing.length) {
      return
    }
    try {
      const cleanBudgets = (draft.budgets || []).filter((item) => item.budgetId && Number(item.amount) > 0).map((item) => ({ budgetId: Number(item.budgetId), amount: Number(item.amount) }))
      const cleanEarmarks = (draft.earmarks || []).filter((item) => item.earmarkId && Number(item.amount) > 0).map((item) => ({ earmarkId: Number(item.earmarkId), amount: Number(item.amount) }))
      if (form.mode === 'create') {
        const files = formFiles.length ? await encodeFilesForUpload(formFiles) : undefined
        const payload = {
          date: draft.date,
          dueDate: draft.dueDate || null,
          invoiceNo: (draft.invoiceNo || '').trim() || null,
          party: draft.party.trim(),
          partyId: draft.partyId ?? null,
          description: (draft.description || '').trim() || null,
          note: (draft.note || '').trim() || null,
          grossAmount: amount,
          paymentMethod: draft.paymentMethod || null,
          paymentAccountId: typeof draft.paymentAccountId === 'number' ? draft.paymentAccountId : null,
          sphere: draft.sphere,
          earmarkId: typeof cleanEarmarks[0]?.earmarkId === 'number' ? cleanEarmarks[0].earmarkId : null,
          budgetId: typeof cleanBudgets[0]?.budgetId === 'number' ? cleanBudgets[0].budgetId : null,
          budgets: cleanBudgets,
          earmarks: cleanEarmarks,
          autoPost: !!draft.autoPost,
          voucherType: draft.voucherType,
          files,
          tags: draft.tags || []
        }
        const res = await window.api?.invoices?.create?.(payload as any)
        if (res?.id) {
          setForm(null)
          setFormFiles([])
          setOffset(0)
          setFlashId(res.id)
          window.setTimeout(() => setFlashId((current) => current === res.id ? null : current), 3000)
          await Promise.all([load(), loadSummary()])
        }
      } else {
        const payload = {
          id: draft.id!,
          date: draft.date,
          dueDate: draft.dueDate || null,
          invoiceNo: (draft.invoiceNo || '').trim() || null,
          party: draft.party.trim(),
          partyId: draft.partyId ?? null,
          description: (draft.description || '').trim() || null,
          note: (draft.note || '').trim() || null,
          grossAmount: amount,
          paymentMethod: draft.paymentMethod || null,
          paymentAccountId: typeof draft.paymentAccountId === 'number' ? draft.paymentAccountId : null,
          sphere: draft.sphere,
          earmarkId: typeof cleanEarmarks[0]?.earmarkId === 'number' ? cleanEarmarks[0].earmarkId : null,
          budgetId: typeof cleanBudgets[0]?.budgetId === 'number' ? cleanBudgets[0].budgetId : null,
          budgets: cleanBudgets,
          earmarks: cleanEarmarks,
          autoPost: !!draft.autoPost,
          voucherType: draft.voucherType,
          tags: draft.tags || []
        }
        const res = await window.api?.invoices?.update?.(payload as any)
        if (res?.id) {
          setForm(null)
          setFormFiles([])
          setFlashId(payload.id)
          window.setTimeout(() => setFlashId((current) => current === payload.id ? null : current), 3000)
          await Promise.all([load(), loadSummary()])
        }
      }
    } catch (e: any) {
      setFormError(e?.message || String(e))
    }
  }

  function removeFileAt(index: number) {
    setFormFiles((prev) => prev.filter((_, currentIndex) => currentIndex !== index))
  }

  const descSuggestions = useMemo(() => {
    const values = new Set<string>()
    for (const row of rows) if (row?.description) values.add(String(row.description))
    return Array.from(values).sort().slice(0, 30)
  }, [rows])

  useEffect(() => {
    if (!registerPageShortcuts) return
    registerPageShortcuts([{ id: 'invoices-quick-add', key: 'q', label: 'Neu', action: openCreate }])
    return () => registerPageShortcuts([])
  }, [openCreate, registerPageShortcuts])

  useEffect(() => {
    let alive = true
    async function loadFiles() {
      try {
        if (form?.mode === 'edit' && form.draft.id) {
          const res = await window.api?.invoiceFiles?.list?.({ invoiceId: form.draft.id })
          if (alive) setEditInvoiceFiles(res?.files || [])
        } else if (alive) {
          setEditInvoiceFiles([])
        }
      } catch {}
    }
    void loadFiles()
    return () => { alive = false }
  }, [form?.mode, form?.draft.id])

  async function uploadEditInvoiceFiles(files: File[]) {
    if (!form?.draft.id) return
    const encoded = await encodeFilesForUpload(files)
    for (const file of encoded) {
      await window.api?.invoiceFiles?.add?.({
        invoiceId: form.draft.id,
        fileName: file.name,
        dataBytes: file.dataBytes,
        mimeType: file.mime
      })
    }
    const res = await window.api?.invoiceFiles?.list?.({ invoiceId: form.draft.id })
    setEditInvoiceFiles(res?.files || [])
  }

  async function deleteEditInvoiceFile(fileId: number) {
    if (!form?.draft.id) return
    await window.api?.invoiceFiles?.delete?.({ fileId })
    const res = await window.api?.invoiceFiles?.list?.({ invoiceId: form.draft.id })
    setEditInvoiceFiles(res?.files || [])
  }

  return (
    <div className="card invoices-container">
      <div className="invoices-header">
        <h1>Verbindlichkeiten</h1>
        <div className="invoices-filters">
          <input className="input invoices-search" placeholder="Suche Verbindlichkeiten (Nr., Partei, Text)..." value={q} onChange={(e) => { setQ(e.target.value); setOffset(0) }} aria-label="Verbindlichkeiten durchsuchen" />
          <InvoiceFilterDropdown
            status={status}
            sphere={sphere}
            budgetId={budgetId}
            tag={tag}
            dueFrom={dueFrom}
            dueTo={dueTo}
            budgets={budgets}
            tags={tags}
            yearsAvail={yearsAvail}
            onApply={(values) => {
              setStatus(values.status)
              setSphere(values.sphere)
              setBudgetId(values.budgetId)
              setTag(values.tag)
              setDueFrom(values.dueFrom)
              setDueTo(values.dueTo)
              setOffset(0)
            }}
          />
          <ColumnSelectDropdown
            title="Spalten"
            tip="Tipp: Blende Spalten aus, die du nicht benötigst, um die Übersicht zu verbessern."
            columns={[
              { key: 'showTags', label: 'Tags anzeigen', checked: colPrefs.showTags, onChange: (checked) => setColPrefs((prev) => ({ ...prev, showTags: checked })) },
              { key: 'showBezahlt', label: 'Bezahlt anzeigen', checked: colPrefs.showBezahlt, onChange: (checked) => setColPrefs((prev) => ({ ...prev, showBezahlt: checked })) },
              { key: 'showRest', label: 'Rest anzeigen', checked: colPrefs.showRest, onChange: (checked) => setColPrefs((prev) => ({ ...prev, showRest: checked })) },
              { key: 'showAttachments', label: 'Anhänge (📎) anzeigen', checked: colPrefs.showAttachments, onChange: (checked) => setColPrefs((prev) => ({ ...prev, showAttachments: checked })) }
            ]}
          />
          {!!(q.trim() || status !== 'ALL' || sphere || budgetId || tag || dueFrom || dueTo) && <button className="btn btn-clear-filters" onClick={clearFilters} title="Alle Filter löschen">×</button>}
          <div className="filter-divider" />
          <button className="btn invoices-scan-button" onClick={() => setShowInvoiceScan(true)}>Rechnung erfassen</button>
          <button className="btn primary" onClick={openCreate}>+ Neu</button>
        </div>
      </div>

      {error && <div className="invoices-text-danger">{error}</div>}

      {loading ? (
        <LoadingState message="Lade Verbindlichkeiten..." />
      ) : (
        <>
          {summary && (
            <div className="helper invoices-summary">
              Offen gesamt: <strong>{eurFmt.format(Math.max(0, Math.round((summary.remaining || 0) * 100) / 100))}</strong>
              <span className="summary-remaining">
                ({summary.count} gesamt; Forderungen (IN): {eurFmt.format(summary.grossIn || 0)}, Verbindlichkeiten (OUT): {eurFmt.format(summary.grossOut || 0)})
              </span>
            </div>
          )}

          <div className="invoices-table-scroll-wrapper" role="region" aria-label="Verbindlichkeiten-Tabelle" tabIndex={0}>
          <table cellPadding={6} className="invoices-table invoices-table--wide">
            <thead>
              <tr>
                <th align="center" title="Typ">Typ</th>
                <th align="left">
                  <button className="btn ghost invoices-sort-btn" title="Nach Datum sortieren" onClick={() => { setSortBy('date'); setSortDir((prev) => sortBy === 'date' ? (prev === 'DESC' ? 'ASC' : 'DESC') : (prev || 'DESC')); setOffset(0) }}>
                    <span>Datum</span>
                    <span aria-hidden="true" className={sortBy === 'date' ? 'invoices-sort-icon-active' : 'invoices-sort-icon'}>{sortBy === 'date' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span>
                  </button>
                </th>
                <th align="left">
                  <button className="btn ghost invoices-sort-btn" title="Nach Fälligkeit sortieren" onClick={() => { setSortBy('due'); setSortDir((prev) => sortBy === 'due' ? (prev === 'DESC' ? 'ASC' : 'DESC') : (prev || 'ASC')); setOffset(0) }}>
                    <span>Fällig</span>
                    <span aria-hidden="true" className={sortBy === 'due' ? 'invoices-sort-icon-active' : 'invoices-sort-icon'}>{sortBy === 'due' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span>
                  </button>
                </th>
                <th align="left">Nr.</th>
                <th align="left">Partei</th>
                {colPrefs.showTags && <th align="left">Tags</th>}
                <th align="right">
                  <button className="btn ghost invoices-sort-btn" title="Nach Betrag sortieren" onClick={() => { setSortBy('amount'); setSortDir((prev) => sortBy === 'amount' ? (prev === 'DESC' ? 'ASC' : 'DESC') : (prev || 'DESC')); setOffset(0) }}>
                    <span>Brutto</span>
                    <span aria-hidden="true" className={sortBy === 'amount' ? 'invoices-sort-icon-active' : 'invoices-sort-icon'}>{sortBy === 'amount' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span>
                  </button>
                </th>
                {colPrefs.showBezahlt && <th align="right">Bezahlt</th>}
                {colPrefs.showRest && <th align="right">Rest</th>}
                <th align="left">
                  <button className="btn ghost invoices-sort-btn" title="Nach Status sortieren" onClick={() => { setSortBy('status'); setSortDir((prev) => sortBy === 'status' ? (prev === 'DESC' ? 'ASC' : 'DESC') : (prev || 'ASC')); setOffset(0) }}>
                    <span>Status</span>
                    <span aria-hidden="true" className={sortBy === 'status' ? 'invoices-sort-icon-active' : 'invoices-sort-icon'}>{sortBy === 'status' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span>
                  </button>
                </th>
                {colPrefs.showAttachments && <th align="center" title="Anhänge">📎</th>}
                <th align="center">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const remaining = Math.max(0, Math.round((Number(row.grossAmount || 0) - Number(row.paidSum || 0)) * 100) / 100)
                const fileCount = row.fileCount || 0
                return (
                  <tr
                    key={row.id}
                    className={flashId === row.id ? 'row-flash' : undefined}
                    onDoubleClick={() => { void openDetails(row.id) }}
                  >
                    <td align="center" title={row.voucherType === 'IN' ? 'Einnahme' : 'Ausgabe'}>
                      <span className={`badge invoices-type-badge ${row.voucherType === 'IN' ? 'invoices-type-badge-in' : ''}`}>{row.voucherType === 'IN' ? '↑ IN' : '↓ OUT'}</span>
                    </td>
                    <td>{fmtDateLocal(row.date)}</td>
                    <td>{fmtDateLocal(row.dueDate || '')}</td>
                    <td>
                      {row.invoiceNo || '-'}
                      {fileCount > 0 && <span className="invoices-attachment-icon" title={`${fileCount} Anhang${fileCount > 1 ? 'e' : ''}`}>📎</span>}
                    </td>
                    <td>{row.party}</td>
                    {colPrefs.showTags && (
                      <td>
                        <div className="invoices-tags-container">
                          {(row.tags || []).map((entry) => {
                            const def = tags.find((tagDef) => (tagDef.name || '').toLowerCase() === (entry || '').toLowerCase())
                            const bg = def?.color || undefined
                            const fg = bg ? contrastText(bg) : undefined
                            return <button key={entry} className="chip" onClick={() => { setTag(entry); setOffset(0) }} title={`Nach Tag "${entry}" filtern`} style={bg ? { background: bg, color: fg, borderColor: bg } : undefined}>{entry}</button>
                          })}
                        </div>
                      </td>
                    )}
                    <td align="right">{eurFmt.format(row.grossAmount)}</td>
                    {colPrefs.showBezahlt && <td align="right">{eurFmt.format(row.paidSum || 0)}</td>}
                    {colPrefs.showRest && <td align="right" className={remaining > 0 ? 'invoices-rest-danger' : 'invoices-rest-success'}>{eurFmt.format(remaining)}</td>}
                    <td>{statusBadge(row.status)}</td>
                    {colPrefs.showAttachments && <td align="center">{fileCount > 0 ? <span className="badge">📎 {fileCount}</span> : ''}</td>}
                    <td align="center" className="invoices-actions-nowrap">
                      {(() => {
                        const actions = [
                          { label: 'Info', onClick: () => void openDetails(row.id) },
                          ...(row.status !== 'PAID' ? [{ label: 'Bearbeiten', onClick: () => void openEdit(row) }] : []),
                          ...(remaining > 0 && row.status !== 'PAID'
                            ? [{ label: 'Zahlung', tone: 'primary' as const, onClick: () => { setShowPayModal({ id: row.id, party: row.party, invoiceNo: row.invoiceNo || null, remaining }); setPayAmount(String(remaining || '')) } }]
                            : []),
                          ...(row.status === 'PAID' && !row.autoPost && !row.postedVoucherId
                            ? [{
                                label: 'Buchen',
                                tone: 'primary' as const,
                                onClick: () => {
                                  const hasPaymentMethod = !!(row.paymentMethod && row.paymentMethod !== '')
                                  if (!hasPaymentMethod) {
                                    setShowPaymentMethodModal({
                                      invoiceId: row.id,
                                      invoiceNo: row.invoiceNo,
                                      party: row.party,
                                      paymentAmount: 0,
                                      paymentDate: '',
                                      willCreateVoucher: false
                                    })
                                  } else {
                                    setPostToVoucherModal({ id: row.id, party: row.party, invoiceNo: row.invoiceNo })
                                  }
                                }
                              }]
                            : [])
                        ]
                        return actions.length > 1
                          ? <InvoiceActionMenu actions={actions} title="Aktionen" />
                          : <button className="btn" onClick={actions[0].onClick}>{actions[0].label}</button>
                      })()}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={12} className="helper">Keine Verbindlichkeiten gefunden.</td></tr>}
            </tbody>
          </table>
          </div>

          <div className="pagination-bar" style={{ marginTop: 12, marginBottom: 0 }}>
            <div className="pagination-bar__info">
              <div className="pagination-bar__stat"><span>Gesamt:</span><span className="pagination-bar__stat-value">{total}</span></div>
              <div className="pagination-bar__divider" />
              <div className="pagination-bar__stat"><span>Seite:</span><span className="pagination-bar__stat-value">{page} / {pages}</span></div>
            </div>
            <div className="pagination-bar__controls">
              <select className="input" style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }} value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setOffset(0) }} aria-label="Einträge pro Seite" title="Einträge pro Seite">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <button className="btn pagination-bar__btn" disabled={!canPrev} onClick={() => setOffset(0)} title="Erste">«</button>
              <button className="btn pagination-bar__btn" disabled={!canPrev} onClick={() => setOffset(Math.max(0, offset - limit))} title="Zurück">‹</button>
              <button className="btn pagination-bar__btn" disabled={!canNext} onClick={() => setOffset(offset + limit)} title="Weiter">›</button>
              <button className="btn pagination-bar__btn" disabled={!canNext} onClick={() => setOffset(Math.min((pages - 1) * limit, offset + limit))} title="Letzte">»</button>
            </div>
          </div>
        </>
      )}

      {showPayModal && createPortal((() => {
        const rowData = rows.find((row) => row.id === showPayModal.id)
        const isIn = rowData?.voucherType === 'IN'
        const typeName = isIn ? 'Forderung' : 'Verbindlichkeit'
        return (
          <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowPayModal(null)}>
            <div className="modal payment-modal-grid" onClick={(e) => e.stopPropagation()}>
              <ModalHeader
                title="Zahlung hinzufügen"
                subtitle={`${showPayModal.invoiceNo ? `${typeName} ${showPayModal.invoiceNo}` : `${typeName} #${showPayModal.id}`} · ${showPayModal.party || ''}`}
                onClose={() => setShowPayModal(null)}
              />
              <div className="helper">Offener Rest: <strong>{eurFmt.format(Math.max(0, Math.round(showPayModal.remaining * 100) / 100))}</strong></div>
              <div className="row">
                <div className="field">
                  <label>Datum</label>
                  <input className="input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </div>
                <div className="field">
                  <label>Betrag (EUR)</label>
                  <input className="input" type="text" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} onBlur={() => {
                    const cap = Math.max(0, Math.round(showPayModal.remaining * 100) / 100)
                    const value = Number(String(payAmount || '').replace(',', '.'))
                    if (isFinite(value) && value - cap > 1e-6) setPayAmount(String(cap))
                  }} placeholder="z. B. 199,90" />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn" onClick={() => setShowPayModal(null)}>Abbrechen</button>
                <button className="btn primary" disabled={busyAction} onClick={() => void addPayment()}>Speichern</button>
              </div>
            </div>
          </div>
        )
      })(), document.body)}

      {showPaymentMethodModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowPaymentMethodModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500, textAlign: 'center' }}>
            <ModalHeader title="Zahlweg festlegen" subtitle={`Verbindlichkeit #${showPaymentMethodModal.invoiceId}`} onClose={() => setShowPaymentMethodModal(null)} />
            <div className="helper" style={{ marginBottom: 24 }}>Die Verbindlichkeit wird automatisch verbucht. Bitte wählen Sie den Zahlweg:</div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 16 }}>
              <button className="btn primary" style={{ fontSize: 18, padding: '16px 32px', minWidth: 160 }} onClick={() => void confirmPaymentMethod('BAR')} disabled={busyAction}>💵 Bar</button>
              <button className="btn primary" style={{ fontSize: 18, padding: '16px 32px', minWidth: 160 }} onClick={() => void confirmPaymentMethod('BANK')} disabled={busyAction}>🏦 Bank</button>
            </div>
            <button className="btn" onClick={() => setShowPaymentMethodModal(null)} style={{ marginTop: 8 }}>Abbrechen</button>
          </div>
        </div>
      )}

      {form && (
        <InvoiceFormModal
          form={form}
          formError={formError}
          requiredTouched={requiredTouched}
          tags={tags}
          budgets={budgets}
          earmarks={earmarks}
          paymentAccounts={paymentAccounts}
          descSuggestions={descSuggestions}
          formFiles={formFiles}
          editInvoiceFiles={editInvoiceFiles}
          onClose={() => setForm(null)}
          onDraftChange={(draft) => setForm((current) => current ? { ...current, draft } : current)}
          onSave={saveForm}
          onRequestDelete={() => { if (form.sourceRow) setDeleteConfirm(form.sourceRow) }}
          onSetRequiredTouched={setRequiredTouched}
          onRemovePendingFile={removeFileAt}
          onAddCreateFiles={(files) => setFormFiles((prev) => [...prev, ...files])}
          onUploadEditFiles={uploadEditInvoiceFiles}
          onDeleteEditFile={deleteEditInvoiceFile}
          parseAmount={parseAmount}
        />
      )}
      {showInvoiceScan && (
        <LocalInvoiceScanModal
          onClose={() => setShowInvoiceScan(false)}
          onCreateInvoice={async (result) => {
            const created = await createInvoiceFromScan(result)
            if (created) setShowInvoiceScan(false)
            return created
          }}
          budgetsForEdit={budgets.map((budget) => ({
            id: budget.id,
            label: budget.name ? `${budget.year} · ${budget.name}` : String(budget.year),
            year: budget.year
          }))}
          earmarks={earmarks}
          tagDefs={tags}
        />
      )}

      {detailId != null && (
        <InvoiceDetailModal
          detail={detail}
          loading={loadingDetail}
          tags={tags}
          fmtDateLocal={fmtDateLocal}
          eurFmt={eurFmt}
          statusBadge={statusBadge}
          notify={notify}
          onClose={() => { setDetailId(null); setDetail(null) }}
          onEdit={(nextDetail) => { setDetailId(null); setDetail(null); void openEdit(nextDetail) }}
          onTagFilter={(nextTag) => { setTag(nextTag); setOffset(0) }}
          onDetailChange={setDetail}
        />
      )}

      {deleteConfirm && createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
            <ModalHeader title="Verbindlichkeit löschen" subtitle={`${deleteConfirm.invoiceNo ? `Nr. ${deleteConfirm.invoiceNo}` : `#${deleteConfirm.id}`} · ${deleteConfirm.party || ''}`} onClose={() => setDeleteConfirm(null)} />
            <div>Diese Verbindlichkeit wirklich löschen?</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
              <button className="btn danger" disabled={busyAction} onClick={() => { void deleteInvoice(deleteConfirm.id); setForm(null) }}>Ja, löschen</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {postToVoucherModal && createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setPostToVoucherModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
            <ModalHeader title="Als Buchung hinzufügen" subtitle={`${postToVoucherModal.invoiceNo ? `Verbindlichkeit ${postToVoucherModal.invoiceNo}` : `Verbindlichkeit #${postToVoucherModal.id}`}`} onClose={() => setPostToVoucherModal(null)} />
            <div style={{ marginBottom: 16 }}><strong>{postToVoucherModal.party}</strong></div>
            <div className="helper" style={{ marginBottom: 16 }}>Diese bezahlte Verbindlichkeit als Buchung hinzufügen?</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setPostToVoucherModal(null)}>Abbrechen</button>
              <button
                className="btn primary"
                disabled={busyAction}
                onClick={async () => {
                  setBusyAction(true)
                  try {
                    const result = await window.api?.invoices?.postToVoucher?.({ invoiceId: postToVoucherModal.id })
                    if (result?.voucherId) {
                      setRows((prev) => prev.map((row) => row.id === postToVoucherModal.id ? { ...row, postedVoucherId: result.voucherId } : row))
                    }
                    notify('success', 'Verbindlichkeit wurde als Buchung hinzugefügt')
                    setPostToVoucherModal(null)
                    await Promise.all([load(), loadSummary()])
                  } catch (e: any) {
                    notify('error', e?.message || String(e))
                  } finally {
                    setBusyAction(false)
                  }
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
