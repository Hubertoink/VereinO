import {
  friendlyVoucherError,
  voucherRowToBookingForm,
  bookingEditTitle,
  voucherMutationBlockReason,
  serializeBookingForm,
  buildVoucherUpdatePayloadFromForm,
  persistBookingEdit,
  type BookingEditForm
} from './views/BookingsPlus/bookingEdit'
import { scannedInvoiceToBooking } from './utils/scannedInvoiceToBooking'
import ModalHeader from './components/ModalHeader'
import { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import DiscardReceiptModal from './components/modals/DiscardReceiptModal'
import { useQuickAdd } from './hooks/useQuickAdd'
import type { LocalInvoiceScanDraftState } from './components/modals/LocalInvoiceScanModal'
import type { InvoiceAiGuidance } from './types/invoiceAiGuidance'
import { useToast } from './context/useToast'
import { useUIPreferences } from './context/useUIPreferences'
import QuickAddModal from './components/modals/QuickAddModal'

import { shouldPromptDiscardForEdit } from './views/Journal/utils/journalEditDiscardPrompt'
import { shouldPromptDiscardForDraftClose } from './utils/quickAddCloseBehavior'
import { notifyBookingSaved } from './utils/notifyBookingSaved'
import { encodeFileForUpload, encodeFilesForUpload, uploadPayloadToFile } from './utils/fileEncoding'
import { dispatchDataChanged } from './utils/refresh'

const LocalInvoiceScanModal = lazy(() => import('./components/modals/LocalInvoiceScanModal'))
const VoucherInfoModal = lazy(() => import('./components/modals/VoucherInfoModal'))
const AttachmentsModal = lazy(() => import('./components/modals/AttachmentsModal'))

export default function DetachedQuickAddWindow() {
  const { notify } = useToast()
  const { quickAddAfterSave, allowVoucherDeletion, showBookingDraftTabs, showBookingEditTabs } =
    useUIPreferences()
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const eurFmt = useMemo(
    () => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }),
    []
  )
  const fmtDate = useCallback((s?: string) => s || '', [])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const openedRef = useRef(false)
  const detachedDraftIdRef = useRef<string>('')
  const [loaded, setLoaded] = useState(false)
  const [earmarks, setEarmarks] = useState<
    Array<{
      id: number
      code: string
      name: string
      color?: string | null
      startDate?: string | null
      endDate?: string | null
      enforceTimeRange?: number
    }>
  >([])
  const [budgets, setBudgets] = useState<
    Array<{
      id: number
      year: number
      categoryName?: string | null
      projectName?: string | null
      name?: string | null
      startDate?: string | null
      endDate?: string | null
      color?: string | null
      isArchived?: number
      enforceTimeRange?: number
      earmarkId?: number | null
    }>
  >([])
  const [paymentAccounts, setPaymentAccounts] = useState<
    Array<{
      id: number
      name: string
      kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'
      iban?: string | null
      color?: string | null
      sortOrder: number
      isActive: number
    }>
  >([])
  const [tagDefs, setTagDefs] = useState<
    Array<{ id: number; name: string; color?: string | null; usage?: number }>
  >([])
  const [descSuggest, setDescSuggest] = useState<string[]>([])
  const [windowModeKind, setWindowModeKind] = useState<'create' | 'invoice' | 'edit' | 'details'>('create')
  const [invoiceDraftFile, setInvoiceDraftFile] = useState<File | null>(null)
  const [receiptIntake, setReceiptIntake] = useState(false)
  const [confirmDiscardReceipt, setConfirmDiscardReceipt] = useState(false)
  const [receiptTarget, setReceiptTarget] = useState<'booking' | 'invoice'>('booking')
  const [receiptOrganization, setReceiptOrganization] = useState<{ id: string; name: string } | null>(null)
  const [invoiceDraftState, setInvoiceDraftState] = useState<LocalInvoiceScanDraftState | null>(null)
  const [invoiceDraftGuidance, setInvoiceDraftGuidance] = useState<InvoiceAiGuidance | undefined>()
  const [editQa, setEditQa] = useState<BookingEditForm | null>(null)
  const [detailVoucher, setDetailVoucher] = useState<any | null>(null)
  const [detailAttachmentsVoucher, setDetailAttachmentsVoucher] = useState<null | {
    voucherId: number
    voucherNo: string
    date: string
    description: string
  }>(null)
  const [confirmDetailReverse, setConfirmDetailReverse] = useState(false)
  const [editFiles, setEditFiles] = useState<File[]>([])
  const [editExistingFiles, setEditExistingFiles] = useState<
    Array<{ id: number; fileName: string }>
  >([])
  const [editExistingFilesLoading, setEditExistingFilesLoading] = useState(false)
  const [editInitialSnapshot, setEditInitialSnapshot] = useState('')
  const [confirmDiscardEdit, setConfirmDiscardEdit] = useState(false)
  const [confirmDiscardCreate, setConfirmDiscardCreate] = useState(false)
  const [confirmDeleteEdit, setConfirmDeleteEdit] = useState(false)

  const refreshDetailVoucher = useCallback(async () => {
    if (!detailVoucher?.id) return
    try {
      const refreshed = await window.api?.vouchers.list?.({
        limit: 1,
        voucherIds: [detailVoucher.id]
      })
      const next = (refreshed as any)?.rows?.[0]
      if (next) {
        setDetailVoucher(next)
      }
    } catch {
      // Ignore and keep current details open
    }
  }, [detailVoucher?.id])

  useEffect(() => {
    document.documentElement.classList.add('detached-quick-add-document')
    document.body.classList.add('detached-quick-add-body')

    return () => {
      document.documentElement.classList.remove('detached-quick-add-document')
      document.body.classList.remove('detached-quick-add-body')
    }
  }, [])

  const budgetsForEdit = useMemo(() => {
    const byIdEarmark = new Map(earmarks.map((e) => [e.id, e]))
    return budgets.map((budget: any) => {
      let label = ''
      if (budget.name && String(budget.name).trim()) label = String(budget.name).trim()
      else if (budget.categoryName && String(budget.categoryName).trim())
        label = `${budget.year} - ${budget.categoryName}`
      else if (budget.projectName && String(budget.projectName).trim())
        label = `${budget.year} - ${budget.projectName}`
      else if (budget.earmarkId) {
        const earmark = byIdEarmark.get(budget.earmarkId)
        if (earmark) label = `${budget.year} - ${earmark.code}`
      }
      if (!label) label = String(budget.year)
      return {
        id: budget.id,
        label,
        year: budget.year,
        startDate: budget.startDate ?? null,
        endDate: budget.endDate ?? null,
        enforceTimeRange: budget.enforceTimeRange ?? 0,
        isArchived: budget.isArchived ?? 0,
        color: budget.color ?? null
      }
    })
  }, [budgets, earmarks])

  const {
    quickAdd,
    qa,
    setQa,
    onQuickSave,
    files,
    setFiles,
    openFilePicker,
    onDropFiles,
    openQuickAdd
  } = useQuickAdd(
    today,
    async (payload: any) => {
      try {
        const res = await window.api?.vouchers.create?.(payload)
        if (res) {
          notify('success', `Beleg erstellt: #${res.voucherNo} (Brutto ${res.grossAmount})`)
          const warnings = res?.warnings
          if (warnings?.length) warnings.forEach((msg) => notify('info', 'Warnung: ' + msg))
          notifyBookingSaved({
            ...res,
            mode: 'create',
            draftId: detachedDraftIdRef.current,
            agentDraftId: payload?.agentDraftId
          })
        }
        return res
      } catch (e: any) {
        notify('error', friendlyVoucherError(e))
        return null
      }
    },
    () => fileInputRef.current?.click(),
    notify,
    false,
    quickAddAfterSave
  )

  useEffect(() => {
    let cancelled = false
    async function loadLookups() {
      try {
        const [bindingsRes, budgetsRes, paymentAccountsRes, tagsRes] = await Promise.all([
          window.api?.bindings?.list?.({ activeOnly: true }),
          window.api?.budgets?.list?.({ includeArchived: true } as any),
          window.api?.paymentAccounts?.list?.(),
          window.api?.tags?.list?.({ includeUsage: true })
        ])
        if (cancelled) return
        setEarmarks((bindingsRes as any)?.rows || [])
        setBudgets((budgetsRes as any)?.rows || [])
        setPaymentAccounts((paymentAccountsRes as any)?.rows || [])
        setTagDefs((tagsRes as any)?.rows || [])
      } catch {
        if (!cancelled)
          notify('error', 'Stammdaten für das Buchungsfenster konnten nicht geladen werden.')
      }
    }
    loadLookups()
    return () => {
      cancelled = true
    }
  }, [notify])

  useEffect(() => {
    if (openedRef.current) return
    let cancelled = false
    async function openInitialDraft() {
      const token = new URLSearchParams(window.location.search).get('token') || ''
      let initial: any = null
      try {
        if (token) {
          const res = await window.api?.quickAdd?.detachedInitial?.({ token })
          initial = res?.initial || null
        }
      } catch {}
      if (cancelled || openedRef.current) return
      detachedDraftIdRef.current = String(initial?.draftId || token || '')
      const initialFiles = Array.isArray(initial?.files)
        ? initial.files.map((file: any) => uploadPayloadToFile({ ...file, name: String(file.name || 'Datei') }))
        : []
      openedRef.current = true
      if (initial?.mode === 'invoice') {
        setReceiptIntake(Boolean(initial.receiptIntake))
        setReceiptOrganization(initial.organization || null)
        setWindowModeKind('invoice')
        setInvoiceDraftFile(initialFiles[0] || null)
        setInvoiceDraftState((initial?.invoiceState as LocalInvoiceScanDraftState) || null)
        setInvoiceDraftGuidance((initial?.invoiceGuidance as InvoiceAiGuidance) || undefined)
      } else if (initial?.mode === 'details') {
        setWindowModeKind('details')
        const initialVoucher = initial?.voucher || initial?.qa || null
        if (initialVoucher?.id) {
          setDetailVoucher(initialVoucher)
        } else if (initial?.voucherId) {
          try {
            const res = await window.api?.vouchers.list?.({
              limit: 1,
              voucherIds: [Number(initial.voucherId)]
            })
            setDetailVoucher((res as any)?.rows?.[0] || null)
          } catch {
            setDetailVoucher(null)
          }
        }
      } else if (initial?.mode === 'edit') {
        const initialRow = initial?.qa || initial?.voucher || { id: initial?.voucherId }
        let currentRow = initialRow
        const voucherId = Number(initial?.voucherId || initialRow?.id || 0)
        if (voucherId > 0) {
          try {
            const refreshed = await window.api?.vouchers.list?.({ limit: 1, voucherIds: [voucherId] })
            const freshRow = (refreshed as any)?.rows?.[0]
            if (freshRow) currentRow = { ...initialRow, ...freshRow }
          } catch {
            // The initial payload remains a safe fallback if refreshing fails.
          }
        }
        const form = voucherRowToBookingForm(currentRow)
        setWindowModeKind('edit')
        setEditQa(form)
        setEditFiles(initialFiles)
        setEditInitialSnapshot(serializeBookingForm(form))
      } else {
        setWindowModeKind('create')
        openQuickAdd(initial?.qa ? { qa: initial.qa, files: initialFiles } : undefined)
      }
      setLoaded(true)
    }
    openInitialDraft()
    return () => {
      cancelled = true
    }
  }, [openQuickAdd])

  useEffect(() => {
    if (!quickAdd || descSuggest.length > 0) return
    let cancelled = false
    async function loadSuggestions() {
      try {
        const res = await window.api?.vouchers?.recent?.({ limit: 50 })
        const uniq = new Set<string>()
        for (const row of (res as any)?.rows || []) {
          const description = String(row.description || '').trim()
          if (description) uniq.add(description)
          if (uniq.size >= 50) break
        }
        if (!cancelled) setDescSuggest(Array.from(uniq))
      } catch {}
    }
    loadSuggestions()
    return () => {
      cancelled = true
    }
  }, [quickAdd, descSuggest.length])

  useEffect(() => {
    if (windowModeKind === 'create' && openedRef.current && loaded && !quickAdd) {
      window.api?.window?.confirmClose?.()
    }
  }, [loaded, quickAdd, windowModeKind])

  const syncDetachedInvoiceDraft = useCallback(async () => {
    if (receiptIntake) return
    if (!detachedDraftIdRef.current) return
    const encodedFiles = invoiceDraftFile
      ? [await encodeFileForUpload(invoiceDraftFile)]
      : []
    await window.api?.quickAdd?.syncDraft?.({
      draftId: detachedDraftIdRef.current,
      files: encodedFiles,
      invoiceState: invoiceDraftState || undefined,
      invoiceGuidance: invoiceDraftGuidance,
      kind: 'invoice',
      detached: true
    })
  }, [invoiceDraftFile, invoiceDraftGuidance, invoiceDraftState, receiptIntake])

  useEffect(() => {
    if (windowModeKind !== 'invoice' || !loaded || !invoiceDraftFile) return
    const timeout = window.setTimeout(() => {
      void syncDetachedInvoiceDraft()
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [invoiceDraftFile, invoiceDraftState, loaded, syncDetachedInvoiceDraft, windowModeKind])

  useEffect(() => {
    if (windowModeKind !== 'invoice' || !loaded) return
    void window.api?.window?.setInvoiceScanExpanded?.(!!invoiceDraftFile)
  }, [invoiceDraftFile, loaded, windowModeKind])

  const isCreateDraftDirty = useCallback(() => {
    if (!qa) return false
    const draft = qa as any
    const textFields = ['description', 'voucherNo', 'note', 'receiptNo']
    if (textFields.some((key) => String(draft?.[key] ?? '').trim())) return true
    if (Number(draft?.grossAmount || 0) > 0 || Number(draft?.netAmount || 0) > 0) return true
    if (draft?.budgetId || draft?.earmarkId || draft?.tagIds?.length) return true
    if (files.length > 0) return true
    return false
  }, [files.length, qa])

  const requestCloseDetachedCreate = useCallback(() => {
    if (
      shouldPromptDiscardForDraftClose({
        showBookingDraftTabs,
        hasUnsavedChanges: isCreateDraftDirty()
      })
    ) {
      setConfirmDiscardCreate(true)
      return
    }
    if (showBookingDraftTabs && detachedDraftIdRef.current) {
      const draftId = detachedDraftIdRef.current
      void (async () => {
        try {
          const encodedFiles = await encodeFilesForUpload(files)
          await window.api?.quickAdd?.syncDraft?.({
            draftId,
            qa,
            files: encodedFiles,
            detached: false
          })
        } catch {
          // Closing the detached window should still succeed even if the last sync fails.
        }
        await window.api?.window?.confirmClose?.()
      })()
      return
    }
    window.api?.window?.confirmClose?.()
  }, [files, isCreateDraftDirty, qa, showBookingDraftTabs])

  useEffect(() => {
    const draftId = detachedDraftIdRef.current
    if (!loaded || !quickAdd || !draftId) return
    const timeout = window.setTimeout(() => {
      void window.api?.quickAdd?.syncDraft?.({ draftId, qa })
    }, 200)
    return () => window.clearTimeout(timeout)
  }, [loaded, quickAdd, qa])

  useEffect(() => {
    const draftId = detachedDraftIdRef.current
    if (!loaded || !quickAdd || !draftId) return
    let cancelled = false
    async function syncFiles() {
      const encoded = await encodeFilesForUpload(files)
      if (!cancelled) void window.api?.quickAdd?.syncDraft?.({ draftId, files: encoded })
    }
    syncFiles()
    return () => {
      cancelled = true
    }
  }, [files, loaded, quickAdd])

  const refreshEditAttachments = useCallback(async (voucherId: number) => {
    setEditExistingFilesLoading(true)
    try {
      const res = await window.api?.attachments.list?.({ voucherId })
      setEditExistingFiles((res as any)?.files || (res as any)?.rows || [])
    } catch {
      setEditExistingFiles([])
    } finally {
      setEditExistingFilesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (windowModeKind !== 'edit' || !editQa?.id) return
    void refreshEditAttachments(Number(editQa.id))
  }, [editQa?.id, refreshEditAttachments, windowModeKind])

  const savingEdit = useRef(false)
  const saveDetachedEdit = useCallback(async () => {
    if (!editQa?.id || savingEdit.current) return
    const { payload, error } = buildVoucherUpdatePayloadFromForm(editQa)
    if (!payload) {
      notify('error', error)
      return
    }
    savingEdit.current = true
    try {
      const res = await persistBookingEdit(payload, editFiles, file => {
        setEditFiles(current => current.filter(item => item !== file))
      })
      notify('success', 'Buchung gespeichert')
      const warnings = res?.warnings
      if (warnings?.length) warnings.forEach((msg) => notify('info', 'Warnung: ' + msg))
      await window.api?.quickAdd?.notifySaved?.({
        id: Number(editQa.id),
        draftId: detachedDraftIdRef.current,
        mode: 'edit'
      })
      window.api?.window?.confirmClose?.()
    } catch (e: any) {
      notify('error', friendlyVoucherError(e))
    } finally {
      savingEdit.current = false
    }
  }, [editFiles, editQa, notify])

  const requestCloseDetachedEdit = useCallback(() => {
    if (savingEdit.current) return
    if (
      shouldPromptDiscardForEdit({
        showBookingEditTabs,
        hasUnsavedChanges: Boolean(
          editQa && (serializeBookingForm(editQa) !== editInitialSnapshot || editFiles.length > 0)
        )
      })
    ) {
      setConfirmDiscardEdit(true)
      return
    }
    window.api?.window?.confirmClose?.()
  }, [editFiles.length, editInitialSnapshot, editQa, showBookingEditTabs])

  useEffect(() => {
    return window.api?.window?.onCloseRequested?.(() => {
      if (windowModeKind === 'invoice') {
        if (receiptIntake) { setConfirmDiscardReceipt(true); return }
        void (async () => {
          try {
            await syncDetachedInvoiceDraft()
          } finally {
            window.api?.window?.confirmClose?.()
          }
        })()
        return
      }
      if (windowModeKind === 'details') {
        window.api?.window?.confirmClose?.()
        return
      }
      if (windowModeKind === 'edit') {
        requestCloseDetachedEdit()
        return
      }
      requestCloseDetachedCreate()
    })
  }, [requestCloseDetachedCreate, requestCloseDetachedEdit, syncDetachedInvoiceDraft, windowModeKind, receiptIntake])

  const deleteDetachedEdit = useCallback(async () => {
    if (!editQa?.id) return
    const blockReason = voucherMutationBlockReason(editQa)
    if (blockReason) {
      setConfirmDeleteEdit(false)
      notify('info', blockReason)
      return
    }
    try {
      if (allowVoucherDeletion) {
        await window.api?.vouchers.delete?.({ id: Number(editQa.id) })
        notify('success', 'Buchung gelöscht')
        await window.api?.quickAdd?.notifySaved?.({
          id: Number(editQa.id),
          draftId: detachedDraftIdRef.current,
          mode: 'delete',
          deleted: true
        })
      } else {
        const res = await window.api?.vouchers.reverse?.({
          originalId: Number(editQa.id),
          reason: 'Storno statt Löschen'
        })
        notify('success', `Storno erstellt: #${res?.voucherNo || ''}`)
        await window.api?.quickAdd?.notifySaved?.({
          id: res?.id,
          originalId: Number(editQa.id),
          draftId: detachedDraftIdRef.current,
          mode: 'reverse'
        })
      }
      window.api?.window?.confirmClose?.()
    } catch (e: any) {
      notify('error', e?.message || String(e))
    }
  }, [allowVoucherDeletion, editQa, notify])

  const reverseDetachedDetails = useCallback(async () => {
    if (!detailVoucher?.id) return
    try {
      const res = await window.api?.vouchers.reverse?.({
        originalId: Number(detailVoucher.id),
        reason: 'Storno statt Löschen'
      })
      setConfirmDetailReverse(false)
      notify('success', `Storno erstellt: #${res?.voucherNo || ''}`)
      const refreshed = await window.api?.vouchers.list?.({
        limit: 1,
        voucherIds: [Number(detailVoucher.id)]
      })
      const next = (refreshed as any)?.rows?.[0]
      if (next) setDetailVoucher(next)
      dispatchDataChanged(['vouchers'])
      await window.api?.quickAdd?.notifySaved?.({
        id: res?.id,
        originalId: Number(detailVoucher.id),
        draftId: detachedDraftIdRef.current,
        mode: 'reverse'
      })
    } catch (e: any) {
      notify('error', e?.message || String(e))
    }
  }, [detailVoucher, notify])

  useEffect(() => {
    if (windowModeKind !== 'edit' || !editQa) return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveDetachedEdit()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
        e.preventDefault()
        const blockReason = voucherMutationBlockReason(editQa)
        if (blockReason) {
          notify('info', blockReason)
          return
        }
        fileInputRef.current?.click()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        requestCloseDetachedEdit()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editQa, notify, requestCloseDetachedEdit, saveDetachedEdit, windowModeKind])

  if (
    !loaded ||
    (windowModeKind === 'create' && !quickAdd) ||
    (windowModeKind === 'edit' && !editQa) ||
    (windowModeKind === 'details' && !detailVoucher)
  ) {
    return <div className="detached-quick-add-loading">Buchungsfenster wird vorbereitet...</div>
  }

  if (windowModeKind === 'invoice') {
    return (
      <>
      <LocalInvoiceScanModal
        onClose={() => {
          if (receiptIntake) { setConfirmDiscardReceipt(true); return }
          void (async () => {
            try {
              await syncDetachedInvoiceDraft()
            } finally {
              window.api?.window?.confirmClose?.()
            }
          })()
        }}
        onCreateInvoice={async (result) => {
          if (receiptIntake) {
            const active = await window.api.organizations.active()
            if ((active.organization?.id || 'default') !== (receiptOrganization?.id || 'default')) {
              notify('error', 'Der aktive Verein hat sich geändert. Bitte den Beleg erneut öffnen.')
              return false
            }
          }
          const converted = scannedInvoiceToBooking(result)
          if (!converted.initial) {
            notify('error', `Bitte ergänze: ${(converted.missing || []).join(', ')}.`)
            return false
          }
          if (receiptIntake && receiptTarget === 'invoice') {
            if (!result.fields.invoiceNumber.trim()) { notify('error', 'Bitte ergänze: Rechnungsnummer.'); return false }
            await window.api.invoices.create({
              date: result.fields.invoiceDate, dueDate: result.fields.dueDate || null,
              invoiceNo: result.fields.invoiceNumber.trim(), party: result.fields.supplier.trim(), partyId: result.partyId,
              description: converted.initial.qa.description || null, note: converted.initial.qa.note || null,
              grossAmount: converted.initial.qa.grossAmount!,
              paymentMethod: result.bookingMeta.paymentMethod || null, paymentAccountId: result.bookingMeta.paymentAccountId ?? null,
              sphere: result.bookingMeta.sphere || 'IDEELL', primaryClassificationValueId: result.bookingMeta.primaryClassificationValueId ?? null,
              budgets: result.budgets, earmarks: result.earmarksAssigned,
              budgetId: result.budgets[0]?.budgetId ?? null, earmarkId: result.earmarksAssigned[0]?.earmarkId ?? null,
              autoPost: true, voucherType: 'OUT', files: await encodeFilesForUpload([result.file]), tags: result.tags
            })
            dispatchDataChanged(['invoices'])
            await window.api.quickAdd.notifySaved({ draftId: detachedDraftIdRef.current, kind: 'invoice' })
            await window.api.window.confirmClose()
            return true
          }
          const encodedFiles = await encodeFilesForUpload(converted.initial.files)
          await window.api?.quickAdd?.syncDraft?.({
            draftId: detachedDraftIdRef.current,
            qa: converted.initial.qa,
            files: encodedFiles,
            kind: 'booking',
            detached: true
          })
          setWindowModeKind('create')
          openQuickAdd(converted.initial)
          return true
        }}
        budgetsForEdit={budgetsForEdit}
        earmarks={earmarks}
        tagDefs={tagDefs}
        submitLabel={receiptIntake && receiptTarget === 'invoice' ? 'Offene Rechnung anlegen' : 'Als Buchung übernehmen'}
        intakeHeader={receiptIntake ? <div className="receipt-intake-choice">
          <strong>{receiptOrganization?.name || 'VereinO'}</strong>
          <div className="btn-group" role="group" aria-label="Beleg verwenden als">
            <button type="button" className={`btn ${receiptTarget === 'booking' ? 'primary' : ''}`} aria-pressed={receiptTarget === 'booking'} onClick={() => setReceiptTarget('booking')}>Buchung erfassen</button>
            <button type="button" className={`btn ${receiptTarget === 'invoice' ? 'primary' : ''}`} aria-pressed={receiptTarget === 'invoice'} onClick={() => setReceiptTarget('invoice')}>Offene Rechnung anlegen</button>
          </div>
          <span>{receiptTarget === 'booking' ? 'Eine Einnahme oder Ausgabe mit diesem Beleg erfassen.' : 'Eine noch zu bezahlende Rechnung als Verbindlichkeit vormerken.'}</span>
        </div> : undefined}
        commentAriaLabel="Kommentar zur Buchung"
        closeOnCreate={false}
        initialFile={invoiceDraftFile || undefined}
        initialState={invoiceDraftState || undefined}
        aiGuidance={invoiceDraftGuidance}
        onDraftChange={(state) => {
          setInvoiceDraftFile(state.file)
          setInvoiceDraftState(state)
        }}
        onFileChange={setInvoiceDraftFile}
      />
      {confirmDiscardReceipt && <DiscardReceiptModal fileName={invoiceDraftFile?.name}
        onCancel={() => { setConfirmDiscardReceipt(false); void window.api.window.cancelClose() }}
        onDiscard={() => void window.api.window.confirmClose()} />}
      </>
    )
  }

  if (windowModeKind === 'details' && detailVoucher) {
    return (
      <>
        <VoucherInfoModal
          voucher={detailVoucher}
          suspended={!!detailAttachmentsVoucher}
          onClose={() => window.api?.window?.confirmClose?.()}
          eurFmt={eurFmt}
          fmtDate={fmtDate}
          notify={notify}
          earmarks={earmarks}
          budgets={budgetsForEdit}
          tagDefs={tagDefs}
          allowVoucherDeletion={allowVoucherDeletion}
          windowMode
          onOpenAttachments={() => {
            setDetailAttachmentsVoucher({
              voucherId: detailVoucher.id,
              voucherNo: detailVoucher.voucherNo,
              date: detailVoucher.date,
              description: detailVoucher.description || ''
            })
          }}
          onSaveMeta={async (payload) => {
            const res = await window.api?.vouchers.updateMeta?.({
              id: detailVoucher.id,
              note: payload.note,
              budgets: payload.budgets,
              earmarks: payload.earmarks,
              tags: payload.tags
            })
            if (!res) throw new Error('Buchungsdetails konnten nicht gespeichert werden.')
            const refreshed = await window.api?.vouchers.list?.({
              limit: 1,
              voucherIds: [detailVoucher.id]
            })
            const next = (refreshed as any)?.rows?.[0]
            if (next) setDetailVoucher(next)
            dispatchDataChanged(['vouchers'])
            await window.api?.quickAdd?.notifySaved?.({
              id: detailVoucher.id,
              draftId: detachedDraftIdRef.current,
              mode: 'details'
            })
          }}
          onReverse={() => setConfirmDetailReverse(true)}
        />
        {confirmDetailReverse && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            onClick={() => setConfirmDetailReverse(false)}
            style={{ zIndex: 16000, alignItems: 'center', paddingTop: 0 }}
          >
            <div
              className="modal modal-inset-header"
              onClick={(e) => e.stopPropagation()}
              style={{ width: 'min(460px, 92vw)' }}
            >
              <ModalHeader title="Buchung stornieren" onClose={() => setConfirmDetailReverse(false)} />
              <p>
                Möchtest du die Buchung{' '}
                <strong>
                  #{detailVoucher.voucherNo}
                  {detailVoucher.description ? ` - ${detailVoucher.description}` : ''}
                </strong>{' '}
                stornieren? Die Originalbuchung bleibt erhalten und es wird eine Gegenbuchung
                erstellt.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button className="btn" onClick={() => setConfirmDetailReverse(false)}>
                  Abbrechen
                </button>
                <button
                  className="btn danger"
                  onClick={() => {
                    void reverseDetachedDetails()
                  }}
                >
                  Ja, stornieren
                </button>
              </div>
            </div>
          </div>
        )}
        {detailAttachmentsVoucher && (
          <AttachmentsModal
            voucher={detailAttachmentsVoucher}
            onClose={() => setDetailAttachmentsVoucher(null)}
            onChanged={async () => {
              await refreshDetailVoucher()
            }}
          />
        )}
      </>
    )
  }

  if (windowModeKind === 'edit' && editQa) {
    const editMutationBlockReason = voucherMutationBlockReason(editQa)
    return (
      <>
        <QuickAddModal notify={notify}
          qa={editQa}
          setQa={next => setEditQa({ ...editQa, ...next, id: editQa.id })}
          onSave={saveDetachedEdit}
          saveLabel="Speichern"
          showSaveMenu={false}
          footerLeft={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {editMutationBlockReason ? (
                <div className="helper">{editMutationBlockReason}</div>
              ) : (
                <button
                  type="button"
                  className="btn danger"
                  title={allowVoucherDeletion ? 'Löschen' : 'Stornieren'}
                  onClick={() => setConfirmDeleteEdit(true)}
                >
                  {allowVoucherDeletion ? 'Löschen' : 'Stornieren'}
                </button>
              )}
              <div className="helper">
                Ctrl+S = Speichern · Ctrl+U = Datei hinzufügen · Esc = Abbrechen
              </div>
            </div>
          }
          onClose={requestCloseDetachedEdit}
          onRequestClose={requestCloseDetachedEdit}
          confirmingClose={confirmDiscardEdit}
          onConfirmDiscard={() => window.api?.window?.confirmClose?.()}
          onCancelDiscard={() => {
            setConfirmDiscardEdit(false)
            void window.api?.window?.cancelClose?.()
          }}
          files={editFiles}
          setFiles={setEditFiles}
          openFilePicker={() => {
            if (editMutationBlockReason) {
              notify('info', editMutationBlockReason)
              return
            }
            fileInputRef.current?.click()
          }}
          onDropFiles={(fileList) => {
            if (editMutationBlockReason) {
              notify('info', editMutationBlockReason)
              return
            }
            if (!fileList) return
            setEditFiles((prev) => [...prev, ...Array.from(fileList)])
          }}
          fileInputRef={fileInputRef}
          fmtDate={fmtDate}
          eurFmt={eurFmt}
          budgetsForEdit={budgetsForEdit}
          earmarks={earmarks}
          paymentAccounts={paymentAccounts}
          tagDefs={tagDefs}
          descSuggest={descSuggest}
          title={bookingEditTitle(editQa)}
          existingFiles={editExistingFiles}
          existingFilesLoading={editExistingFilesLoading}
          onOpenExistingFile={(fileId) => {
            void window.api?.attachments.open?.({ fileId })
          }}
          onDownloadExistingFile={async (fileId) => {
            try {
              const res = await window.api?.attachments.saveAs?.({ fileId })
              if (res?.filePath) notify('success', 'Gespeichert: ' + res.filePath)
            } catch (e: any) {
              const msg = String(e?.message || e)
              if (!/Abbruch/i.test(msg)) notify('error', 'Speichern fehlgeschlagen: ' + msg)
            }
          }}
          onDeleteExistingFile={async (file) => {
            if (editMutationBlockReason) {
              notify('info', editMutationBlockReason)
              return
            }
            try {
              await window.api?.attachments.delete?.({ fileId: file.id })
              await refreshEditAttachments(Number(editQa.id))
              notify('success', 'Anhang gelöscht')
            } catch (e: any) {
              notify('error', e?.message || String(e))
            }
          }}
          windowMode
        />
        {confirmDeleteEdit && !editMutationBlockReason && (
          <div className="modal-overlay" role="dialog" aria-modal="true" style={{ zIndex: 10000 }}>
            <div
              className="modal modal-inset-header"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 520, display: 'grid', gap: 12 }}
            >
              <ModalHeader
                title={<>{allowVoucherDeletion ? 'Buchung löschen' : 'Buchung stornieren'}</>}
                onClose={() => setConfirmDeleteEdit(false)}
                closeLabel="Schließen"
                closeOnEscape={false}
              />
              <p style={{ margin: 0 }}>
                {allowVoucherDeletion
                  ? 'Möchtest du diese Buchung wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.'
                  : 'Möchtest du diese Buchung stornieren? Die Originalbuchung bleibt erhalten und es wird eine Gegenbuchung erstellt.'}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn" onClick={() => setConfirmDeleteEdit(false)}>
                  Abbrechen
                </button>
                <button
                  className="btn danger"
                  onClick={() => {
                    void deleteDetachedEdit()
                  }}
                >
                  {allowVoucherDeletion ? 'Ja, löschen' : 'Ja, stornieren'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <QuickAddModal notify={notify}
      qa={qa}
      setQa={setQa}
      onSave={onQuickSave}
      onSaveAndNew={() => onQuickSave('new')}
      onSaveAndClose={() => onQuickSave('close')}
      afterSaveDefault={quickAddAfterSave}
      onClose={requestCloseDetachedCreate}
      onRequestClose={requestCloseDetachedCreate}
      files={files}
      setFiles={setFiles}
      openFilePicker={openFilePicker}
      onDropFiles={onDropFiles}
      fileInputRef={fileInputRef}
      fmtDate={fmtDate}
      eurFmt={eurFmt}
      budgetsForEdit={budgetsForEdit}
      earmarks={earmarks}
      paymentAccounts={paymentAccounts}
      tagDefs={tagDefs}
      descSuggest={descSuggest}
      windowMode
      confirmingClose={confirmDiscardCreate}
      onConfirmDiscard={() => window.api?.window?.confirmClose?.()}
      onCancelDiscard={() => {
        setConfirmDiscardCreate(false)
        void window.api?.window?.cancelClose?.()
      }}
    />
  )
}
