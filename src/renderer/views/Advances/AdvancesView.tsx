import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../../context/useToast'
import CompactBookingFlyout from '../../components/CompactBookingFlyout'
import DatePickerButton from '../../components/common/DatePickerButton'
import type { QA } from '../../hooks/useQuickAdd'
import { dispatchDataChanged } from '../../utils/refresh'
import { encodeFilesForUpload } from '../../utils/fileEncoding'

import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { IconUser, IconReceipt2, IconChevronRight } from '@tabler/icons-react'
import './advances.css'
import BookingPopupFrame from '../../components/modals/BookingPopupFrame'
import SelectDropdown from '../../components/common/SelectDropdown'
import AdvancePurchaseList from './AdvancePurchaseList'

const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toLocaleUpperCase('de-DE')

type DateFmt = 'ISO' | 'PRETTY' | 'DOT'

type AdvanceStatus = 'OPEN' | 'RESOLVED' | 'ALL'

type AdvanceRow = {
  id: number
  memberId?: number | null
  recipientName: string
  memberName: string
  issuedAt: string
  amount: number
  settledAmount: number
  spentAmount?: number
  purchaseAmount?: number
  openAmount: number
  settlementCount: number
  purchaseCount?: number
  status: 'OPEN' | 'RESOLVED'
  notes?: string | null
  budgetId?: number | null
  earmarkId?: number | null
  placeholderVoucherId?: number | null
  resolvedAt?: string | null
}

export type AdvanceDetail = AdvanceRow & {
  settlements: Array<{
    id: number
    advanceId: number
    settledAt: string
    amount: number
    note?: string | null
    voucherId?: number | null
    invoiceId?: number | null
    voucherNo?: string | null
    invoiceNo?: string | null
  }>
  purchases?: Array<{
    id: number
    advanceId: number
    date: string
    type: 'IN' | 'OUT'
    sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    primaryClassificationValueId?: number | null
    description?: string | null
    netAmount: number
    grossAmount: number
    vatRate: number
    paymentMethod?: 'BAR' | 'BANK' | null
    paymentAccountId?: number | null
    paymentAccountName?: string | null
    paymentAccountKind?: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER' | null
    paymentAccountColor?: string | null
    categoryId?: number | null
    projectId?: number | null
    budgets?: Array<{ budgetId: number; amount: number }>
    earmarks?: Array<{ earmarkId: number; amount: number }>
    tags?: string[]
    files?: Array<{ name: string; dataBase64: string; mime?: string }>
    voucherId?: number | null
    voucherNo?: string | null
    createdAt?: string
  }>
}

type PaymentAccount = {
  id: number
  name: string
  kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'
  color?: string | null
  sortOrder: number
  isActive: number
}

function paymentMethodForAccountKind(kind?: PaymentAccount['kind'] | null): 'BAR' | 'BANK' | undefined {
  if (!kind) return undefined
  return kind === 'CASH' ? 'BAR' : 'BANK'
}

function AdvanceModalCloseButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button className="btn ghost booking-modal-icon-btn booking-modal-close-btn" type="button" aria-label="Schließen" title="Schließen (ESC)" disabled={disabled} onClick={onClick}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
      </svg>
    </button>
  )
}

function buildAdvancePurchaseQa(accounts: PaymentAccount[]): QA {
  const activeAccounts = accounts.filter((account) => account.isActive !== 0)
  const defaultCashAccount = activeAccounts.find((account) => account.kind === 'CASH') ?? activeAccounts[0] ?? null
  return {
    date: new Date().toISOString().slice(0, 10),
    type: 'OUT',
    sphere: 'IDEELL',
    mode: 'GROSS',
    grossAmount: 0,
    vatRate: 0,
    description: '',
    paymentMethod: paymentMethodForAccountKind(defaultCashAccount?.kind) ?? 'BAR',
    paymentAccountId: defaultCashAccount?.id ?? null,
    paymentAccountName: defaultCashAccount?.name ?? null
  } as QA
}

