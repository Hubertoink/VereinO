import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from '../context/ToastContext'
import TimeFilterModal from '../components/modals/TimeFilterModal'
import TagsEditor from '../components/TagsEditor'
import ModalHeader from '../components/ModalHeader'
import LoadingState from '../components/LoadingState'

// Local contrast helper for readable badges
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

export default function InvoicesView() {
  const { notify } = useToast()
  // Filters and pagination
  const [q, setQ] = useState<string>('')
  const [status, setStatus] = useState<'ALL' | 'OPEN' | 'PARTIAL' | 'PAID'>('ALL')
  const [sphere, setSphere] = useState<'' | 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'>('')
  const [dueFrom, setDueFrom] = useState<string>('')
  const [dueTo, setDueTo] = useState<string>('')
  const [budgetId, setBudgetId] = useState<number | ''>('')
  const [tag, setTag] = useState<string>('')
  const [limit, setLimit] = useState<number>(20)
  const [offset, setOffset] = useState<number>(0)
  const [total, setTotal] = useState<number>(0)
  const [summary, setSummary] = useState<{ count: number; gross: number; paid: number; remaining: number; grossIn: number; grossOut: number } | null>(null)
  // Sorting (persist to localStorage)
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>(() => { try { return ((localStorage.getItem('invoices.sort') as 'ASC' | 'DESC') || 'ASC') } catch { return 'ASC' } })
  const [sortBy, setSortBy] = useState<'date' | 'due' | 'amount' | 'status'>(() => { try { return ((localStorage.getItem('invoices.sortBy') as 'date' | 'due' | 'amount' | 'status') || 'due') } catch { return 'due' } })
  // Due date modal state and available years
  const [showDueFilter, setShowDueFilter] = useState<boolean>(false)
  const [yearsAvail, setYearsAvail] = useState<number[]>([])

  // Data
  const [loading, setLoading] = useState<boolean>(true)
  const [rows, setRows] = useState<any[]>([])
  const [error, setError] = useState<string>('')
  const [tags, setTags] = useState<Array<{ id: number; name: string; color?: string | null }>>([])
  const [budgets, setBudgets] = useState<Array<{ id: number; name?: string | null; year: number }>>([])
  const [earmarks, setEarmarks] = useState<Array<{ id: number; code: string; name: string; color?: string | null }>>([])

  // Column preferences
  const [showColumnsModal, setShowColumnsModal] = useState(false)
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
  useEffect(() => { try { localStorage.setItem('invoices.columns', JSON.stringify(colPrefs)) } catch {} }, [colPrefs])

  // Currency/date formatters (respect global date preference if set)
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const dateFmtPref = useMemo(() => { try { return (localStorage.getItem('ui.dateFmt') as 'ISO' | 'PRETTY') || 'ISO' } catch { return 'ISO' } }, [])
  const fmtDateLocal = useMemo(() => {
    const pretty = (s?: string) => {
      if (!s) return ''
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '')
      if (!m) return s || ''
      const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
      const dt = new Date(Date.UTC(y, mo - 1, d))
      const mon = dt.toLocaleString('de-DE', { month: 'short' }).replace('.', '')
      const dd = String(d).padStart(2, '0')
      return `${dd} ${mon} ${y}`
    }
    return (s?: string) => dateFmtPref === 'PRETTY' ? pretty(s) : (s || '')
  }, [dateFmtPref])

  // Debounce search
  const [qDebounced, setQDebounced] = useState('')
  useEffect(() => { const t = setTimeout(() => setQDebounced(q.trim()), 250); return () => clearTimeout(t) }, [q])

  // Load tags, budgets, earmarks (for filters/forms)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try { const t = await window.api?.tags?.list?.({}); if (!cancelled) setTags((t?.rows || []).map(r => ({ id: r.id, name: r.name, color: r.color ?? null }))) } catch {}
      try { const b = await window.api?.budgets?.list?.({}); if (!cancelled) setBudgets((b?.rows || []).map(r => ({ id: r.id, name: r.name || r.categoryName || r.projectName || undefined, year: r.year }))) } catch {}
      try { const em = await window.api?.bindings?.list?.({ activeOnly: true }); if (!cancelled) setEarmarks((em?.rows || []).map(r => ({ id: r.id, code: r.code, name: r.name, color: r.color ?? null }))) } catch {}
      try { const y = await window.api?.reports?.years?.(); if (!cancelled && y?.years) setYearsAvail(y.years) } catch {}
    })()
    return () => { cancelled = true }
  }, [])

  const [flashId, setFlashId] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await window.api?.invoices?.list?.({
        limit, offset, sort: sortDir, sortBy, status,
        sphere: sphere || undefined,
        budgetId: typeof budgetId === 'number' ? budgetId : undefined,
        q: qDebounced || undefined,
        dueFrom: dueFrom || undefined,
        dueTo: dueTo || undefined,
        tag: tag || undefined
      })
      setRows(res?.rows || [])
      setTotal(res?.total || 0)
    } catch (e: any) { setError(e?.message || String(e)) } finally { setLoading(false) }
  }

  async function loadSummary() {
    try {
      const res = await window.api?.invoices?.summary?.({ status, sphere: sphere || undefined, budgetId: typeof budgetId === 'number' ? budgetId : undefined, q: qDebounced || undefined, dueFrom: dueFrom || undefined, dueTo: dueTo || undefined, tag: tag || undefined })
      setSummary(res || null)
    } catch { setSummary(null) }
  }

  useEffect(() => { load() }, [limit, offset, status, sphere, budgetId, qDebounced, dueFrom, dueTo, tag, sortDir, sortBy])
  useEffect(() => { loadSummary() }, [status, sphere, budgetId, qDebounced, dueFrom, dueTo, tag])
  useEffect(() => { const onChanged = () => { loadSummary() }; try { window.addEventListener('data-changed', onChanged) } catch {}; return () => { try { window.removeEventListener('data-changed', onChanged) } catch {} } }, [status, sphere, budgetId, qDebounced, dueFrom, dueTo, tag])
  useEffect(() => { try { localStorage.setItem('invoices.sort', sortDir) } catch {} }, [sortDir])
  useEffect(() => { try { localStorage.setItem('invoices.sortBy', sortBy) } catch {} }, [sortBy])

  function clearFilters() { setQ(''); setStatus('ALL'); setSphere(''); setDueFrom(''); setDueTo(''); setBudgetId(''); setTag(''); setOffset(0) }

  const page = Math.floor(offset / limit) + 1
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)))
  const canPrev = offset > 0
  const canNext = offset + limit < total

  // Inline actions
  const [showPayModal, setShowPayModal] = useState<null | { id: number; party?: string; invoiceNo?: string | null; remaining: number }>(null)
  const [payDate, setPayDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [payAmount, setPayAmount] = useState<string>('')
  const [busyAction, setBusyAction] = useState<boolean>(false)
  const [deleteConfirm, setDeleteConfirm] = useState<null | { id: number; party?: string; invoiceNo?: string | null }>(null)
  const [postToVoucherModal, setPostToVoucherModal] = useState<null | { id: number; party: string; invoiceNo?: string | null }>(null)
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState<null | { invoiceId: number; invoiceNo?: string | null; party?: string; paymentAmount: number; paymentDate: string; willCreateVoucher: boolean }>(null)
  // Detail modal
  const [detailId, setDetailId] = useState<number | null>(null)
  const [detail, setDetail] = useState<null | { id: number; date: string; dueDate?: string | null; invoiceNo?: string | null; party: string; description?: string | null; grossAmount: number; paymentMethod?: string | null; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; earmarkId?: number | null; budgetId?: number | null; autoPost?: number; voucherType: 'IN' | 'OUT'; postedVoucherId?: number | null; postedVoucherNo?: string | null; payments: Array<{ id: number; date: string; amount: number }>; files: Array<{ id: number; fileName: string; mimeType?: string | null; size?: number | null; createdAt?: string | null }>; tags: string[]; paidSum: number; status: 'OPEN' | 'PARTIAL' | 'PAID' }>(null)
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false)
  async function openDetails(id: number) { setDetailId(id) }
  
  useEffect(() => {
    let cancelled = false
    async function fetchDetail() {
      if (!detailId) return
      setLoadingDetail(true)
      try { const d = await window.api?.invoices?.get?.({ id: detailId }); if (!cancelled) setDetail(d || null) } catch { if (!cancelled) setDetail(null) } finally { if (!cancelled) setLoadingDetail(false) }
    }
    fetchDetail(); return () => { cancelled = true }
  }, [detailId])

  // ESC key handler for detail modal
  useEffect(() => {
    if (detailId == null) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetailId(null)
        setDetail(null)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [detailId])

  useEffect(() => {
    function onOpen(e: any) { const id = Number(e?.detail?.id); if (isFinite(id) && id > 0) openDetails(id) }
    window.addEventListener('open-invoice-details', onOpen as any)
    return () => window.removeEventListener('open-invoice-details', onOpen as any)
  }, [])

  async function addPayment() {
    if (!showPayModal) return
    const amt = Number(payAmount.replace(',', '.'))
    if (!isFinite(amt) || Math.abs(amt) < 0.01) { alert('Bitte einen Betrag angeben'); return }
    const remainingCap = typeof showPayModal.remaining === 'number' ? Math.max(0, Math.round(showPayModal.remaining * 100) / 100) : undefined
    if (remainingCap != null && amt - remainingCap > 1e-6) { alert(`Der Betrag übersteigt den offenen Rest (${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(remainingCap)}).`); return }
    
    // Check if invoice has paymentMethod and autoPost - if no paymentMethod and invoice will be auto-posted, ask user
    const invoiceRow = rows.find(r => r.id === showPayModal.id)
    if (!invoiceRow) { alert('Verbindlichkeit nicht gefunden'); return }
    
    const hasAutoPost = !!(invoiceRow.autoPost ?? 0)
    const hasPaymentMethod = !!(invoiceRow.paymentMethod && invoiceRow.paymentMethod !== '')
    const paidAfter = (invoiceRow.paidSum || 0) + amt
    const willBePaid = paidAfter >= (invoiceRow.grossAmount || 0) - 0.01
    
    // If payment method is missing and invoice has auto-post enabled and will be fully paid, ask user
    // For manual posting, the check happens when clicking "Als Buchung hinzufügen"
    if (!hasPaymentMethod && hasAutoPost && willBePaid && !invoiceRow.postedVoucherId) {
      setShowPaymentMethodModal({
        invoiceId: showPayModal.id,
        invoiceNo: showPayModal.invoiceNo,
        party: showPayModal.party,
        paymentAmount: amt,
        paymentDate: payDate,
        willCreateVoucher: true
      })
      return
    }
    
    setBusyAction(true)
    try {
      const res = await window.api?.invoices?.addPayment?.({ invoiceId: showPayModal.id, date: payDate, amount: amt })
      if (res) {
        setRows(prev => prev.map(r => r.id === showPayModal.id ? { ...r, paidSum: res.paidSum ?? (r.paidSum + amt), status: res.status } : r))
        try {
          const row = rows.find(r => r.id === showPayModal.id)
          const autoPostEnabled = !!(row?.autoPost)
          if (res.status === 'PAID' && autoPostEnabled) {
            const invLabel = row?.invoiceNo ? `Verbindlichkeit ${row.invoiceNo}` : `Verbindlichkeit #${row?.id}`
            notify('success', `${invLabel} wurde automatisch als Buchung erstellt.`)
          }
        } catch {}
        setShowPayModal(null)
        try { window.dispatchEvent(new Event('data-changed')) } catch {}
        await loadSummary()
      }
    } catch (e: any) { alert(e?.message || String(e)) } finally { setBusyAction(false) }
  }

  async function confirmPaymentMethod(method: 'BAR' | 'BANK') {
    if (!showPaymentMethodModal) return
    setBusyAction(true)
    try {
      // Update invoice payment method first
      const invoiceRow = rows.find(r => r.id === showPaymentMethodModal.invoiceId)
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
        sphere: invoiceRow.sphere,
        earmarkId: invoiceRow.earmarkId || null,
        budgetId: invoiceRow.budgetId || null,
        autoPost: !!(invoiceRow.autoPost ?? 0),
        voucherType: invoiceRow.voucherType,
        tags: invoiceRow.tags || []
      })
      
      // Update rows state with new payment method
      setRows(prev => prev.map(r => r.id === showPaymentMethodModal.invoiceId 
        ? { ...r, paymentMethod: method } 
        : r
      ))
      
      // For auto-posting: add payment now (which will trigger auto-posting)
      // For manual posting: just open the postToVoucher modal
      if (showPaymentMethodModal.willCreateVoucher) {
        // Auto-posting flow: add payment
        const res = await window.api?.invoices?.addPayment?.({
          invoiceId: showPaymentMethodModal.invoiceId,
          date: showPaymentMethodModal.paymentDate,
          amount: showPaymentMethodModal.paymentAmount
        })
        
        if (res) {
          setRows(prev => prev.map(r => r.id === showPaymentMethodModal.invoiceId 
            ? { ...r, paidSum: res.paidSum ?? (r.paidSum + showPaymentMethodModal.paymentAmount), status: res.status } 
            : r
          ))
          
          if (res.status === 'PAID') {
            const invoiceLabel = showPaymentMethodModal.invoiceNo || `#${showPaymentMethodModal.invoiceId}`
            notify('success', `Verbindlichkeit ${invoiceLabel} wurde automatisch als Buchung gebucht`)
          }
          
          setShowPaymentMethodModal(null)
          setShowPayModal(null)
        }
      } else {
        // Manual posting flow: open postToVoucher modal
        const invoiceNo = showPaymentMethodModal.invoiceNo
        const party = showPaymentMethodModal.party
        setShowPaymentMethodModal(null)
        setPostToVoucherModal({ 
          id: showPaymentMethodModal.invoiceId, 
          party: party, 
          invoiceNo: invoiceNo 
        })
      }
      
      try { window.dispatchEvent(new Event('data-changed')) } catch { }
      await loadSummary()
    } catch (e: any) {
      alert(e?.message || String(e))
    } finally {
      setBusyAction(false)
    }
  }

  async function deleteInvoice(id: number) {
    setBusyAction(true)
    try { const res = await window.api?.invoices?.delete?.({ id }); if (res) { setRows(prev => prev.filter(r => r.id !== id)); setTotal(t => Math.max(0, t - 1)); await loadSummary() } }
    catch (e: any) { alert(e?.message || String(e)) } finally { setBusyAction(false); setDeleteConfirm(null) }
  }

  const statusBadge = (s: 'OPEN' | 'PARTIAL' | 'PAID') => {
    const map: Record<string, string> = { OPEN: 'var(--danger)', PARTIAL: '#f9a825', PAID: 'var(--success)' }
    const bg = map[s] || 'var(--muted)'
    const fg = contrastText(bg)
    return <span className="badge" style={{ background: bg, color: fg }}>{s}</span>
  }

  type InvoiceDraft = { id?: number; date: string; dueDate?: string | null; invoiceNo?: string | null; party: string; description?: string | null; grossAmount: string; paymentMethod?: '' | 'BAR' | 'BANK'; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; earmarkId?: number | ''; budgetId?: number | ''; autoPost: boolean; voucherType: 'IN' | 'OUT'; tags: string[] }
  const [form, setForm] = useState<null | { mode: 'create' | 'edit'; draft: InvoiceDraft; sourceRow?: any }>(null)
  const [formFiles, setFormFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const editInvoiceFileInputRef = useRef<HTMLInputElement | null>(null)
  const [editInvoiceFiles, setEditInvoiceFiles] = useState<Array<{ id: number; fileName: string; size?: number | null; createdAt?: string | null }>>([])
  const [formError, setFormError] = useState<string>('')
  const [requiredTouched, setRequiredTouched] = useState(false)
  const [missingRequired, setMissingRequired] = useState<string[]>([])
  function openCreate() { const today = new Date().toISOString().slice(0, 10); setForm({ mode: 'create', draft: { date: today, dueDate: null, invoiceNo: '', party: '', description: '', grossAmount: '', paymentMethod: 'BANK', sphere: 'IDEELL', earmarkId: '', budgetId: '', autoPost: true, voucherType: 'OUT', tags: [] } }); setFormFiles([]); setFormError(''); setRequiredTouched(false) }
  function openEdit(row: any) { setForm({ mode: 'edit', draft: { id: row.id, date: row.date, dueDate: row.dueDate ?? null, invoiceNo: row.invoiceNo ?? '', party: row.party, description: row.description ?? '', grossAmount: String(row.grossAmount ?? ''), paymentMethod: (row.paymentMethod ?? '') as any, sphere: row.sphere, earmarkId: (typeof row.earmarkId === 'number' ? row.earmarkId : '') as any, budgetId: (typeof row.budgetId === 'number' ? row.budgetId : '') as any, autoPost: !!(row.autoPost ?? 0), voucherType: row.voucherType, tags: (row.tags || []) as string[] }, sourceRow: row }); setFormFiles([]); setFormError(''); setRequiredTouched(false) }
  function parseAmount(input: string): number | null { if (!input) return null; const s = input.replace(/\./g, '').replace(',', '.'); const n = Number(s); return isFinite(n) ? Math.round(n * 100) / 100 : null }
  async function saveForm() {
    if (!form) return
    setRequiredTouched(true)
    setFormError('')
    const d = form.draft
    const missing: string[] = []
    if (!d.date) missing.push('Datum')
    if (!(d.invoiceNo || '').trim()) missing.push('Verbindlichkeitsnummer')
    if (!d.party || !d.party.trim()) missing.push('Partei')
    const amt = parseAmount(d.grossAmount)
    if (amt == null || amt <= 0) missing.push('Betrag')
    if (missing.length) { setMissingRequired(missing); return }
    try {
      if (form.mode === 'create') {
        let files: { name: string; dataBase64: string; mime?: string }[] | undefined
        if (formFiles.length) {
          const enc = async (f: File) => { const buf = await f.arrayBuffer(); let binary = ''; const bytes = new Uint8Array(buf); const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) { binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any) } const dataBase64 = btoa(binary); return { name: f.name, dataBase64, mime: f.type || undefined } }
          files = await Promise.all(formFiles.map(enc))
        }
        const payload = { date: d.date, dueDate: d.dueDate || null, invoiceNo: (d.invoiceNo || '').trim() || null, party: d.party.trim(), description: (d.description || '').trim() || null, grossAmount: amt, paymentMethod: d.paymentMethod || null, sphere: d.sphere, earmarkId: (typeof d.earmarkId === 'number') ? d.earmarkId : null, budgetId: (typeof d.budgetId === 'number') ? d.budgetId : null, autoPost: !!d.autoPost, voucherType: d.voucherType, files, tags: d.tags || [] }
        const res = await window.api?.invoices?.create?.(payload as any)
        if (res?.id) { setForm(null); setFormFiles([]); setOffset(0); setFlashId(res.id); window.setTimeout(() => setFlashId((cur) => (cur === res.id ? null : cur)), 3000); await Promise.all([load(), loadSummary()]) }
      } else {
        const payload = { id: d.id!, date: d.date, dueDate: d.dueDate || null, invoiceNo: (d.invoiceNo || '').trim() || null, party: d.party.trim(), description: (d.description || '').trim() || null, grossAmount: amt, paymentMethod: d.paymentMethod || null, sphere: d.sphere, earmarkId: (typeof d.earmarkId === 'number') ? d.earmarkId : null, budgetId: (typeof d.budgetId === 'number') ? d.budgetId : null, autoPost: !!d.autoPost, voucherType: d.voucherType, tags: d.tags || [] }
        const res = await window.api?.invoices?.update?.(payload as any)
        if (res?.id) { setForm(null); setFormFiles([]); if (payload.id) { setFlashId(payload.id); window.setTimeout(() => setFlashId((cur) => (cur === payload.id ? null : cur)), 3000) } await Promise.all([load(), loadSummary()]) }
      }
    } catch (e: any) { setFormError(e?.message || String(e)) }
  }
  function removeFileAt(i: number) { setFormFiles(prev => prev.filter((_, idx) => idx !== i)) }

  const partySuggestions = useMemo(() => { const set = new Set<string>(); for (const r of rows) { if (r?.party) set.add(String(r.party)) } return Array.from(set).sort().slice(0, 30) }, [rows])
  const descSuggestions = useMemo(() => { const set = new Set<string>(); for (const r of rows) { if (r?.description) set.add(String(r.description)) } return Array.from(set).sort().slice(0, 30) }, [rows])

  useEffect(() => {
    if (!form) return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tagName = (target?.tagName || '').toLowerCase()
      const inEditable = !!(target && ((target as any).isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select'))
      if (e.key === 'Escape') { setForm(null); e.preventDefault(); return }
      // Ctrl+S to save (no Enter save)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { saveForm(); e.preventDefault(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') { if (form.mode === 'create') fileInputRef.current?.click(); else editInvoiceFileInputRef.current?.click(); e.preventDefault(); return }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [form, saveForm])

  useEffect(() => {
    let alive = true
    async function loadFiles() {
      try {
        if (form && form.mode === 'edit' && (form.draft as any).id) {
          const res = await window.api?.invoiceFiles?.list?.({ invoiceId: (form.draft as any).id })
          if (alive && res?.files) setEditInvoiceFiles(res.files as any)
        } else { if (alive) setEditInvoiceFiles([]) }
      } catch {}
    }
    loadFiles(); return () => { alive = false }
  }, [form?.mode, (form?.draft as any)?.id])

  return (
    <div className="card invoices-container">
      <div className="invoices-header">
        <h1>Verbindlichkeiten</h1>
        <div className="invoices-filters">
          <input className="input invoices-search" placeholder="Suche Verbindlichkeiten (Nr., Partei, Text)…" value={q} onChange={e => { setQ(e.target.value); setOffset(0) }} aria-label="Verbindlichkeiten durchsuchen" />
          <select className="input" value={status} onChange={e => { setStatus(e.target.value as any); setOffset(0) }} aria-label="Status filtern">
            <option value="ALL">Alle</option>
            <option value="OPEN">Offen</option>
            <option value="PARTIAL">Teilweise</option>
            <option value="PAID">Bezahlt</option>
          </select>
          <select className="input" value={sphere} onChange={e => { setSphere((e.target.value || '') as any); setOffset(0) }} aria-label="Sphäre filtern">
            <option value="">Sphäre: alle</option>
            <option value="IDEELL">IDEELL</option>
            <option value="ZWECK">ZWECK</option>
            <option value="VERMOEGEN">VERMÖGEN</option>
            <option value="WGB">WGB</option>
          </select>
          <select className="input" value={String(budgetId)} onChange={e => { const v = e.target.value; setBudgetId(v && v !== '' ? Number(v) : ''); setOffset(0) }} aria-label="Budget filtern">
            <option value="">Budget: alle</option>
            {budgets.map(b => (<option key={b.id} value={b.id}>{b.year}{b.name ? ` – ${b.name}` : ''}</option>))}
          </select>
          <select className="input" value={tag} onChange={e => { setTag(e.target.value); setOffset(0) }} aria-label="Tag filtern">
            <option value="">Tag: alle</option>
            {tags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <span style={{ color: 'var(--text-dim)' }}>Fällig:</span>
          <button className="btn" title="Fälligkeits-Zeitraum/Jahr wählen" onClick={() => setShowDueFilter(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1a11 11 0 1 0 11 11A11.013 11.013 0 0 0 12 1Zm0 20a9 9 0 1 1 9-9 9.01 9.01 0 0 1-9 9Zm.5-14h-2v6l5.2 3.12 1-1.64-4.2-2.48Z" /></svg>
          </button>
          {(dueFrom || dueTo) && (<span className="helper">{dueFrom || '—'} – {dueTo || '—'}</span>)}
          <button className="btn ghost" title="Anzuzeigende Spalten wählen" onClick={() => setShowColumnsModal(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
          </button>
          {(() => { const hasFilters = !!(q.trim() || (status !== 'ALL') || sphere || budgetId || tag || dueFrom || dueTo); return hasFilters ? (<button className="btn btn-clear-filters" onClick={clearFilters} title="Alle Filter löschen">✕</button>) : null })()}
          <div className="filter-divider" />
          <button className="btn primary" onClick={() => openCreate()}>+ Neu</button>
        </div>
      </div>
      {error && <div className="invoices-text-danger">{error}</div>}
      {loading ? (
        <LoadingState message="Lade Verbindlichkeiten…" />
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
          <table cellPadding={6} className="invoices-table">
            <thead>
              <tr>
                <th align="center" title="Typ">Typ</th>
                <th align="left">
                  <button className="btn ghost invoices-sort-btn" title="Nach Datum sortieren" onClick={() => { setSortBy('date'); setSortDir(prev => (sortBy === 'date' ? (prev === 'DESC' ? 'ASC' : 'DESC') : (prev || 'DESC'))); setOffset(0) }}>
                    <span>Datum</span>
                    <span aria-hidden="true" className={sortBy === 'date' ? 'invoices-sort-icon-active' : 'invoices-sort-icon'}>{sortBy === 'date' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span>
                  </button>
                </th>
                <th align="left">
                  <button className="btn ghost invoices-sort-btn" title="Nach Fälligkeit sortieren" onClick={() => { setSortBy('due'); setSortDir(prev => (sortBy === 'due' ? (prev === 'DESC' ? 'ASC' : 'DESC') : (prev || 'ASC'))); setOffset(0) }}>
                    <span>Fällig</span>
                    <span aria-hidden="true" className={sortBy === 'due' ? 'invoices-sort-icon-active' : 'invoices-sort-icon'}>{sortBy === 'due' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span>
                  </button>
                </th>
                <th align="left">Nr.</th>
                <th align="left">Partei</th>
                {colPrefs.showTags && <th align="left">Tags</th>}
                <th align="right">
                  <button className="btn ghost invoices-sort-btn" title="Nach Betrag sortieren" onClick={() => { setSortBy('amount'); setSortDir(prev => (sortBy === 'amount' ? (prev === 'DESC' ? 'ASC' : 'DESC') : (prev || 'DESC'))); setOffset(0) }}>
                    <span>Brutto</span>
                    <span aria-hidden="true" className={sortBy === 'amount' ? 'invoices-sort-icon-active' : 'invoices-sort-icon'}>{sortBy === 'amount' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span>
                  </button>
                </th>
                {colPrefs.showBezahlt && <th align="right">Bezahlt</th>}
                {colPrefs.showRest && <th align="right">Rest</th>}
                <th align="left">
                  <button className="btn ghost invoices-sort-btn" title="Nach Status sortieren" onClick={() => { setSortBy('status'); setSortDir(prev => (sortBy === 'status' ? (prev === 'DESC' ? 'ASC' : 'DESC') : (prev || 'ASC'))); setOffset(0) }}>
                    <span>Status</span>
                    <span aria-hidden="true" className={sortBy === 'status' ? 'invoices-sort-icon-active' : 'invoices-sort-icon'}>{sortBy === 'status' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span>
                  </button>
                </th>
                {colPrefs.showAttachments && <th align="center" title="Anhänge">📎</th>}
                <th align="center">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => {
                const remaining = Math.max(0, Math.round((Number(r.grossAmount || 0) - Number(r.paidSum || 0)) * 100) / 100)
                return (
                  <tr key={r.id} className={flashId === r.id ? 'row-flash' : undefined}>
                    <td align="center" title={r.voucherType === 'IN' ? 'Einnahme' : 'Ausgabe'}>
                      <span className={`badge invoices-type-badge ${r.voucherType === 'IN' ? 'invoices-type-badge-in' : ''}`}>
                        {r.voucherType === 'IN' ? '↑ IN' : '↓ OUT'}
                      </span>
                    </td>
                    <td>{fmtDateLocal(r.date)}</td>
                    {(() => {
                      const due = r.dueDate || ''
                      let style: React.CSSProperties | undefined
                      let title = 'Fälligkeit'
                      if (due) {
                        try {
                          const today = new Date()
                          const d = new Date(due)
                          const diffMs = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).getTime() - new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).getTime()
                          const days = Math.round(diffMs / (1000 * 60 * 60 * 24))
                          if (days < 0) { style = { color: 'var(--danger)', fontWeight: 600 }; title = 'Überfällig' }
                          else if (days <= 5) { style = { color: '#f9a825', fontWeight: 600 }; title = 'Fällig in ≤ 5 Tagen' }
                        } catch {}
                      }
                      return (<td style={style} title={title}>{fmtDateLocal(due)}</td>)
                    })()}
                    <td>
                      {r.invoiceNo || '—'}
                      {(r.fileCount || 0) > 0 && <span className="invoices-attachment-icon" title={`${r.fileCount} Anhang${r.fileCount > 1 ? 'e' : ''}`}>📎</span>}
                    </td>
                    <td>{r.party}</td>
                    {colPrefs.showTags && (
                      <td>
                        <div className="invoices-tags-container">
                          {(r.tags || []).map((t: string) => {
                            const def = (tags || []).find(td => (td.name || '').toLowerCase() === (t || '').toLowerCase())
                            const bg = def?.color || undefined
                            const fg = bg ? contrastText(bg) : undefined
                            return (
                              <button key={t} className="chip" onClick={() => { setTag(t); setOffset(0) }} title={`Nach Tag "${t}" filtern`} style={bg ? { background: bg, color: fg, borderColor: bg } : undefined}>{t}</button>
                            )
                          })}
                        </div>
                      </td>
                    )}
                    <td align="right">{eurFmt.format(r.grossAmount)}</td>
                    {colPrefs.showBezahlt && <td align="right" title={`Summe Zahlungen`}>{eurFmt.format(r.paidSum || 0)}</td>}
                    {colPrefs.showRest && <td align="right" className={remaining > 0 ? 'invoices-rest-danger' : 'invoices-rest-success'}>{eurFmt.format(remaining)}</td>}
                    <td>{statusBadge(r.status)}</td>
                    {colPrefs.showAttachments && <td align="center">{(r.fileCount || 0) > 0 ? <span className="badge">📎 {r.fileCount}</span> : ''}</td>}
                    <td align="center" className="invoices-actions-nowrap">
                      <button className="btn" title="Details" onClick={() => openDetails(r.id)}>ℹ</button>
                      {r.status !== 'PAID' && (
                        <button className="btn btn-edit" title="Bearbeiten" onClick={() => openEdit(r)}>✎</button>
                      )}
                      {remaining > 0 && r.status !== 'PAID' && (
                        <button className="btn invoices-payment-add" title="Zahlung hinzufügen" onClick={() => { setShowPayModal({ id: r.id, party: r.party, invoiceNo: r.invoiceNo || null, remaining }); setPayAmount(String(remaining || '')) }}>{'€+'}</button>
                      )}
                      {r.status === 'PAID' && !r.autoPost && !r.postedVoucherId && (
                        <button className="btn primary" title="Als Buchung hinzufügen" onClick={() => {
                          // Check if payment method is set before allowing manual posting
                          const hasPaymentMethod = !!(r.paymentMethod && r.paymentMethod !== '')
                          if (!hasPaymentMethod) {
                            setShowPaymentMethodModal({
                              invoiceId: r.id,
                              invoiceNo: r.invoiceNo,
                              party: r.party,
                              paymentAmount: 0,
                              paymentDate: '',
                              willCreateVoucher: false // manual posting
                            })
                          } else {
                            setPostToVoucherModal({ id: r.id, party: r.party, invoiceNo: r.invoiceNo })
                          }
                        }}>📝</button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (<tr><td colSpan={12} className="helper">Keine Verbindlichkeiten gefunden.</td></tr>)}
            </tbody>
          </table>
          <div className="invoices-pagination">
            <div className="helper">Gesamt: {total}</div>
            <div className="pagination-controls">
              <label className="helper">Pro Seite</label>
              <select className="input" value={limit} onChange={e => { setLimit(Number(e.target.value)); setOffset(0) }} aria-label="Einträge pro Seite">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span className="helper">Seite {page} / {pages}</span>
              <button className="btn" disabled={!canPrev} onClick={() => setOffset(0)} title="Erste">«</button>
              <button className="btn" disabled={!canPrev} onClick={() => setOffset(Math.max(0, offset - limit))} title="Zurück">‹</button>
              <button className="btn" disabled={!canNext} onClick={() => setOffset(offset + limit)} title="Weiter">›</button>
            </div>
          </div>
        </>
      )}

      <TimeFilterModal open={showDueFilter} onClose={() => setShowDueFilter(false)} yearsAvail={yearsAvail} from={dueFrom} to={dueTo} onApply={({ from: nf, to: nt }) => { setDueFrom(nf); setDueTo(nt); setOffset(0) }} />

      {showPayModal && createPortal((() => {
        const rowData = rows.find(r => r.id === showPayModal.id)
        const isIN = rowData?.voucherType === 'IN'
        const typeName = isIN ? 'Forderung' : 'Verbindlichkeit'
        return (
          <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowPayModal(null)}>
            <div className="modal payment-modal-grid" onClick={e => e.stopPropagation()}>
              <ModalHeader 
                title="Zahlung hinzufügen" 
                subtitle={`${showPayModal.invoiceNo ? `${typeName} ${showPayModal.invoiceNo}` : `${typeName} #${showPayModal.id}`} · ${showPayModal.party || ''}`}
                onClose={() => setShowPayModal(null)} 
              />
            {typeof showPayModal.remaining === 'number' && (<div className="helper">Offener Rest: <strong>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Math.max(0, Math.round(showPayModal.remaining * 100) / 100))}</strong></div>)}
            <div className="row">
              <div className="field">
                <label>Datum</label>
                <input className="input" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} aria-label="Zahlungsdatum" />
              </div>
              <div className="field">
                <label>Betrag (EUR)</label>
                <input className="input" type="text" inputMode="decimal" value={payAmount} onChange={e => setPayAmount(e.target.value)} onBlur={() => {
                  if (!showPayModal) return
                  const cap = typeof showPayModal.remaining === 'number' ? Math.max(0, Math.round(showPayModal.remaining * 100) / 100) : undefined
                  const v = Number(String(payAmount || '').replace(',', '.'))
                  if (isFinite(v) && cap != null && v - cap > 1e-6) setPayAmount(String(cap))
                }} placeholder="z. B. 199,90" />
              </div>
            </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn" onClick={() => setShowPayModal(null)}>Abbrechen</button>
                <button className="btn primary" disabled={busyAction} onClick={addPayment}>Speichern</button>
              </div>
            </div>
          </div>
        )
      })(), document.body)}

      {showPaymentMethodModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowPaymentMethodModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, textAlign: 'center' }}>
            <ModalHeader 
              title="Zahlweg festlegen" 
              subtitle={`Verbindlichkeit #${showPaymentMethodModal.invoiceId}`}
              onClose={() => setShowPaymentMethodModal(null)} 
            />
            <div className="helper" style={{ marginBottom: 24 }}>
              Die Verbindlichkeit wird automatisch verbucht. Bitte wählen Sie den Zahlweg:
            </div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 16 }}>
              <button 
                className="btn primary" 
                style={{ fontSize: 18, padding: '16px 32px', minWidth: 160 }}
                onClick={() => confirmPaymentMethod('BAR')}
                disabled={busyAction}
              >
                💵 Bar
              </button>
              <button 
                className="btn primary" 
                style={{ fontSize: 18, padding: '16px 32px', minWidth: 160 }}
                onClick={() => confirmPaymentMethod('BANK')}
                disabled={busyAction}
              >
                🏦 Bank
              </button>
            </div>
            <button className="btn" onClick={() => setShowPaymentMethodModal(null)} style={{ marginTop: 8 }}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {form && createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal invoice-modal invoices-modal-grid" onClick={e => e.stopPropagation()}>
            <div className="card invoices-form-header">
              <div className="invoices-form-header-top">
                <div className="invoices-form-header-info">
                  <h2 style={{ margin: 0 }}>{(() => {
                    const type = form.draft.voucherType === 'IN' ? 'Forderung' : 'Verbindlichkeit'
                    return form.mode === 'create' ? `${type} anlegen` : `${type} bearbeiten`
                  })()}</h2>
                </div>
                <div className="invoices-form-header-actions">
                  {form.mode === 'edit' && form.sourceRow?.status && <span className="badge" title="Zahlstatus">{String(form.sourceRow.status)}</span>}
                  <button className="btn ghost" onClick={() => setForm(null)} aria-label="Schließen">✕</button>
                </div>
              </div>
              <div className="helper invoices-form-header-helper">
                <span>Buchungstyp: <strong style={{ color: form.draft.voucherType === 'IN' ? 'var(--success)' : 'var(--danger)' }}>{form.draft.voucherType}</strong></span>
                <span>Betrag: <strong>{(() => { const a = parseAmount(form.draft.grossAmount); return a != null && a > 0 ? eurFmt.format(a) : '—' })()}</strong></span>
                <span>Fällig: <strong>{form.draft.dueDate || '—'}</strong></span>
                <span>Zahlweg: <strong>{form.draft.paymentMethod || '—'}</strong></span>
                <span>Sphäre: <strong>{form.draft.sphere}</strong></span>
              </div>
            </div>

            {formError && <div className="invoices-text-danger">{formError}</div>}

            <div className="invoices-form-grid">
              <div className="card invoices-form-card">
                {/* Reihenlayout angepasst */}
                {/* Reihe 1: Datum | Fälligkeit */}
                <div className="invoices-left-grid">
                  <div className="field">
                    <label>Datum <span className="req-asterisk" aria-hidden="true">*</span></label>
                    <input className="input" type="date" value={form.draft.date} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, date: e.target.value } }))} style={requiredTouched && !form.draft.date ? { borderColor: 'var(--danger)' } : undefined} />
                    {requiredTouched && !form.draft.date && (<div className="helper" style={{ color: 'var(--danger)' }}>Bitte Datum angeben</div>)}
                  </div>
                  <div className="field">
                    <label>Fälligkeit</label>
                    <input className="input" type="date" value={form.draft.dueDate || ''} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, dueDate: e.target.value || null } }))} />
                  </div>
                  {/* Reihe 2: Partei */}
                  <div className="field invoices-form-field-span2">
                    <label>Partei <span className="req-asterisk" aria-hidden="true">*</span></label>
                    <input className="input party-input" list="party-suggestions" value={form.draft.party} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, party: e.target.value } }))} placeholder="Name der Partei" style={requiredTouched && (!form.draft.party?.trim()) ? { borderColor: 'var(--danger)' } : undefined} />
                    {requiredTouched && (!form.draft.party?.trim()) && (<div className="helper" style={{ color: 'var(--danger)' }}>Bitte Partei angeben</div>)}
                  </div>
                  {/* Reihe 3: Verbindlichkeitsnummer/Forderungsnummer + Betrag */}
                  <div className="field">
                    <label>{form.draft.voucherType === 'IN' ? 'Forderungsnummer' : 'Verbindlichkeitsnummer'} <span className="req-asterisk" aria-hidden="true">*</span></label>
                    <input
                      className="input"
                      value={form.draft.invoiceNo || ''}
                      onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, invoiceNo: e.target.value } }))}
                      placeholder="z. B. 2025-001"
                      style={requiredTouched && !(form.draft.invoiceNo || '').trim() ? { borderColor: 'var(--danger)' } : undefined}
                      aria-label={form.draft.voucherType === 'IN' ? 'Forderungsnummer' : 'Verbindlichkeitsnummer'}
                    />
                    {requiredTouched && !(form.draft.invoiceNo || '').trim() && (
                      <div className="helper" style={{ color: 'var(--danger)' }}>Bitte {form.draft.voucherType === 'IN' ? 'Forderungsnummer' : 'Verbindlichkeitsnummer'} angeben</div>
                    )}
                  </div>
                  <div className="field">
                    <label>Betrag (EUR) <span className="req-asterisk" aria-hidden="true">*</span></label>
                    <input className="input amount-input" inputMode="decimal" placeholder="z. B. 199,90" value={form.draft.grossAmount} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, grossAmount: e.target.value } }))} style={requiredTouched && (parseAmount(form.draft.grossAmount) == null || parseAmount(form.draft.grossAmount)! <= 0) ? { borderColor: 'var(--danger)' } : undefined} aria-label={`${form.draft.voucherType === 'IN' ? 'Forderungs' : 'Verbindlichkeits'}betrag in Euro`} />
                    {/* Entfernte Helfer-Ausgabe des formatierten Betrags unter dem Eingabefeld (Duplikat) */}
                  </div>
                  {/* Reihe 4: Beschreibung (volle Breite) */}
                  <div className="field invoices-form-field-span2">
                    <label>Beschreibung</label>
                    <input className="input" list="desc-suggestions" value={form.draft.description || ''} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, description: e.target.value } }))} placeholder="Kurzbeschreibung" />
                  </div>
                  {/* Reihe 5: Zahlweg | Buchungstyp */}
                  <div className="field">
                    <label>Zahlweg</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" className="btn" style={{ width: 56, justifyContent: 'center', background: !form.draft.paymentMethod ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }} onClick={() => setForm(f => f && ({ ...f, draft: { ...f.draft, paymentMethod: '' } }))} title="Kein Zahlweg">—</button>
                      <button type="button" className="btn" style={{ width: 80, justifyContent: 'center', background: form.draft.paymentMethod === 'BAR' ? 'color-mix(in oklab, var(--accent) 25%, transparent)' : undefined }} onClick={() => setForm(f => f && ({ ...f, draft: { ...f.draft, paymentMethod: 'BAR' } }))} title="Bar">💵 Bar</button>
                      <button type="button" className="btn" style={{ width: 80, justifyContent: 'center', background: form.draft.paymentMethod === 'BANK' ? 'color-mix(in oklab, var(--accent) 25%, transparent)' : undefined }} onClick={() => setForm(f => f && ({ ...f, draft: { ...f.draft, paymentMethod: 'BANK' } }))} title="Bank">🏦 Bank</button>
                    </div>
                  </div>
                  <div className="field">
                    <label>Buchungstyp</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" className="btn" style={{ width: 80, justifyContent: 'center', background: form.draft.voucherType === 'IN' ? 'color-mix(in oklab, var(--success) 25%, transparent)' : undefined }} onClick={() => setForm(f => f && ({ ...f, draft: { ...f.draft, voucherType: 'IN' } }))}>IN</button>
                      <button type="button" className="btn" style={{ width: 80, justifyContent: 'center', background: form.draft.voucherType === 'OUT' ? 'color-mix(in oklab, var(--danger) 25%, transparent)' : undefined }} onClick={() => setForm(f => f && ({ ...f, draft: { ...f.draft, voucherType: 'OUT' } }))}>OUT</button>
                    </div>
                  </div>
                  {/* Reihe 6: Tags (schmaler) */}
                  <div className="field invoices-form-field-span2 invoices-tags-narrow">
                    <TagsEditor label="Tags" value={form.draft.tags} onChange={tags => setForm(f => f && ({ ...f, draft: { ...f.draft, tags } }))} tagDefs={tags} className="tags-editor" />
                  </div>
                </div>
              </div>

              <div className="card invoices-form-card">
                <div className="field">
                  <label>Sphäre <span className="helper">(Steuerlicher Bereich)</span></label>
                  <select className="input" value={form.draft.sphere} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, sphere: e.target.value as any } }))} aria-label="Sphäre auswählen">
                    <option value="IDEELL">IDEELL</option>
                    <option value="ZWECK">ZWECK</option>
                    <option value="VERMOEGEN">VERMÖGEN</option>
                    <option value="WGB">WGB</option>
                  </select>
                </div>
                <div className="field">
                  <label>Zweckbindung</label>
                  <select className="input" value={(form.draft.earmarkId ?? '') as any} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, earmarkId: e.target.value ? Number(e.target.value) : '' } }))} aria-label="Zweckbindung auswählen">
                    <option value="">—</option>
                    {earmarks.map(em => (<option key={em.id} value={em.id}>{em.code} – {em.name}</option>))}
                  </select>
                </div>
                <div className="field">
                  <label>Budget</label>
                  <select className="input" value={(form.draft.budgetId ?? '') as any} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, budgetId: e.target.value ? Number(e.target.value) : '' } }))} aria-label="Budget auswählen">
                    <option value="">—</option>
                    {budgets.map(b => (<option key={b.id} value={b.id}>{b.year}{b.name ? ` – ${b.name}` : ''}</option>))}
                  </select>
                </div>
                <div className="field">
                  <label>Auto-Buchung</label>
                  <select className="input" value={form.draft.autoPost ? '1' : '0'} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, autoPost: e.target.value === '1' } }))} aria-label="Automatische Buchung">
                    <option value="1">Ja</option>
                    <option value="0">Nein</option>
                  </select>
                </div>

                {form.mode === 'create' && (
                  <div className="field">
                    <label>Dateien</label>
                    <div onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const fl = e.dataTransfer?.files; if (fl && fl.length) setFormFiles(prev => [...prev, ...Array.from(fl)]) }} className="card" style={{ padding: 10, border: '1px dashed var(--muted)', background: 'color-mix(in oklab, var(--accent) 10%, transparent)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input ref={fileInputRef} type="file" multiple accept=".png,.jpg,.jpeg,.pdf,.doc,.docx" style={{ display: 'none' }} onChange={e => { const f = Array.from(e.target.files || []); if (f.length) setFormFiles(prev => [...prev, ...f]); if (fileInputRef.current) fileInputRef.current.value = '' }} />
                        <button className="btn" onClick={() => fileInputRef.current?.click()}>+ Dateien auswählen</button>
                        <span className="helper">oder hierher ziehen</span>
                      </div>
                      {formFiles.length > 0 && (
                        <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                          <thead><tr><th align="left">Datei</th><th align="right">Größe</th><th align="center">Aktion</th></tr></thead>
                          <tbody>
                            {formFiles.map((f, i) => {
                              const sizeMB = f.size != null ? (f.size / 1024 / 1024) : 0
                              return (
                                <tr key={i}>
                                  <td className="invoices-file-name" title={f.name}>{f.name}</td>
                                  <td align="right">{sizeMB >= 0.01 ? sizeMB.toFixed(2) : sizeMB.toFixed(4)} MB</td>
                                  <td align="center"><button className="btn danger" onClick={() => removeFileAt(i)}>Entfernen</button></td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}

                {form.mode === 'edit' && (
                  <div className="field">
                    <label>Dateien</label>
                    <div onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }} onDrop={async (e) => {
                      e.preventDefault(); e.stopPropagation()
                      const fl = e.dataTransfer?.files
                      if (fl && fl.length && (form.draft as any).id) {
                        for (const f of Array.from(fl)) {
                          const buf = await f.arrayBuffer()
                          let binary = ''
                          const bytes = new Uint8Array(buf)
                          const chunk = 0x8000
                          for (let i = 0; i < bytes.length; i += chunk) { binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any) }
                          const dataBase64 = btoa(binary)
                          await window.api?.invoiceFiles?.add?.({ invoiceId: (form.draft as any).id, fileName: f.name, dataBase64, mimeType: (f as any).type || undefined })
                        }
                        const res = await window.api?.invoiceFiles?.list?.({ invoiceId: (form.draft as any).id })
                        setEditInvoiceFiles(res?.files || [])
                      }
                    }} className="card" style={{ padding: 10, border: '1px dashed var(--muted)', background: 'color-mix(in oklab, var(--accent) 10%, transparent)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input ref={editInvoiceFileInputRef} type="file" multiple hidden accept=".png,.jpg,.jpeg,.pdf,.doc,.docx" onChange={async (e) => {
                          const files = Array.from(e.target.files || [])
                          try {
                            if (files.length && (form.draft as any).id) {
                              for (const f of files) {
                                const buf = await f.arrayBuffer()
                                let binary = ''
                                const bytes = new Uint8Array(buf)
                                const chunk = 0x8000
                                for (let i = 0; i < bytes.length; i += chunk) { binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any) }
                                const dataBase64 = btoa(binary)
                                await window.api?.invoiceFiles?.add?.({ invoiceId: (form.draft as any).id, fileName: f.name, dataBase64, mimeType: (f as any).type || undefined })
                              }
                              const res = await window.api?.invoiceFiles?.list?.({ invoiceId: (form.draft as any).id })
                              setEditInvoiceFiles(res?.files || [])
                            }
                          } finally { if (editInvoiceFileInputRef.current) editInvoiceFileInputRef.current.value = '' }
                        }} />
                        <button className="btn" onClick={() => editInvoiceFileInputRef.current?.click?.()}>+ Dateien auswählen</button>
                        <span className="helper">oder hierher ziehen</span>
                      </div>
                      <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                        <thead><tr><th align="left">Datei</th><th align="right">Größe</th><th align="center">Aktion</th></tr></thead>
                        <tbody>
                          {(editInvoiceFiles || []).map((f) => {
                            const sizeMB = f.size != null ? (Number(f.size) / 1024 / 1024) : null
                            return (
                              <tr key={f.id}>
                                <td className="invoices-file-name" title={f.fileName}>{f.fileName}</td>
                                <td align="right">{sizeMB != null ? (sizeMB >= 0.01 ? sizeMB.toFixed(2) : sizeMB.toFixed(4)) + ' MB' : '—'}</td>
                                <td align="center"><button className="btn danger" onClick={async () => {
                                  try { await window.api?.invoiceFiles?.delete?.({ fileId: f.id }); const res = await window.api?.invoiceFiles?.list?.({ invoiceId: (form.draft as any).id }); setEditInvoiceFiles(res?.files || []) } catch (e: any) { alert(e?.message || String(e)) }
                                }}>Entfernen</button></td>
                              </tr>
                            )
                          })}
                          {(editInvoiceFiles || []).length === 0 && <tr><td colSpan={3} className="helper">Keine Dateien.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {(() => {
              const missing: string[] = []
              if (!form!.draft.date) missing.push('Datum')
              if (!(form!.draft.invoiceNo || '').trim()) missing.push('Verbindlichkeitsnummer')
              if (!form!.draft.party?.trim()) missing.push('Partei')
              const a = parseAmount(form!.draft.grossAmount)
              if (a == null || a <= 0) missing.push('Betrag')
              return (
                <div className="invoices-form-footer">
                  <div className="helper">Ctrl+S = Speichern · Esc = Abbrechen</div>
                  <div className="invoices-form-footer-actions">
                    {form.mode === 'edit' && form.draft.id && (
                      <button className="btn danger" onClick={() => { const inv = form.sourceRow; if (inv) setDeleteConfirm(inv) }}>🗑 Löschen</button>
                    )}
                    <button className="btn" onClick={() => setForm(null)}>Abbrechen</button>
                    <button className="btn primary" onClick={() => { setRequiredTouched(true); if (missing.length > 0) { setMissingRequired(missing); return } saveForm() }}>Speichern</button>
                  </div>
                </div>
              )
            })()}
            <datalist id="party-suggestions">{partySuggestions.map((p, i) => <option key={i} value={p} />)}</datalist>
            <datalist id="desc-suggestions">{descSuggestions.map((p, i) => <option key={i} value={p} />)}</datalist>
          </div>
        </div>, document.body)}

        {missingRequired.length > 0 && createPortal(
          <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setMissingRequired([])}>
            <div className="modal invoices-missing-modal" onClick={e => e.stopPropagation()}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Pflichtfelder fehlen</h3>
                <button className="btn" onClick={() => setMissingRequired([])} aria-label="Schließen">×</button>
              </header>
              <div className="card" style={{ padding: 10 }}>
                <div>Bitte ergänze die folgenden Felder:</div>
                <ul className="helper invoices-missing-list">
                  {missingRequired.map(f => <li key={f}>{f}</li>)}
                </ul>
              </div>
              <div className="invoices-missing-actions">
                <button className="btn primary" onClick={() => setMissingRequired([])}>OK</button>
              </div>
            </div>
          </div>, document.body)}

      {detailId != null && createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => { setDetailId(null); setDetail(null) }}>
          <div className="modal invoices-detail-grid" onClick={e => e.stopPropagation()} style={{ maxWidth: 860 }}>
            <div className="invoices-detail-header">
              <h2 style={{ margin: 0 }}>{detail?.voucherType === 'IN' ? 'Forderung' : 'Verbindlichkeit'} {detail?.invoiceNo ? `#${detail.invoiceNo}` : (detail ? `#${detail.id}` : '')}</h2>
              <div className="invoices-detail-header-actions">
                <button className="btn ghost" onClick={() => { setDetailId(null); setDetail(null) }}>✕</button>
              </div>
            </div>
            {loadingDetail && <div className="helper">Lade Details…</div>}
            {!loadingDetail && detail && (
              <div className="invoices-detail-grid">
                <div className="card" style={{ padding: 12 }}>
                  <div className="invoices-detail-overview">
                    <div className="invoices-detail-overview-left">
                      <div style={{ fontWeight: 600 }}>{detail.party}</div>
                      <div className="helper">{detail.description || '—'}</div>
                    </div>
                    <div>{statusBadge(detail.status)}</div>
                  </div>
                  <div className="invoices-detail-info-grid">
                    <div><div className="helper">Datum</div><div>{fmtDateLocal(detail.date)}</div></div>
                    <div><div className="helper">Fällig</div><div>{fmtDateLocal(detail.dueDate || '')}</div></div>
                    <div><div className="helper">Sphäre</div><div>{detail.sphere}</div></div>
                    <div><div className="helper">Zahlweg</div><div>{detail.paymentMethod || '—'}</div></div>
                    <div><div className="helper">Betrag</div><div>{eurFmt.format(detail.grossAmount)}</div></div>
                    <div><div className="helper">Bezahlt</div><div>{eurFmt.format(detail.paidSum || 0)}</div></div>
                    <div><div className="helper">Rest</div><div className={Math.max(0, Math.round((detail.grossAmount - (detail.paidSum || 0)) * 100) / 100) > 0 ? 'invoices-rest-danger' : 'invoices-rest-success'}>{eurFmt.format(Math.max(0, Math.round((detail.grossAmount - (detail.paidSum || 0)) * 100) / 100))}</div></div>
                    <div><div className="helper">Auto-Buchung</div><div>{(detail.autoPost ?? 0) ? 'ja' : 'nein'}</div></div>
                    <div><div className="helper">Buchungstyp</div><div>{detail.voucherType}</div></div>
                    <div>
                      <div className="helper">Verknüpfte Buchung</div>
                      <div>
                        {(detail.postedVoucherNo || detail.postedVoucherId) ? (
                          <button className="chip" title="Zur Buchung springen" onClick={() => {
                            const q = detail.postedVoucherNo || ''
                            if (q) { try { window.dispatchEvent(new CustomEvent('apply-voucher-jump', { detail: { q } })) } catch {} }
                            else if (detail.postedVoucherId) { try { window.dispatchEvent(new CustomEvent('apply-voucher-jump', { detail: { voucherId: detail.postedVoucherId } })) } catch {} }
                            setDetailId(null); setDetail(null)
                          }} style={{ color: '#fff' }}>{detail.postedVoucherNo ? detail.postedVoucherNo : `#${detail.postedVoucherId}`}</button>
                        ) : '—'}
                      </div>
                    </div>
                  </div>
                  {(detail.tags || []).length > 0 && (
                    <div className="invoices-detail-tags">
                      {(detail.tags || []).map(t => {
                        const def = (tags || []).find(td => (td.name || '').toLowerCase() === (t || '').toLowerCase())
                        const bg = def?.color || undefined
                        const fg = bg ? contrastText(bg) : undefined
                        return (
                          <button key={t} className="chip" onClick={() => { setTag(t); setOffset(0) }} title={`Nach Tag "${t}" filtern`} style={bg ? { background: bg, color: fg, borderColor: bg } : undefined}>{t}</button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="invoices-detail-split">
                  <div className="card" style={{ padding: 12 }}>
                    <strong>Zahlungen</strong>
                    <table cellPadding={6} className="invoices-table" style={{ marginTop: 6 }}>
                      <thead><tr><th align="left">Datum</th><th align="right">Betrag</th></tr></thead>
                      <tbody>
                        {(detail.payments || []).map(p => (<tr key={p.id}><td>{fmtDateLocal(p.date)}</td><td align="right">{eurFmt.format(p.amount)}</td></tr>))}
                        {detail.payments.length === 0 && <tr><td colSpan={2} className="helper">Keine Zahlungen.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="card" style={{ padding: 12 }}>
                    <strong>Dateien</strong>
                    <table cellPadding={6} className="invoices-table" style={{ marginTop: 6 }}>
                      <thead><tr><th align="left">Datei</th><th align="right">Größe</th><th align="left">Datum</th><th align="center">Aktion</th></tr></thead>
                      <tbody>
                        {(detail.files || []).map(f => {
                          const sizeMB = f.size != null ? (Number(f.size) / 1024 / 1024) : null
                          return (
                            <tr key={f.id}>
                              <td>{f.fileName}</td>
                              <td align="right">{sizeMB != null ? (sizeMB >= 0.01 ? sizeMB.toFixed(2) : sizeMB.toFixed(4)) + ' MB' : '—'}</td>
                              <td>{f.createdAt || '—'}</td>
                            <td align="center" style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                              <button className="btn" title="Datei öffnen" onClick={async () => {
                                try { const res = await window.api?.invoiceFiles?.open?.({ fileId: f.id }); if (!res?.ok) alert('Datei konnte nicht geöffnet werden') } catch (e: any) { alert(e?.message || String(e)) }
                              }}>Öffnen</button>
                              <button className="btn" title="Speichern unter …" onClick={async () => {
                                try { const res = await window.api?.invoiceFiles?.saveAs?.({ fileId: f.id }); if (res?.filePath) alert(`Gespeichert: ${res.filePath}`) } catch (e: any) { const msg = e?.message || String(e); if (!/Abbruch/i.test(msg)) alert(msg) }
                              }}>Speichern…</button>
                              <button className="btn danger" title="Datei entfernen" onClick={async () => {
                                if (!confirm(`Datei "${f.fileName}" wirklich entfernen?`)) return
                                try {
                                  await window.api?.invoiceFiles?.delete?.({ fileId: f.id })
                                  const updated = await window.api?.invoices?.get?.({ id: detail.id })
                                  if (updated) setDetail(updated)
                                } catch (e: any) { alert(e?.message || String(e)) }
                              }}>Entfernen</button>
                            </td>
                          </tr>
                        )
                        })}
                        {detail.files.length === 0 && <tr><td colSpan={4} className="helper">Keine Dateien.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="invoices-detail-footer">
                  <button className="btn" onClick={() => { setDetailId(null); setDetail(null) }}>Schließen</button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Column selection modal */}
      {showColumnsModal && (
        <div className="modal-overlay" onClick={() => setShowColumnsModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, display: 'grid', gap: 10 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Spalten auswählen</h3>
              <button className="btn" onClick={() => setShowColumnsModal(false)}>×</button>
            </header>
            <div className="card" style={{ padding: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={colPrefs.showTags} onChange={(e) => setColPrefs(p => ({ ...p, showTags: e.target.checked }))} />
                Tags anzeigen
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <input type="checkbox" checked={colPrefs.showBezahlt} onChange={(e) => setColPrefs(p => ({ ...p, showBezahlt: e.target.checked }))} />
                Bezahlt anzeigen
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <input type="checkbox" checked={colPrefs.showRest} onChange={(e) => setColPrefs(p => ({ ...p, showRest: e.target.checked }))} />
                Rest anzeigen
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <input type="checkbox" checked={colPrefs.showAttachments} onChange={(e) => setColPrefs(p => ({ ...p, showAttachments: e.target.checked }))} />
                Anhänge (📎) anzeigen
              </label>
              <div className="helper" style={{ marginTop: 8 }}>Tipp: Blende Spalten aus, die du nicht benötigst, um die Übersicht zu verbessern.</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setShowColumnsModal(false)}>Schließen</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
            <ModalHeader 
              title="Verbindlichkeit löschen" 
              subtitle={`${deleteConfirm.invoiceNo ? `Nr. ${deleteConfirm.invoiceNo}` : `#${deleteConfirm.id}`} · ${deleteConfirm.party || ''}`}
              onClose={() => setDeleteConfirm(null)} 
            />
            <div>Diese Verbindlichkeit wirklich löschen?</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
              <button className="btn danger" disabled={busyAction} onClick={() => { deleteInvoice(deleteConfirm.id); setForm(null) }}>Ja, löschen</button>
            </div>
          </div>
        </div>, document.body)}

      {postToVoucherModal && createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setPostToVoucherModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
            <ModalHeader
              title="Als Buchung hinzufügen"
              subtitle={`${postToVoucherModal.invoiceNo ? `Verbindlichkeit ${postToVoucherModal.invoiceNo}` : `Verbindlichkeit #${postToVoucherModal.id}`}`}
              onClose={() => setPostToVoucherModal(null)} 
            />
            <div style={{ marginBottom: 16 }}>
              <strong>{postToVoucherModal.party}</strong>
            </div>
            <div className="helper" style={{ marginBottom: 16 }}>
              Diese bezahlte Verbindlichkeit als Buchung hinzufügen?
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setPostToVoucherModal(null)}>Abbrechen</button>
              <button className="btn primary" disabled={busyAction} onClick={async () => {
                setBusyAction(true)
                try {
                  const result = await (window as any).api?.invoices?.postToVoucher?.({ invoiceId: postToVoucherModal.id })
                  if (result?.voucherId) {
                    // Update the row in state immediately
                    setRows(prev => prev.map(r => 
                      r.id === postToVoucherModal.id 
                        ? { ...r, postedVoucherId: result.voucherId } 
                        : r
                    ))
                  }
                  notify?.('success', 'Verbindlichkeit wurde als Buchung hinzugefügt')
                  setPostToVoucherModal(null)
                  await Promise.all([load(), loadSummary()])
                } catch (e: any) {
                  notify?.('error', e?.message || String(e))
                } finally {
                  setBusyAction(false)
                }
              }}>OK</button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  )
}
