import React, { useEffect, useMemo, useState } from 'react'
import { useToast } from '../../context/useToast'
import InvoiceDetailModal from '../invoicesShared/InvoiceDetailModal'
import InvoiceFormModal from '../invoicesShared/InvoiceFormModal'
import type {
  EditInvoiceFile,
  InvoiceBudgetAssignment,
  InvoiceDetail,
  InvoiceDraft,
  InvoiceEarmarkAssignment,
  InvoiceFormState,
  InvoiceListRow,
  InvoicePaymentAccountOption,
  InvoiceStatus
} from '../invoicesShared/types'

function contrastText(bg?: string | null) {
  if (!bg) return '#000'
  const m = /^#?([0-9a-fA-F]{6})$/.exec(bg.trim())
  if (!m) return '#000'
  const hex = m[1]
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#000' : '#fff'
}

function TimeFilterModal({ open, onClose, yearsAvail, from, to, onApply }: { open: boolean; onClose: () => void; yearsAvail: number[]; from: string; to: string; onApply: (v: { from: string; to: string }) => void }) {
  const [f, setF] = useState<string>(from)
  const [t, setT] = useState<string>(to)
  useEffect(() => { setF(from); setT(to) }, [from, to, open])
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Zeitraum wählen</h2>
          <button className="btn danger" onClick={onClose}>Schließen</button>
        </header>
        <div className="row">
          <div className="field">
            <label>Von</label>
            <input className="input" type="date" value={f} onChange={(e) => setF(e.target.value)} />
          </div>
          <div className="field">
            <label>Bis</label>
            <input className="input" type="date" value={t} onChange={(e) => setT(e.target.value)} />
          </div>
          <div className="field" style={{ gridColumn: '1 / span 2' }}>
            <label>Schnellauswahl Jahr</label>
            <select className="input" value={(() => { if (!f || !t) return ''; const fy = f.slice(0, 4); const ty = t.slice(0, 4); return f === `${fy}-01-01` && t === `${fy}-12-31` && fy === ty ? fy : '' })()} onChange={(e) => { const y = e.target.value; if (!y) { setF(''); setT(''); return }; const yr = Number(y); setF(new Date(Date.UTC(yr, 0, 1)).toISOString().slice(0, 10)); setT(new Date(Date.UTC(yr, 11, 31)).toISOString().slice(0, 10)) }}>
              <option value="">—</option>
              {yearsAvail.map((y) => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <button className="btn" onClick={() => { setF(''); setT('') }}>Zurücksetzen</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Abbrechen</button>
            <button className="btn primary" onClick={() => { onApply({ from: f, to: t }); onClose() }}>Übernehmen</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionMenu({ actions }: { actions: Array<{ label: string; tone?: 'danger'; onClick: () => void }> }) {
  return (
    <details style={{ position: 'relative', display: 'inline-block' }}>
      <summary className="btn" style={{ listStyle: 'none', cursor: 'pointer', minWidth: 40, textAlign: 'center' }}>...</summary>
      <div className="card" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 15, padding: 6, display: 'grid', gap: 6, minWidth: 140 }}>
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={`btn ${action.tone === 'danger' ? 'danger' : ''}`.trim()}
            onClick={(event) => {
              event.preventDefault()
              action.onClick()
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </details>
  )
}

function bufferToBase64(buffer: ArrayBuffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode.apply(null as never, bytes.subarray(index, index + chunk) as never)
  }
  return btoa(binary)
}

function parseAmount(input: string): number | null {
  if (!input) return null
  const normalized = input.replace(/\./g, '').replace(',', '.')
  const value = Number(normalized)
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null
}

function firstBudgetId(budgets: InvoiceBudgetAssignment[]) {
  return typeof budgets[0]?.budgetId === 'number' && budgets[0].budgetId > 0 ? budgets[0].budgetId : ''
}

function firstEarmarkId(earmarks: InvoiceEarmarkAssignment[]) {
  return typeof earmarks[0]?.earmarkId === 'number' && earmarks[0].earmarkId > 0 ? earmarks[0].earmarkId : ''
}

function normalizeInvoiceDraft(row?: Partial<InvoiceListRow> | Partial<InvoiceDetail>): InvoiceDraft {
  const budgets = Array.isArray(row?.budgets) && row?.budgets.length
    ? row.budgets.map((item) => ({ budgetId: Number(item.budgetId || 0), amount: Number(item.amount || 0) }))
    : typeof row?.budgetId === 'number'
      ? [{ budgetId: row.budgetId, amount: Number((row as any)?.grossAmount || 0) }]
      : []
  const earmarks = Array.isArray(row?.earmarks) && row?.earmarks.length
    ? row.earmarks.map((item) => ({ earmarkId: Number(item.earmarkId || 0), amount: Number(item.amount || 0) }))
    : typeof row?.earmarkId === 'number'
      ? [{ earmarkId: row.earmarkId, amount: Number((row as any)?.grossAmount || 0) }]
      : []
  return {
    id: row?.id,
    date: row?.date || new Date().toISOString().slice(0, 10),
    dueDate: row?.dueDate ?? null,
    invoiceNo: row?.invoiceNo ?? '',
    party: row?.party ?? '',
    description: row?.description ?? '',
    grossAmount: row?.grossAmount != null ? String(row.grossAmount) : '',
    paymentMethod: ((row?.paymentMethod as InvoiceDraft['paymentMethod']) ?? ''),
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

export default function InvoicesView() {
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
  const [summary, setSummary] = useState<{ count: number; gross: number; paid: number; remaining: number } | null>(null)
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>(() => { try { return ((localStorage.getItem('invoices.sort') as 'ASC' | 'DESC') || 'ASC') } catch { return 'ASC' } })
  const [sortBy, setSortBy] = useState<'date' | 'due' | 'amount' | 'status'>(() => { try { return ((localStorage.getItem('invoices.sortBy') as 'date' | 'due' | 'amount' | 'status') || 'due') } catch { return 'due' } })
  const [showDueFilter, setShowDueFilter] = useState(false)
  const [yearsAvail, setYearsAvail] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<InvoiceListRow[]>([])
  const [error, setError] = useState('')
  const [tags, setTags] = useState<Array<{ id: number; name: string; color?: string | null }>>([])
  const [budgets, setBudgets] = useState<Array<{ id: number; name?: string | null; year: number }>>([])
  const [earmarks, setEarmarks] = useState<Array<{ id: number; code: string; name: string; color?: string | null }>>([])
  const [paymentAccounts, setPaymentAccounts] = useState<InvoicePaymentAccountOption[]>([])
  const [flashId, setFlashId] = useState<number | null>(null)
  const [busyAction, setBusyAction] = useState(false)
  const [showPayModal, setShowPayModal] = useState<null | { id: number; party?: string; invoiceNo?: string | null; remaining: number }>(null)
  const [payDate, setPayDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [payAmount, setPayAmount] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<null | { id: number; party?: string; invoiceNo?: string | null }>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [detail, setDetail] = useState<InvoiceDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [form, setForm] = useState<InvoiceFormState | null>(null)
  const [formFiles, setFormFiles] = useState<File[]>([])
  const [editInvoiceFiles, setEditInvoiceFiles] = useState<EditInvoiceFile[]>([])
  const [formError, setFormError] = useState('')
  const [requiredTouched, setRequiredTouched] = useState(false)

  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const dateFmtPref = useMemo(() => { try { return (localStorage.getItem('ui.dateFmt') as 'ISO' | 'PRETTY' | 'DOT') || 'ISO' } catch { return 'ISO' } }, [])
  const fmtDateLocal = useMemo(() => {
    const pretty = (value?: string) => {
      if (!value) return ''
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
      if (!match) return value || ''
      const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
      return `${match[3]} ${date.toLocaleString('de-DE', { month: 'short' }).replace('.', '')} ${match[1]}`
    }
    const dot = (value?: string) => {
      if (!value) return ''
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
      if (!match) return value || ''
      return `${match[3]}.${match[2]}.${match[1]}`
    }
    return (value?: string) => dateFmtPref === 'PRETTY' ? pretty(value) : dateFmtPref === 'DOT' ? dot(value) : (value || '')
  }, [dateFmtPref])

  const [qDebounced, setQDebounced] = useState('')
  useEffect(() => { const timer = setTimeout(() => setQDebounced(q.trim()), 250); return () => clearTimeout(timer) }, [q])

  const partySuggestions = useMemo(() => Array.from(new Set(rows.map((row) => row.party).filter(Boolean))).sort().slice(0, 30), [rows])
  const descSuggestions = useMemo(() => Array.from(new Set(rows.map((row) => row.description || '').filter(Boolean))).sort().slice(0, 30), [rows])
  const missingRequiredFields = useMemo(() => {
    if (!form) return []
    const fields: string[] = []
    if (!form.draft.date) fields.push('Datum')
    if (!form.draft.party.trim()) fields.push('Partei')
    if (!(form.draft.invoiceNo || '').trim()) fields.push(form.draft.voucherType === 'IN' ? 'Forderungsnummer' : 'Verbindlichkeitsnummer')
    const amount = parseAmount(form.draft.grossAmount)
    if (amount == null || amount <= 0) fields.push('Betrag')
    return fields
  }, [form])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const result = await window.api?.invoices?.list?.({ limit, offset, sort: sortDir, sortBy, status, sphere: sphere || undefined, budgetId: typeof budgetId === 'number' ? budgetId : undefined, q: qDebounced || undefined, dueFrom: dueFrom || undefined, dueTo: dueTo || undefined, tag: tag || undefined })
      setRows(result?.rows || [])
      setTotal(result?.total || 0)
    } catch (loadError: any) {
      setError(loadError?.message || String(loadError))
    } finally {
      setLoading(false)
    }
  }

  async function loadSummary() {
    try {
      const result = await window.api?.invoices?.summary?.({ status, sphere: sphere || undefined, budgetId: typeof budgetId === 'number' ? budgetId : undefined, q: qDebounced || undefined, dueFrom: dueFrom || undefined, dueTo: dueTo || undefined, tag: tag || undefined })
      setSummary(result || null)
    } catch {
      setSummary(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [tagsResult, budgetsResult, earmarksResult, yearsResult, paymentAccountsResult] = await Promise.all([
          window.api?.tags?.list?.({}),
          window.api?.budgets?.list?.({}),
          window.api?.bindings?.list?.({ activeOnly: true }),
          window.api?.reports?.years?.(),
          window.api?.paymentAccounts?.list?.({ activeOnly: true })
        ])
        if (cancelled) return
        setTags((tagsResult?.rows || []).map((row) => ({ id: row.id, name: row.name, color: row.color ?? null })))
        setBudgets((budgetsResult?.rows || []).map((row) => ({ id: row.id, name: row.name || row.categoryName || row.projectName || undefined, year: row.year })))
        setEarmarks((earmarksResult?.rows || []).map((row) => ({ id: row.id, code: row.code, name: row.name, color: row.color ?? null })))
        setYearsAvail(yearsResult?.years || [])
        setPaymentAccounts((paymentAccountsResult?.rows || []).map((row) => ({ id: row.id, name: row.name, kind: row.kind, color: row.color ?? null, isActive: row.isActive })))
      } catch {
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => { void load() }, [limit, offset, status, sphere, budgetId, qDebounced, dueFrom, dueTo, tag, sortDir, sortBy])
  useEffect(() => { void loadSummary() }, [status, sphere, budgetId, qDebounced, dueFrom, dueTo, tag])
  useEffect(() => { try { localStorage.setItem('invoices.sort', sortDir) } catch {} }, [sortDir])
  useEffect(() => { try { localStorage.setItem('invoices.sortBy', sortBy) } catch {} }, [sortBy])
  useEffect(() => {
    const onChanged = () => { void load(); void loadSummary() }
    try { window.addEventListener('data-changed', onChanged) } catch {}
    return () => { try { window.removeEventListener('data-changed', onChanged) } catch {} }
  }, [status, sphere, budgetId, qDebounced, dueFrom, dueTo, tag, limit, offset, sortDir, sortBy])

  useEffect(() => {
    let alive = true
    async function loadFiles() {
      if (!form || form.mode !== 'edit' || !form.draft.id) {
        if (alive) setEditInvoiceFiles([])
        return
      }
      try {
        const result = await window.api?.invoiceFiles?.list?.({ invoiceId: form.draft.id })
        if (alive) setEditInvoiceFiles(result?.files || [])
      } catch {
      }
    }
    void loadFiles()
    return () => { alive = false }
  }, [form])

  useEffect(() => {
    let cancelled = false
    async function fetchDetail() {
      if (!detailId) return
      setLoadingDetail(true)
      try {
        const result = await window.api?.invoices?.get?.({ id: detailId })
        if (!cancelled) setDetail(result || null)
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
    function onOpen(event: Event) {
      const customEvent = event as CustomEvent<{ id?: number }>
      const id = Number(customEvent.detail?.id)
      if (Number.isFinite(id) && id > 0) setDetailId(id)
    }
    window.addEventListener('open-invoice-details', onOpen)
    return () => window.removeEventListener('open-invoice-details', onOpen)
  }, [])

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

  function openCreate() {
    setForm({ mode: 'create', draft: normalizeInvoiceDraft({ voucherType: 'OUT' }) })
    setFormFiles([])
    setFormError('')
    setRequiredTouched(false)
  }

  function openEdit(row: Partial<InvoiceListRow> | Partial<InvoiceDetail>) {
    setForm({ mode: 'edit', draft: normalizeInvoiceDraft(row), sourceRow: row as InvoiceListRow })
    setFormFiles([])
    setFormError('')
    setRequiredTouched(false)
  }

  async function encodeFiles(files: File[]) {
    return Promise.all(files.map(async (file) => ({
      name: file.name,
      dataBase64: bufferToBase64(await file.arrayBuffer()),
      mime: file.type || undefined
    })))
  }

  async function refreshDetailIfOpen(invoiceId: number) {
    if (detailId !== invoiceId) return
    try {
      const result = await window.api?.invoices?.get?.({ id: invoiceId })
      setDetail(result || null)
    } catch {
    }
  }

  async function saveForm() {
    if (!form) return
    setFormError('')
    if (missingRequiredFields.length) {
      setFormError('Bitte Pflichtfelder ergänzen.')
      return
    }
    const amount = parseAmount(form.draft.grossAmount)
    if (amount == null || amount <= 0) {
      setFormError('Bitte gültigen Betrag eingeben (> 0)')
      return
    }
    const cleanBudgets = (form.draft.budgets || []).filter((item) => item.budgetId && Number(item.amount) > 0).map((item) => ({ budgetId: Number(item.budgetId), amount: Number(item.amount) }))
    const cleanEarmarks = (form.draft.earmarks || []).filter((item) => item.earmarkId && Number(item.amount) > 0).map((item) => ({ earmarkId: Number(item.earmarkId), amount: Number(item.amount) }))
    const payload = {
      date: form.draft.date,
      dueDate: form.draft.dueDate || null,
      invoiceNo: (form.draft.invoiceNo || '').trim() || null,
      party: form.draft.party.trim(),
      description: (form.draft.description || '').trim() || null,
      grossAmount: amount,
      paymentMethod: form.draft.paymentMethod || null,
      paymentAccountId: typeof form.draft.paymentAccountId === 'number' ? form.draft.paymentAccountId : null,
      sphere: form.draft.sphere,
      earmarkId: typeof cleanEarmarks[0]?.earmarkId === 'number' ? cleanEarmarks[0].earmarkId : null,
      budgetId: typeof cleanBudgets[0]?.budgetId === 'number' ? cleanBudgets[0].budgetId : null,
      budgets: cleanBudgets,
      earmarks: cleanEarmarks,
      autoPost: !!form.draft.autoPost,
      voucherType: form.draft.voucherType,
      tags: form.draft.tags || []
    }
    try {
      if (form.mode === 'create') {
        const files = formFiles.length ? await encodeFiles(formFiles) : undefined
        const result = await window.api?.invoices?.create?.({ ...payload, files } as any)
        if (result?.id) {
          setForm(null)
          setFormFiles([])
          setOffset(0)
          setFlashId(result.id)
          window.setTimeout(() => setFlashId((current) => current === result.id ? null : current), 3000)
          await Promise.all([load(), loadSummary()])
        }
      } else {
        const result = await window.api?.invoices?.update?.({ id: form.draft.id!, ...payload } as any)
        if (result?.id) {
          setForm(null)
          setFlashId(result.id)
          window.setTimeout(() => setFlashId((current) => current === result.id ? null : current), 3000)
          await Promise.all([load(), loadSummary(), refreshDetailIfOpen(result.id)])
        }
      }
    } catch (saveError: any) {
      setFormError(saveError?.message || String(saveError))
    }
  }

  async function addPayment() {
    if (!showPayModal) return
    const amount = Number(payAmount.replace(',', '.'))
    if (!Number.isFinite(amount) || Math.abs(amount) < 0.01) {
      notify('error', 'Bitte einen Betrag angeben')
      return
    }
    const remainingCap = Math.max(0, Math.round(showPayModal.remaining * 100) / 100)
    if (amount - remainingCap > 1e-6) {
      notify('error', `Der Betrag übersteigt den offenen Rest (${eurFmt.format(remainingCap)}).`)
      return
    }
    setBusyAction(true)
    try {
      const result = await window.api?.invoices?.addPayment?.({ invoiceId: showPayModal.id, date: payDate, amount })
      if (result) {
        const invoiceRow = rows.find((row) => row.id === showPayModal.id)
        const hasAutoPost = invoiceRow && !!(invoiceRow.autoPost ?? 0)
        setRows((current) => current.map((row) => row.id === showPayModal.id ? { ...row, paidSum: result.paidSum ?? ((row.paidSum || 0) + amount), status: result.status } : row))
        if (result.status === 'PAID' && hasAutoPost) {
          notify('success', `Verbindlichkeit ${showPayModal.invoiceNo || `#${showPayModal.id}`} wurde automatisch als Buchung gebucht`)
        }
        setShowPayModal(null)
        await Promise.all([loadSummary(), refreshDetailIfOpen(result.id)])
        try { window.dispatchEvent(new Event('data-changed')) } catch {}
      }
    } catch (paymentError: any) {
      notify('error', paymentError?.message || String(paymentError))
    } finally {
      setBusyAction(false)
    }
  }

  async function deleteInvoice(id: number) {
    setBusyAction(true)
    try {
      const result = await window.api?.invoices?.delete?.({ id })
      if (result) {
        setRows((current) => current.filter((row) => row.id !== id))
        setTotal((current) => Math.max(0, current - 1))
        setDeleteConfirm(null)
        setForm((current) => current?.draft.id === id ? null : current)
        if (detailId === id) { setDetailId(null); setDetail(null) }
        await loadSummary()
      }
    } catch (deleteError: any) {
      notify('error', deleteError?.message || String(deleteError))
    } finally {
      setBusyAction(false)
    }
  }

  async function uploadEditFiles(files: File[]) {
    if (!form?.draft.id) return
    for (const file of files) {
      await window.api?.invoiceFiles?.add?.({
        invoiceId: form.draft.id,
        fileName: file.name,
        dataBase64: bufferToBase64(await file.arrayBuffer()),
        mimeType: file.type || undefined
      })
    }
    const result = await window.api?.invoiceFiles?.list?.({ invoiceId: form.draft.id })
    setEditInvoiceFiles(result?.files || [])
    await refreshDetailIfOpen(form.draft.id)
  }

  async function deleteEditFile(fileId: number) {
    if (!form?.draft.id) return
    await window.api?.invoiceFiles?.delete?.({ fileId })
    const result = await window.api?.invoiceFiles?.list?.({ invoiceId: form.draft.id })
    setEditInvoiceFiles(result?.files || [])
    await refreshDetailIfOpen(form.draft.id)
  }

  const page = Math.floor(offset / limit) + 1
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)))
  const canPrev = offset > 0
  const canNext = offset + limit < total
  const statusBadge = (value: InvoiceStatus) => {
    const map: Record<InvoiceStatus, string> = { OPEN: 'var(--danger)', PARTIAL: '#f9a825', PAID: 'var(--success)' }
    const bg = map[value] || 'var(--muted)'
    return <span className="badge" style={{ background: bg, color: contrastText(bg) }}>{value}</span>
  }

  return (
    <div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Verbindlichkeiten</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" placeholder="Suche Verbindlichkeiten (Nr., Partei, Text)…" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0) }} style={{ width: 280 }} />
          <select className="input" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setOffset(0) }}>
            <option value="ALL">Alle</option><option value="OPEN">Offen</option><option value="PARTIAL">Teilweise</option><option value="PAID">Bezahlt</option>
          </select>
          <select className="input" value={sphere} onChange={(e) => { setSphere((e.target.value || '') as typeof sphere); setOffset(0) }}>
            <option value="">Sphäre: alle</option><option value="IDEELL">IDEELL</option><option value="ZWECK">ZWECK</option><option value="VERMOEGEN">VERMÖGEN</option><option value="WGB">WGB</option>
          </select>
          <select className="input" value={String(budgetId)} onChange={(e) => { const value = e.target.value; setBudgetId(value ? Number(value) : ''); setOffset(0) }}>
            <option value="">Budget: alle</option>
            {budgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.year}{budget.name ? ` – ${budget.name}` : ''}</option>)}
          </select>
          <select className="input" value={tag} onChange={(e) => { setTag(e.target.value); setOffset(0) }}>
            <option value="">Tag: alle</option>
            {tags.map((tagDef) => <option key={tagDef.id} value={tagDef.name}>{tagDef.name}</option>)}
          </select>
          <span style={{ color: 'var(--text-dim)' }}>Fällig:</span>
          <button className="btn" title="Fälligkeits-Zeitraum/Jahr wählen" onClick={() => setShowDueFilter(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1a11 11 0 1 0 11 11A11.013 11.013 0 0 0 12 1Zm0 20a9 9 0 1 1 9-9 9.01 9.01 0 0 1-9 9Zm.5-14h-2v6l5.2 3.12 1-1.64-4.2-2.48Z" /></svg>
          </button>
          {(dueFrom || dueTo) && <span className="helper">{dueFrom || '—'} – {dueTo || '—'}</span>}
          {(q.trim() || status !== 'ALL' || sphere || budgetId || tag || dueFrom || dueTo) ? <button className="btn ghost" onClick={clearFilters}>Filter zurücksetzen</button> : null}
          <div style={{ width: 12 }} />
          <button className="btn primary" onClick={openCreate}>+ Neu</button>
        </div>
      </div>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      {loading ? <div className="helper">Lade…</div> : (
        <>
          {summary && <div className="helper">Offen gesamt: <strong>{eurFmt.format(Math.max(0, Math.round((summary.remaining || 0) * 100) / 100))}</strong><span style={{ marginLeft: 8, color: 'var(--text-dim)' }}>({summary.count} Verbindlichkeiten; Brutto {eurFmt.format(summary.gross || 0)}, Bezahlt {eurFmt.format(summary.paid || 0)})</span></div>}
          <table cellPadding={6} style={{ width: '100%' }}>
            <thead><tr><th align="center">Typ</th><th align="left"><button className="btn ghost" onClick={() => { setSortBy('date'); setSortDir((current) => sortBy === 'date' ? (current === 'DESC' ? 'ASC' : 'DESC') : (current || 'DESC')); setOffset(0) }} style={{ padding: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}><span>Datum</span><span className="sort-icon" style={{ color: sortBy === 'date' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'date' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span></button></th><th align="left"><button className="btn ghost" onClick={() => { setSortBy('due'); setSortDir((current) => sortBy === 'due' ? (current === 'DESC' ? 'ASC' : 'DESC') : (current || 'ASC')); setOffset(0) }} style={{ padding: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}><span>Fällig</span><span className="sort-icon" style={{ color: sortBy === 'due' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'due' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span></button></th><th align="left">Nr.</th><th align="left">Partei</th><th align="left">Tags</th><th align="right"><button className="btn ghost" onClick={() => { setSortBy('amount'); setSortDir((current) => sortBy === 'amount' ? (current === 'DESC' ? 'ASC' : 'DESC') : (current || 'DESC')); setOffset(0) }} style={{ padding: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}><span>Brutto</span><span className="sort-icon" style={{ color: sortBy === 'amount' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'amount' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span></button></th><th align="right">Bezahlt</th><th align="right">Rest</th><th align="left"><button className="btn ghost" onClick={() => { setSortBy('status'); setSortDir((current) => sortBy === 'status' ? (current === 'DESC' ? 'ASC' : 'DESC') : (current || 'ASC')); setOffset(0) }} style={{ padding: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}><span>Status</span><span className="sort-icon" style={{ color: sortBy === 'status' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'status' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span></button></th><th align="center">📎</th><th align="center">Aktionen</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const remaining = Math.max(0, Math.round((Number(row.grossAmount || 0) - Number(row.paidSum || 0)) * 100) / 100)
                return (
                  <tr key={row.id} className={flashId === row.id ? 'row-flash' : undefined}>
                    <td align="center"><span className="badge" style={{ background: row.voucherType === 'IN' ? 'var(--success)' : 'var(--danger)', color: 'white', padding: '2px 6px' }}>{row.voucherType === 'IN' ? '↑ IN' : '↓ OUT'}</span></td>
                    <td>{fmtDateLocal(row.date)}</td>
                    <td>{fmtDateLocal(row.dueDate || '')}</td>
                    <td>{row.invoiceNo || '—'}</td>
                    <td>{row.party}</td>
                    <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{(row.tags || []).map((entry) => { const def = tags.find((tagDef) => tagDef.name.toLowerCase() === entry.toLowerCase()); const bg = def?.color || undefined; return <button key={entry} className="chip" onClick={() => { setTag(entry); setOffset(0) }} style={bg ? { background: bg, color: contrastText(bg), borderColor: bg } : undefined}>{entry}</button> })}</div></td>
                    <td align="right">{eurFmt.format(row.grossAmount)}</td>
                    <td align="right">{eurFmt.format(row.paidSum || 0)}</td>
                    <td align="right" style={{ color: remaining > 0 ? 'var(--danger)' : 'var(--success)' }}>{eurFmt.format(remaining)}</td>
                    <td>{statusBadge(row.status)}</td>
                    <td align="center">{(row.fileCount || 0) > 0 ? <span className="badge">📎 {row.fileCount}</span> : ''}</td>
                    <td align="center" style={{ whiteSpace: 'nowrap' }}>
                      {(() => {
                        const actions = [
                          { label: 'Info', onClick: () => setDetailId(row.id) },
                          { label: 'Bearbeiten', onClick: () => openEdit(row) },
                          ...(remaining > 0 && row.status !== 'PAID'
                            ? [{ label: 'Zahlung', onClick: () => { setShowPayModal({ id: row.id, party: row.party, invoiceNo: row.invoiceNo || null, remaining }); setPayAmount(String(remaining || '')) } }]
                            : []),
                          { label: 'Löschen', tone: 'danger' as const, onClick: () => setDeleteConfirm({ id: row.id, party: row.party, invoiceNo: row.invoiceNo || null }) }
                        ]
                        return actions.length > 1
                          ? <ActionMenu actions={actions} />
                          : <button className="btn" onClick={actions[0].onClick}>{actions[0].label}</button>
                      })()}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={12} className="helper">Keine Rechnungen gefunden.</td></tr>}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
            <div className="helper">Gesamt: {total}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label className="helper">Pro Seite</label>
              <select className="input" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setOffset(0) }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select>
              <button className="btn" disabled={!canPrev} onClick={() => setOffset(Math.max(0, offset - limit))}>Zurück</button>
              <span className="helper">Seite {page} / {pages}</span>
              <button className="btn" disabled={!canNext} onClick={() => setOffset(offset + limit)}>Weiter</button>
            </div>
          </div>
        </>
      )}

      <TimeFilterModal open={showDueFilter} onClose={() => setShowDueFilter(false)} yearsAvail={yearsAvail} from={dueFrom} to={dueTo} onApply={({ from, to }) => { setDueFrom(from); setDueTo(to); setOffset(0) }} />

      {showPayModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowPayModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0 }}>Zahlung hinzufügen</h2><button className="btn ghost" onClick={() => setShowPayModal(null)}>✕</button></div>
            <div className="helper">{showPayModal.invoiceNo ? `Rechnung ${showPayModal.invoiceNo}` : `Rechnung #${showPayModal.id}`} · {showPayModal.party || ''}</div>
            <div className="helper">Offener Rest: <strong>{eurFmt.format(Math.max(0, Math.round(showPayModal.remaining * 100) / 100))}</strong></div>
            <div className="row">
              <div className="field"><label>Datum</label><input className="input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
              <div className="field"><label>Betrag (EUR)</label><input className="input" type="text" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="z. B. 199,90" /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn" onClick={() => setShowPayModal(null)}>Abbrechen</button><button className="btn primary" disabled={busyAction} onClick={() => void addPayment()}>Speichern</button></div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0 }}>Rechnung löschen</h2><button className="btn ghost" onClick={() => setDeleteConfirm(null)}>✕</button></div>
            <div>Diese Rechnung wirklich löschen?<div className="helper">{deleteConfirm.invoiceNo ? `Nr. ${deleteConfirm.invoiceNo}` : `#${deleteConfirm.id}`} · {deleteConfirm.party || ''}</div></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn" onClick={() => setDeleteConfirm(null)}>Abbrechen</button><button className="btn danger" disabled={busyAction} onClick={() => void deleteInvoice(deleteConfirm.id)}>Ja, löschen</button></div>
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
          partySuggestions={partySuggestions}
          descSuggestions={descSuggestions}
          formFiles={formFiles}
          editInvoiceFiles={editInvoiceFiles}
          onClose={() => setForm(null)}
          onDraftChange={(draft) => setForm((current) => current ? { ...current, draft } : current)}
          onSave={() => void saveForm()}
          onRequestDelete={() => form.draft.id ? setDeleteConfirm({ id: form.draft.id, party: form.draft.party, invoiceNo: form.draft.invoiceNo || null }) : undefined}
          onSetRequiredTouched={setRequiredTouched}
          onRemovePendingFile={(index) => setFormFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))}
          onAddCreateFiles={(files) => setFormFiles((current) => [...current, ...files])}
          onUploadEditFiles={(files) => uploadEditFiles(files)}
          onDeleteEditFile={(fileId) => deleteEditFile(fileId)}
          parseAmount={parseAmount}
        />
      )}

      {detailId != null && (
        <InvoiceDetailModal
          detail={detail}
          loading={loadingDetail}
          tags={tags}
          paymentAccounts={paymentAccounts}
          fmtDateLocal={fmtDateLocal}
          eurFmt={eurFmt}
          statusBadge={statusBadge}
          notify={notify}
          onClose={() => { setDetailId(null); setDetail(null) }}
          onEdit={(currentDetail) => { setDetailId(null); setDetail(null); openEdit(currentDetail) }}
          onTagFilter={(nextTag) => { setTag(nextTag); setOffset(0); setDetailId(null); setDetail(null) }}
          onDetailChange={setDetail}
        />
      )}
    </div>
  )
}