export default function AdvancesView() {
  const { notify } = useToast()
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

  // Date format from global settings
  const dateFmt = useMemo<DateFmt>(() => {
    try { return (localStorage.getItem('ui.dateFmt') as DateFmt) || 'ISO' } catch { return 'ISO' }
  }, [])
  const fmtDate = useMemo(() => {
    const pretty = (s?: string) => {
      if (!s) return ''
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
      if (!m) return s
      const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
      const dt = new Date(Date.UTC(y, mo - 1, d))
      const mon = dt.toLocaleString('de-DE', { month: 'short' }).replace('.', '')
      const dd = String(d).padStart(2, '0')
      return `${dd} ${mon} ${y}`
    }
    const dot = (s?: string) => {
      if (!s) return ''
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
      if (!m) return s
      return `${m[3]}.${m[2]}.${m[1]}`
    }
    return (s?: string) => dateFmt === 'PRETTY' ? pretty(s) : dateFmt === 'DOT' ? dot(s) : (s || '')
  }, [dateFmt])

  const [rows, setRows] = useState<AdvanceRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const searchQuery = useDebouncedValue(q.trim(), 250)
  const [listError, setListError] = useState('')
  const listRequest = useRef(0)
  const detailRequest = useRef(0)
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState<AdvanceStatus>('OPEN')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const [detail, setDetail] = useState<AdvanceDetail | null>(null)

  const [budgets, setBudgets] = useState<
    Array<{ id: number; label: string; year?: number; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number; isArchived?: number; color?: string | null }>
  >([])
  const [earmarks, setEarmarks] = useState<
    Array<{ id: number; code: string; name: string; color?: string | null; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number; isActive?: number }>
  >([])
  const [invoices, setInvoices] = useState<Array<{ id: number; invoiceNo?: string | null; party: string; status: 'OPEN' | 'PARTIAL' | 'PAID'; remaining: number }>>([])
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([])

  const [tagDefs, setTagDefs] = useState<Array<{ id: number; name: string; color?: string | null }>>([])
  const [descSuggest, setDescSuggest] = useState<string[]>([])
  const [isGeneralProfile, setIsGeneralProfile] = useState(false)
  const [categories, setCategories] = useState<Array<{ id: number; name: string; icon?: string | null; color?: string | null }>>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const createBusyRef = useRef(false)
  const createFormRef = useRef<HTMLFormElement>(null)
  const closeCreate = useCallback(() => { if (!createBusyRef.current) setCreateOpen(false) }, [])
  useEffect(() => {
    if (!createOpen) return
    const trigger = document.activeElement as HTMLElement | null
    const timer = window.setTimeout(() => createFormRef.current?.querySelector<HTMLInputElement>('input')?.focus(), 0)
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') { event.preventDefault(); closeCreate() }
      if (event.key === 'Tab') {
        const elements = Array.from(createFormRef.current?.closest('[role=dialog]')?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary') || []).filter(element => element.getClientRects().length > 0)
        const first = elements[0], last = elements[elements.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', onKey); trigger?.focus() }
  }, [createOpen, closeCreate])
  const createIssuedAtRef = useRef<HTMLInputElement | null>(null)
  const [createDraft, setCreateDraft] = useState({
    recipientName: '',
    issuedAt: new Date().toISOString().slice(0, 10),
    amount: '',
    notes: '',
    budgetId: '',
    earmarkId: '',
    primaryClassificationValueId: ''
  })

  const [settleOpen, setSettleOpen] = useState(false)
  const [settleBusy, setSettleBusy] = useState(false)
  const settleDateRef = useRef<HTMLInputElement | null>(null)
  const [settleDraft, setSettleDraft] = useState({
    settledAt: new Date().toISOString().slice(0, 10),
    amount: '',
    note: '',
    voucherId: '',
    invoiceId: ''
  })

  const [resolveConfirmOpen, setResolveConfirmOpen] = useState(false)
  const [resolveBusy, setResolveBusy] = useState(false)

  const [deleteAdvanceConfirmOpen, setDeleteAdvanceConfirmOpen] = useState(false)
  const [deleteAdvanceBusy, setDeleteAdvanceBusy] = useState(false)
  const [deletePurchaseConfirm, setDeletePurchaseConfirm] = useState<null | { purchaseId: number; date: string; description?: string | null; amount: number }>(null)
  const [deletePurchaseBusy, setDeletePurchaseBusy] = useState(false)

  const pageLimit = 80

  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false)
  const [purchaseFiles, setPurchaseFiles] = useState<File[]>([])
  const [purchaseQa, setPurchaseQa] = useState<QA>(() => buildAdvancePurchaseQa([]))
  const [editPurchaseId, setEditPurchaseId] = useState<number | null>(null)

  function startEditPurchase(p: NonNullable<AdvanceDetail['purchases']>[number]) {
    const mode = (p.netAmount && p.netAmount > 0) ? 'NET' : 'GROSS'
    setPurchaseQa({
      date: p.date,
      type: p.type,
      sphere: p.sphere,
      primaryClassificationValueId: p.primaryClassificationValueId ?? null,
      mode,
      grossAmount: p.grossAmount ?? 0,
      netAmount: p.netAmount ?? 0,
      vatRate: p.vatRate ?? 0,
      description: p.description || '',
      paymentMethod: p.paymentMethod ?? 'BAR',
      paymentAccountId: p.paymentAccountId ?? null,
      paymentAccountName: p.paymentAccountName ?? null,
      tags: p.tags ?? [],
      budgets: (p.budgets ?? []).map((b: any) => ({ budgetId: b.budgetId, amount: b.amount })),
      earmarksAssigned: (p.earmarks ?? []).map((e: any) => ({ earmarkId: e.earmarkId, amount: e.amount }))
    } as any)
    setPurchaseFiles([])
    setEditPurchaseId(p.id)
    setPurchaseModalOpen(true)
  }

  function onDropFiles(fileList: FileList | null) {
    if (!fileList) return
    const arr = Array.from(fileList)
    setPurchaseFiles((prev) => [...prev, ...arr])
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  const loadList = useCallback(async () => {
    const request = ++listRequest.current
    setLoading(true)
    setListError('')
    try {
      const res = await (window as any).api?.advances?.list?.({
        q: searchQuery || undefined,
        status,
        limit: pageLimit,
        offset: page * pageLimit
      })
      if (request !== listRequest.current) return
      if (page > 0 && page * pageLimit >= Number(res?.total || 0)) { setPage(0); return }
      const list = (res?.rows || []) as AdvanceRow[]
      setRows(list)
      setTotal(Number(res?.total || 0))
      if (list.length === 0) {
        setSelectedId(null)
        setDetail(null)
      } else {
        setSelectedId(current => current != null && list.some(row => row.id === current) ? current : list[0].id)
      }
    } catch (e: any) {
      if (request !== listRequest.current) return
      console.error('Vorschüsse konnten nicht geladen werden:', e)
      setListError('Vorschüsse konnten nicht geladen werden. Bitte erneut versuchen.')
      setRows([]); setTotal(0); setSelectedId(null); setDetail(null)
    } finally {
      if (request === listRequest.current) setLoading(false)
    }
  }, [searchQuery, status, page])

  async function loadDetail(id: number) {
    const request = ++detailRequest.current
    try {
      const res = await (window as any).api?.advances?.get?.({ id })
      if (request === detailRequest.current && selectedIdRef.current === id) setDetail((res as AdvanceDetail) || null)
    } catch (e: any) {
      if (request !== detailRequest.current || selectedIdRef.current !== id) return
      notify('error', e?.message || String(e))
      setDetail(null)
    }
  }

  async function loadMeta() {
    const [budgetState, earmarkState, openInvState, partialInvState, tagsState, paymentAccountsState, classificationsState] = await Promise.allSettled([
      (window as any).api?.budgets?.list?.({ includeArchived: false }),
      (window as any).api?.bindings?.list?.({ activeOnly: true }),
      (window as any).api?.invoices?.list?.({ limit: 80, offset: 0, status: 'OPEN', sort: 'ASC', sortBy: 'due' }),
      (window as any).api?.invoices?.list?.({ limit: 80, offset: 0, status: 'PARTIAL', sort: 'ASC', sortBy: 'due' }),
      (window as any).api?.tags?.list?.({ includeUsage: true }),
      (window as any).api?.paymentAccounts?.list?.(),
      (window as any).api?.classifications?.primary?.list?.()
    ])

    const budgetRes = budgetState.status === 'fulfilled' ? budgetState.value : null
    const earmarkRes = earmarkState.status === 'fulfilled' ? earmarkState.value : null
    const openInvRes = openInvState.status === 'fulfilled' ? openInvState.value : null
    const partialInvRes = partialInvState.status === 'fulfilled' ? partialInvState.value : null
    const tagsRes = tagsState.status === 'fulfilled' ? tagsState.value : null
    const paymentAccountsRes = paymentAccountsState.status === 'fulfilled' ? paymentAccountsState.value : null
    const classificationsRes = classificationsState.status === 'fulfilled' ? classificationsState.value : null

    setBudgets((budgetRes?.rows || []).map((budget: any) => ({
      id: budget.id,
      label: (budget.name && String(budget.name).trim()) || budget.categoryName || budget.projectName || String(budget.year),
      year: budget.year,
      startDate: budget.startDate ?? null,
      endDate: budget.endDate ?? null,
      enforceTimeRange: budget.enforceTimeRange ?? 0,
      isArchived: budget.isArchived ?? 0,
      color: budget.color ?? null
    })))
    setEarmarks((earmarkRes?.rows || []).map((earmark: any) => ({
      id: earmark.id,
      code: earmark.code,
      name: earmark.name,
      color: earmark.color ?? null,
      startDate: earmark.startDate ?? null,
      endDate: earmark.endDate ?? null,
      enforceTimeRange: earmark.enforceTimeRange ?? 0,
      isActive: earmark.isActive ?? 1
    })))
    setTagDefs((tagsRes?.rows || []).map((t: any) => ({ id: t.id, name: t.name, color: t.color ?? null })))
    setIsGeneralProfile(classificationsRes?.profile === 'GENERAL')
    setCategories((classificationsRes?.values || []).filter((category: any) => category.isActive !== false))
    setPaymentAccounts((paymentAccountsRes?.rows || []).map((account: any) => ({
      id: account.id,
      name: account.name,
      kind: account.kind,
      color: account.color ?? null,
      sortOrder: account.sortOrder ?? 0,
      isActive: account.isActive ?? 1
    })))

    const invoiceRows = [...(openInvRes?.rows || []), ...(partialInvRes?.rows || [])]
    const seen = new Set<number>()
    const items = invoiceRows
      .filter((invoice: any) => {
        if (!invoice?.id || seen.has(invoice.id)) return false
        seen.add(invoice.id)
        return true
      })
      .map((invoice: any) => ({
        id: invoice.id,
        invoiceNo: invoice.invoiceNo,
        party: invoice.party,
        status: invoice.status,
        remaining: Math.max(0, Number(invoice.grossAmount || 0) - Number(invoice.paidSum || 0))
      }))
      .filter((invoice: any) => invoice.remaining > 0.009)
    setInvoices(items)
  }

  useEffect(() => {
    loadMeta()
  }, [])

  useEffect(() => {
    void loadList()
    return () => { listRequest.current++ }
  }, [loadList])

  useEffect(() => {
    setDetail(null)
    if (selectedId != null) void loadDetail(selectedId)
    return () => { detailRequest.current++ }
  }, [selectedId])

  const totals = useMemo(() => {
    const openSum = rows.filter(row => row.status === 'OPEN').reduce((sum, row) => sum + Number(row.openAmount || 0), 0)
    const issuedSum = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    return {
      openSum,
      issuedSum,
      openCount: rows.filter((row) => row.status === 'OPEN').length
    }
  }, [rows])

  const detailBookedAmount = useMemo(() => {
    if (!detail) return 0
    return (detail.purchases || []).reduce((sum, purchase) => sum + (purchase.type === 'IN' ? -1 : 1) * purchase.grossAmount, 0)
  }, [detail])

  async function submitCreate() {
    if (createBusyRef.current) return
    const amount = Number(String(createDraft.amount).replace(',', '.'))
    if (!createDraft.recipientName.trim()) return notify('error', 'Empfänger ist erforderlich')
    if (!createDraft.issuedAt) return notify('error', 'Ausgabedatum ist erforderlich')
    if (!isFinite(amount) || amount <= 0) return notify('error', 'Betrag muss positiv sein')
    if (isGeneralProfile && !createDraft.primaryClassificationValueId) return notify('error', 'Kategorie ist erforderlich')

    createBusyRef.current = true
    setCreateBusy(true)
    try {
      const created = await (window as any).api?.advances?.create?.({
        recipientName: createDraft.recipientName.trim(),
        issuedAt: createDraft.issuedAt,
        amount,
        notes: createDraft.notes.trim() || null,
        budgetId: createDraft.budgetId ? Number(createDraft.budgetId) : null,
        earmarkId: createDraft.earmarkId ? Number(createDraft.earmarkId) : null,
        primaryClassificationValueId: createDraft.primaryClassificationValueId ? Number(createDraft.primaryClassificationValueId) : null
      })
      setCreateOpen(false)
      setCreateDraft({
        recipientName: '',
        issuedAt: new Date().toISOString().slice(0, 10),
        amount: '',
        notes: '',
        budgetId: '',
        earmarkId: '',
        primaryClassificationValueId: ''
      })
      setQ(''); setStatus('OPEN'); setPage(0)
      await loadList()
      if (created?.id) setSelectedId(created.id)
      notify('success', 'Vorschuss erfasst')
      dispatchDataChanged(['vouchers', 'members'])
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      createBusyRef.current = false
      setCreateBusy(false)
    }
  }

  async function submitSettle() {
    if (!detail?.id) return
    const advanceId = detail.id
    const amount = Number(String(settleDraft.amount).replace(',', '.'))
    const voucherId = settleDraft.voucherId ? Number(settleDraft.voucherId) : null

    if (!settleDraft.settledAt) return notify('error', 'Auflösungsdatum ist erforderlich')
    if (!isFinite(amount) || amount <= 0) return notify('error', 'Betrag muss positiv sein')
    if (amount - Number(detail.openAmount || 0) > 0.009) return notify('error', 'Betrag überschreitet den offenen Vorschuss')
    if (voucherId != null && (!Number.isInteger(voucherId) || voucherId <= 0)) return notify('error', 'Beleg-ID muss eine positive Zahl sein')

    setSettleBusy(true)
    try {
      await (window as any).api?.advances?.settle?.({
        id: advanceId,
        settledAt: settleDraft.settledAt,
        amount,
        note: settleDraft.note.trim() || null,
        voucherId,
        invoiceId: settleDraft.invoiceId ? Number(settleDraft.invoiceId) : null
      })
      setSettleOpen(false)
      setSettleDraft({
        settledAt: new Date().toISOString().slice(0, 10),
        amount: '',
        note: '',
        voucherId: '',
        invoiceId: ''
      })
      await Promise.all([loadList(), loadDetail(advanceId)])
      notify('success', 'Vorschuss aufgelöst')
      dispatchDataChanged(['vouchers', 'members'])
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setSettleBusy(false)
    }
  }

  async function removeSelectedAdvance() {
    if (!detail?.id) return
    setDeleteAdvanceConfirmOpen(true)
  }

  async function confirmRemoveSelectedAdvance() {
    if (!detail?.id) return
    const advanceId = detail.id
    setDeleteAdvanceBusy(true)
    try {
      await (window as any).api?.advances?.delete?.({ id: advanceId })
      notify('success', 'Vorschuss gelöscht')
      setDeleteAdvanceConfirmOpen(false)
      setDetail(null)
      setSelectedId(null)
      await loadList()
      dispatchDataChanged(['vouchers', 'members'])
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setDeleteAdvanceBusy(false)
    }
  }

  async function loadPurchaseDescSuggest(open: boolean) {
    if (!open) return
    try {
      const res = await (window as any).api?.vouchers?.recent?.({ limit: 50 })
      const uniq = new Set<string>()
      for (const r of (res?.rows || [])) {
        const d = String(r.description || '').trim()
        if (d) uniq.add(d)
        if (uniq.size >= 50) break
      }
      setDescSuggest(Array.from(uniq))
    } catch {
      setDescSuggest([])
    }
  }

  useEffect(() => {
    loadPurchaseDescSuggest(purchaseModalOpen)
  }, [purchaseModalOpen])

  async function submitPurchase() {
    if (!detail?.id) return
    const advanceId = detail.id

    const qa = purchaseQa
    const payload: any = {
      advanceId,
      date: qa.date,
      type: qa.type,
      sphere: qa.sphere,
      primaryClassificationValueId: qa.primaryClassificationValueId ?? null,
      description: qa.description || undefined,
      vatRate: qa.vatRate
    }

    if (qa.type === 'TRANSFER') {
      notify('error', 'Transfers sind im Vorschuss nicht erlaubt')
      return
    }

    payload.paymentMethod = qa.paymentMethod
    payload.paymentAccountId = (qa as any).paymentAccountId ?? null

    if ((qa as any).mode === 'GROSS') {
      payload.grossAmount = Number((qa as any).grossAmount ?? 0)
      payload.vatRate = 0
    } else {
      payload.netAmount = Number(qa.netAmount ?? 0)
    }

    const budgetsAssigned = Array.isArray((qa as any).budgets)
      ? ((qa as any).budgets as Array<{ budgetId: number; amount: number }>).
        filter((b) => b.budgetId && b.amount > 0).
        map((b) => ({ budgetId: Number(b.budgetId), amount: Number(b.amount) }))
      : []
    const earmarksAssigned = Array.isArray((qa as any).earmarksAssigned)
      ? ((qa as any).earmarksAssigned as Array<{ earmarkId: number; amount: number }>).
        filter((e) => e.earmarkId && e.amount > 0).
        map((e) => ({ earmarkId: Number(e.earmarkId), amount: Number(e.amount) }))
      : []
    if (budgetsAssigned.length) payload.budgets = budgetsAssigned
    if (earmarksAssigned.length) payload.earmarks = earmarksAssigned
    if (Array.isArray((qa as any).tags)) payload.tags = (qa as any).tags

    if (purchaseFiles.length) {
      payload.files = await encodeFilesForUpload(purchaseFiles)
    }

    try {
      if (editPurchaseId) {
        // Update existing purchase
        const updatePayload = { ...payload, id: editPurchaseId }
        delete updatePayload.advanceId
        await (window as any).api?.advances?.purchases?.update?.(updatePayload)
      } else {
        await (window as any).api?.advances?.purchases?.create?.(payload)
      }
      setPurchaseModalOpen(false)
      setPurchaseFiles([])
      setEditPurchaseId(null)
      setPurchaseQa((prev) => ({
        ...buildAdvancePurchaseQa(paymentAccounts),
        date: prev.date,
        sphere: prev.sphere
      }))
      await Promise.all([loadList(), loadDetail(advanceId)])
      notify('success', editPurchaseId ? 'Buchung aktualisiert' : 'Buchung hinzugefügt')
      dispatchDataChanged(['vouchers', 'members'])
    } catch (e: any) {
      notify('error', e?.message || String(e))
    }
  }

  async function deletePurchaseRow(purchaseId: number) {
    if (!detail?.id) return
    const p = detail.purchases?.find((x) => x.id === purchaseId)
    if (!p) return
    setDeletePurchaseConfirm({
      purchaseId,
      date: p.date,
      description: p.description ?? null,
      amount: Number(p.grossAmount || 0)
    })
  }

  async function confirmDeletePurchaseRow() {
    if (!detail?.id) return
    if (!deletePurchaseConfirm) return
    const advanceId = detail.id
    setDeletePurchaseBusy(true)
    try {
      await (window as any).api?.advances?.purchases?.delete?.({ id: deletePurchaseConfirm.purchaseId })
      setDeletePurchaseConfirm(null)
      await Promise.all([loadList(), loadDetail(advanceId)])
      notify('success', 'Buchung entfernt')
      dispatchDataChanged(['vouchers', 'members'])
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setDeletePurchaseBusy(false)
    }
  }

  async function resolveSelectedAdvance() {
    if (!detail?.id) return
    setResolveConfirmOpen(true)
  }

  async function confirmResolveSelectedAdvance() {
    if (!detail?.id) return
    const advanceId = detail.id
    setResolveBusy(true)
    try {
      await (window as any).api?.advances?.resolve?.({ id: advanceId })
      setResolveConfirmOpen(false)
      await Promise.all([loadList(), loadDetail(advanceId)])
      notify('success', 'Vorschuss aufgelöst')
      dispatchDataChanged(['vouchers', 'members'])
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setResolveBusy(false)
    }
  }

  return (
    <div className="advances-page">
      <header className="advances-header">
        <div>
          <h1 style={{ margin: 0 }}>Vorschüsse</h1>

        </div>
        <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}>+ Vorschuss</button>
      </header>

      <section className="advances-overview" aria-labelledby="advances-overview-title">
        <div className="advances-section-header">
          <div>
            <h2 id="advances-overview-title">Vorschussübersicht</h2>
            <p className="helper">Aktueller Stand aller angezeigten Vorschüsse.</p>
          </div>
        </div>
        <div className="advances-summary-grid">
          <div className="advances-summary-card">
            <div className="helper">Offener Betrag</div>
            <div className="advances-summary-value">{eurFmt.format(totals.openSum)}</div>
          </div>
          <div className="advances-summary-card">
            <div className="helper">Ausgegebener Betrag</div>
            <div className="advances-summary-value">{eurFmt.format(totals.issuedSum)}</div>
          </div>
          <div className="advances-summary-card">
            <div className="helper">Offene Vorschüsse</div>
            <div className="advances-summary-value">{totals.openCount}</div>
          </div>
        </div>
      </section>

      <section className="advances-workspace" aria-labelledby="advances-list-title">
        <div className="advances-section-header advances-section-header--list">
          <div>
            <h2 id="advances-list-title">Vorschussliste</h2>
            <p className="helper">Vorschuss auswählen und Buchungen oder Auflösung bearbeiten.</p>
          </div>
        </div>

        <div className="advances-layout">
        <section className="advances-list-card">
          <div className="advances-toolbar">
            <input
              className="input"
              placeholder="Suchen (Person, Notiz)…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0) }}
              aria-label="Vorschüsse durchsuchen"
            />
            <SelectDropdown value={status} onChange={value => { setStatus(value as AdvanceStatus); setPage(0) }} ariaLabel="Status filtern" options={[{ value: 'OPEN', label: 'Offen' }, { value: 'RESOLVED', label: 'Erledigt' }, { value: 'ALL', label: 'Alle' }]} />
          </div>

          <div className="advances-list-feedback" role="status">{loading ? 'Lade Vorschüsse…' : `${total} Vorschuss${total === 1 ? '' : 'e'}${q || status !== 'ALL' ? ' in dieser Auswahl' : ''}`}</div>
          {listError ? (
            <div className="advances-empty" role="alert"><p>{listError}</p><button className="btn" onClick={() => void loadList()}>Erneut versuchen</button></div>
          ) : !loading && rows.length === 0 ? (
            <div className="advances-empty"><IconReceipt2 size={30} /><strong>Keine Vorschüsse gefunden</strong><span className="helper">Passe die Suche oder den Statusfilter an.</span></div>
          ) : (
            <ul className="advances-recipient-list" aria-label="Vorschüsse nach Empfänger" aria-busy={loading}>
              {rows.map(row => (
                <li key={row.id}>
                  <button type="button" className={`advances-recipient-row${row.id === selectedId ? ' advances-row-active' : ''}`} aria-pressed={row.id === selectedId} onClick={() => setSelectedId(row.id)}>
                    <span className="advances-avatar" aria-hidden="true">{initials(row.memberName || row.recipientName)}</span>
                    <span className="advances-recipient-copy"><strong>{row.memberName || row.recipientName}</strong><span>Ausgegeben am {fmtDate(row.issuedAt)}</span><span className={`advances-status ${row.status === 'OPEN' ? 'open' : 'resolved'}`}>{row.status === 'OPEN' ? 'Offen' : 'Erledigt'}</span></span>
                    <span className="advances-recipient-amount"><strong>{eurFmt.format(row.amount)}</strong><span>{row.status === 'OPEN' ? `${eurFmt.format(row.openAmount)} offen` : 'Abgeschlossen'}</span></span>
                    <IconChevronRight size={15} aria-hidden="true" />
                    <span className="advances-progress" title={`${eurFmt.format(row.spentAmount ?? row.purchaseAmount ?? 0)} von ${eurFmt.format(row.amount)} ausgegeben`}>
                      <progress aria-label={`Ausgegeben: ${row.memberName || row.recipientName}`} max={row.amount} value={Math.max(0, Math.min(row.amount, row.spentAmount ?? row.purchaseAmount ?? 0))} />
                      <span>{Math.max(0, Math.round((row.spentAmount ?? row.purchaseAmount ?? 0) / row.amount * 100))} %</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {total > pageLimit && <nav className="advances-pagination" aria-label="Vorschussseiten"><button className="btn ghost" disabled={page === 0 || loading} onClick={() => setPage(value => value - 1)}>Zurück</button><span>{page + 1} / {Math.ceil(total / pageLimit)}</span><button className="btn ghost" disabled={(page + 1) * pageLimit >= total || loading} onClick={() => setPage(value => value + 1)}>Weiter</button></nav>}
        </section>

        <section className="advances-detail-card">
          {!detail ? (
            <div className="advances-empty advances-empty--detail"><IconUser size={32} /><strong>{selectedId != null ? 'Vorschuss wird geladen…' : 'Kein Vorschuss ausgewählt'}</strong><span className="helper">Wähle einen Eintrag aus der Vorschussliste.</span></div>
          ) : (
            <>
              <section className="advances-person-card" aria-label="Ausgewählter Vorschuss">
              <div className="advances-detail-header">
                <div className="advances-person">
                  <span className="advances-avatar advances-avatar--large" aria-hidden="true">{initials(detail.memberName || detail.recipientName)}</span>
                  <div><h2>{detail.memberName || detail.recipientName}</h2><div className="helper">{detail.memberId ? 'Vereinsmitglied' : 'Vorschussempfänger'} · Ausgegeben am {fmtDate(detail.issuedAt)}</div></div>
                </div>
                <span className={`advances-status ${detail.status === 'OPEN' ? 'open' : 'resolved'}`}>{detail.status === 'OPEN' ? 'Offen' : 'Erledigt'}</span>
              </div>
              <div className="advances-person-actions">
                <div className="advances-detail-actions">
                  <button className="btn" type="button" onClick={() => { setEditPurchaseId(null); setPurchaseQa(buildAdvancePurchaseQa(paymentAccounts)); setPurchaseModalOpen(true) }} disabled={detail.status !== 'OPEN'}>+ Buchung</button>
                  <button className="btn primary" type="button" onClick={resolveSelectedAdvance} disabled={detail.status !== 'OPEN'}>Auflösen</button>
                </div>
              </div>

              <div className="advances-detail-kpis">
                <div>
                  <div className="helper">Ausgegeben</div>
                  <div>{eurFmt.format(detail.amount)}</div>
                </div>
                <div className={detailBookedAmount > detail.amount ? 'advances-kpi-overdrawn' : ''}>
                  <div className="helper">Erfasste Ausgaben</div>
                  <div>{eurFmt.format(detailBookedAmount)}</div>
                </div>
                <div className={detail.openAmount < 0 ? 'advances-kpi-negative' : ''}>
                  <div className="helper">Offen</div>
                  <div>{eurFmt.format(detail.status === 'OPEN' ? detail.openAmount : 0)}</div>
                </div>
              </div>

              </section>
              {detail.notes ? <div className="advances-note"><strong>Notiz</strong><p>{detail.notes}</p></div> : null}

              <h3 className="advances-subtitle">Buchungen <span className="helper">({detail.purchases?.length || 0})</span></h3>
              {(!detail.purchases || detail.purchases.length === 0) ? (
                <div className="advances-empty"><IconReceipt2 size={32} /><strong>Noch keine Buchungen vorhanden</strong><span className="helper">Erfasse die Ausgaben und die zugehörigen Belege für diesen Vorschuss.</span>{detail.status === 'OPEN' && <button className="btn" onClick={() => { setEditPurchaseId(null); setPurchaseQa(buildAdvancePurchaseQa(paymentAccounts)); setPurchaseModalOpen(true) }}>+ Buchung hinzufügen</button>}</div>
              ) : (
                <AdvancePurchaseList purchases={detail.purchases} budgets={budgets} earmarks={earmarks} tagDefs={tagDefs} categories={categories} generalProfile={isGeneralProfile} editable={detail.status === 'OPEN'} onEdit={startEditPurchase} onDelete={deletePurchaseRow} fmtDate={fmtDate} />
              )}

              {/* Löschen ganz unten rechts */}
              {detail.settlementCount === 0 && detail.status === 'OPEN' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn ghost danger" type="button" onClick={removeSelectedAdvance}>Vorschuss löschen</button>
                </div>
              )}
            </>
          )}
          </section>
        </div>
      </section>

      {createOpen && (
        <BookingPopupFrame title="Vorschuss erfassen" titleId="advance-create-title" variant="compact" anchorAlign="end" className="advance-create-flyout" onClose={closeCreate}>
          <form ref={createFormRef} className="advance-create-form" onSubmit={event => { event.preventDefault(); void submitCreate() }}>
            <div className="advance-create-fields">
              <label className="advance-create-field" htmlFor="advance-recipient">Empfänger *<input id="advance-recipient" className="input" required value={createDraft.recipientName} onChange={event => setCreateDraft(current => ({ ...current, recipientName: event.target.value }))} placeholder="Name der Person" /></label>
              <div className="advance-create-row">
                <label className="advance-create-field" htmlFor="advance-amount">Betrag (€) *<input id="advance-amount" className="input" required inputMode="decimal" value={createDraft.amount} onChange={event => setCreateDraft(current => ({ ...current, amount: event.target.value }))} placeholder="0,00" /></label>
                <label className="advance-create-field" htmlFor="advance-issued-at">Ausgabedatum *<span className="booking-date-input-wrap"><input id="advance-issued-at" ref={createIssuedAtRef} type="date" className="input" required value={createDraft.issuedAt} onChange={event => setCreateDraft(current => ({ ...current, issuedAt: event.target.value }))} /><DatePickerButton inputRef={createIssuedAtRef} ariaLabel="Kalender zur Auswahl des Ausgabedatums öffnen" /></span></label>
              </div>
              {isGeneralProfile && <div className="advance-create-field"><label htmlFor="advance-primary-category">Kategorie *</label><SelectDropdown id="advance-primary-category" ariaLabel="Kategorie" value={createDraft.primaryClassificationValueId} placeholder="Kategorie wählen" options={categories.map(category => ({ value: String(category.id), label: category.name }))} onChange={value => setCreateDraft(current => ({ ...current, primaryClassificationValueId: value }))} /></div>}
              <details className="advance-create-optional"><summary>Zuordnung & Notiz <span>optional</span></summary>
                <div className="advance-create-field"><label htmlFor="advance-budget">Budget</label><SelectDropdown id="advance-budget" ariaLabel="Budget" value={createDraft.budgetId} options={[{ value: '', label: 'Keine Zuordnung' }, ...budgets.map(budget => ({ value: String(budget.id), label: budget.label, color: budget.color || undefined }))]} onChange={value => setCreateDraft(current => ({ ...current, budgetId: value }))} /></div>
                <div className="advance-create-field"><label htmlFor="advance-earmark">Zweckbindung</label><SelectDropdown id="advance-earmark" ariaLabel="Zweckbindung" value={createDraft.earmarkId} options={[{ value: '', label: 'Keine Zuordnung' }, ...earmarks.map(earmark => ({ value: String(earmark.id), label: `${earmark.code} – ${earmark.name}`, color: earmark.color || undefined }))]} onChange={value => setCreateDraft(current => ({ ...current, earmarkId: value }))} /></div>
                <label className="advance-create-field" htmlFor="advance-notes">Notiz<textarea id="advance-notes" className="input" rows={2} value={createDraft.notes} onChange={event => setCreateDraft(current => ({ ...current, notes: event.target.value }))} /></label>
              </details>
            </div>
            <footer className="advance-create-footer"><button className="btn ghost" type="button" disabled={createBusy} onClick={closeCreate}>Abbrechen</button><button className="btn primary" type="submit" disabled={createBusy}>{createBusy ? 'Speichert…' : 'Vorschuss erfassen'}</button></footer>
          </form>
        </BookingPopupFrame>
      )}

      {settleOpen && detail && (
        <div className="modal-overlay" onClick={() => setSettleOpen(false)} role="dialog" aria-modal="true">
          <div className="modal standard-floating-modal advances-form-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="advances-modal-header">
              <h2 style={{ margin: 0 }}>Vorschuss auflösen</h2>
              <AdvanceModalCloseButton onClick={() => setSettleOpen(false)} />
            </div>
            <div className="helper">Offener Betrag: {eurFmt.format(detail.status === 'OPEN' ? detail.openAmount : 0)}</div>
            <div className="row">
              <div className="field standard-floating-field standard-floating-field--filled">
                <label htmlFor="advance-settled-at">Auflösungsdatum *</label>
                <span className="booking-date-input-wrap">
                  <input id="advance-settled-at" ref={settleDateRef} type="date" className="input" value={settleDraft.settledAt} onChange={(e) => setSettleDraft((prev) => ({ ...prev, settledAt: e.target.value }))} />
                  <DatePickerButton inputRef={settleDateRef} ariaLabel="Kalender zur Auswahl des Auflösungsdatums öffnen" />
                </span>
              </div>
              <div className={`field standard-floating-field${settleDraft.amount.trim() ? ' standard-floating-field--filled' : ''}`}>
                <label htmlFor="advance-settle-amount">Betrag (€) *</label>
                <input id="advance-settle-amount" className="input" value={settleDraft.amount} onChange={(e) => setSettleDraft((prev) => ({ ...prev, amount: e.target.value }))} placeholder="0,00" />
              </div>
            </div>
            <div className="row">
              <div className="field standard-floating-field standard-floating-field--filled">
                <label htmlFor="advance-invoice">Rechnung (optional)</label>
                <select id="advance-invoice" className="input" value={settleDraft.invoiceId} onChange={(e) => setSettleDraft((prev) => ({ ...prev, invoiceId: e.target.value }))}>
                  <option value="">Keine Zuordnung</option>
                  {invoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNo ? `${invoice.invoiceNo} – ` : ''}{invoice.party} ({eurFmt.format(invoice.remaining)})
                    </option>
                  ))}
                </select>
              </div>
              <div className={`field standard-floating-field${settleDraft.voucherId.trim() ? ' standard-floating-field--filled' : ''}`}>
                <label htmlFor="advance-voucher-id">Beleg-ID (optional)</label>
                <input id="advance-voucher-id" className="input" value={settleDraft.voucherId} onChange={(e) => setSettleDraft((prev) => ({ ...prev, voucherId: e.target.value }))} placeholder="z. B. 123" />
              </div>
            </div>
            <div className={`field standard-floating-field${settleDraft.note.trim() ? ' standard-floating-field--filled' : ''}`}>
              <label htmlFor="advance-settle-note">Notiz (optional)</label>
              <textarea id="advance-settle-note" className="input" rows={3} value={settleDraft.note} onChange={(e) => setSettleDraft((prev) => ({ ...prev, note: e.target.value }))} />
            </div>
            <div className="advances-modal-actions">
              <button className="btn" type="button" onClick={() => setSettleOpen(false)}>Abbrechen</button>
              <button className="btn primary" type="button" disabled={settleBusy} onClick={submitSettle}>Auflösen</button>
            </div>
          </div>
        </div>
      )}

      {resolveConfirmOpen && detail && (
        <div className="modal-overlay" onClick={() => resolveBusy ? undefined : setResolveConfirmOpen(false)} role="dialog" aria-modal="true">
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="advances-modal-header">
              <h2 style={{ margin: 0 }}>Vorschuss jetzt auflösen?</h2>
              <AdvanceModalCloseButton disabled={resolveBusy} onClick={() => setResolveConfirmOpen(false)} />
            </div>
            <div className="helper" style={{ marginBottom: 8 }}>Empfänger: {detail.memberName || detail.recipientName}</div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div>- Alle Buchungen werden als Belege gebucht</div>
              <div>- Der Platzhalter-Beleg (Barvorschuss) wird entfernt</div>
            </div>
            <div className="advances-modal-actions">
              <button className="btn" type="button" disabled={resolveBusy} onClick={() => setResolveConfirmOpen(false)}>Abbrechen</button>
              <button className="btn primary" type="button" disabled={resolveBusy || detail.status !== 'OPEN'} onClick={confirmResolveSelectedAdvance}>Auflösen</button>
            </div>
          </div>
        </div>
      )}

      {deleteAdvanceConfirmOpen && detail && (
        <div
          className="modal-overlay"
          onClick={() => deleteAdvanceBusy ? undefined : setDeleteAdvanceConfirmOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal" style={{ maxWidth: 520, display: 'grid', gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Vorschuss löschen</h2>
              <button
                className="btn ghost"
                type="button"
                aria-label="Schließen"
                disabled={deleteAdvanceBusy}
                onClick={() => setDeleteAdvanceConfirmOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="helper">
              Möchtest du den Vorschuss für <strong>{detail.memberName || detail.recipientName}</strong> wirklich löschen?
              <div className="helper" style={{ marginTop: 6 }}>
                (nur ohne Buchungen/Auflösungen möglich)
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" type="button" disabled={deleteAdvanceBusy} onClick={() => setDeleteAdvanceConfirmOpen(false)}>Abbrechen</button>
              <button className="btn danger" type="button" disabled={deleteAdvanceBusy} onClick={confirmRemoveSelectedAdvance}>Löschen</button>
            </div>
          </div>
        </div>
      )}

      {deletePurchaseConfirm && detail && (
        <div
          className="modal-overlay"
          onClick={() => deletePurchaseBusy ? undefined : setDeletePurchaseConfirm(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal" style={{ maxWidth: 520, display: 'grid', gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Buchung entfernen</h2>
              <button
                className="btn ghost"
                type="button"
                aria-label="Schließen"
                disabled={deletePurchaseBusy}
                onClick={() => setDeletePurchaseConfirm(null)}
              >
                ×
              </button>
            </header>
            <div className="helper">
              Möchtest du diese Buchung wirklich entfernen?
              <div className="helper" style={{ marginTop: 6 }}>
                {fmtDate(deletePurchaseConfirm.date)} · {deletePurchaseConfirm.description || '—'} · {eurFmt.format(deletePurchaseConfirm.amount)}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" type="button" disabled={deletePurchaseBusy} onClick={() => setDeletePurchaseConfirm(null)}>Abbrechen</button>
              <button className="btn danger" type="button" disabled={deletePurchaseBusy} onClick={confirmDeletePurchaseRow}>Entfernen</button>
            </div>
          </div>
        </div>
      )}

      {purchaseModalOpen && detail && (
        <>
          <div
            className="compact-booking-flyout-dismiss"
            role="presentation"
            onMouseDown={(event) => {
              event.preventDefault()
              setPurchaseModalOpen(false)
              setPurchaseFiles([])
              setEditPurchaseId(null)
            }}
          />
          <div className="compact-booking-flyout-anchor advances-purchase-flyout-anchor">
            <CompactBookingFlyout
              qa={purchaseQa}
              setQa={setPurchaseQa}
              kindOptions={[{ value: 'IN', label: 'Einnahme' }, { value: 'OUT', label: 'Ausgabe' }]}
              onSave={submitPurchase}
              onClose={() => { setPurchaseModalOpen(false); setPurchaseFiles([]); setEditPurchaseId(null) }}
              onExpand={() => undefined}
              showExpand={false}
              files={purchaseFiles}
              setFiles={setPurchaseFiles}
              openFilePicker={openFilePicker}
              onDropFiles={onDropFiles}
              fileInputRef={fileInputRef}
              budgetsForEdit={budgets}
              earmarks={earmarks as any}
              paymentAccounts={paymentAccounts}
              tagDefs={tagDefs as any}
              descSuggest={descSuggest}
              afterSaveDefault="close"
              draftTabsEnabled={false}
              draftTabs={[]}
              activeDraftId={null}
              onSelectDraft={() => undefined}
              onNewDraft={() => undefined}
            />
          </div>
        </>
      )}
    </div>
  )
}
