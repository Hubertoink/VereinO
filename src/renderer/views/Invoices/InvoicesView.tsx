import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from '../../context/ToastContext'

// Local copy of contrastText (could be centralized later)
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

// Duplicate of TimeFilterModal required by InvoicesView (extract later)
function TimeFilterModal({ open, onClose, yearsAvail, from, to, onApply }: { open: boolean; onClose: () => void; yearsAvail: number[]; from: string; to: string; onApply: (v: { from: string; to: string }) => void }) {
  const [f, setF] = useState<string>(from)
  const [t, setT] = useState<string>(to)
  useEffect(() => { setF(from); setT(to) }, [from, to, open])
  return open ? (
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
            <select className="input" value={(() => { if (!f || !t) return ''; const fy = f.slice(0, 4); const ty = t.slice(0, 4); if (f === `${fy}-01-01` && t === `${fy}-12-31` && fy === ty) return fy; return '' })()} onChange={(e) => { const y = e.target.value; if (!y) { setF(''); setT(''); return }; const yr = Number(y); const nf = new Date(Date.UTC(yr, 0, 1)).toISOString().slice(0, 10); const nt = new Date(Date.UTC(yr, 11, 31)).toISOString().slice(0, 10); setF(nf); setT(nt) }}>
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
  ) : null
}

// Local TagsEditor copy (TODO: centralize)
function TagsEditor({ label, value, onChange, tagDefs, className }: { label?: string; value: string[]; onChange: (v: string[]) => void; tagDefs: Array<{ id: number; name: string; color?: string | null }>; className?: string }) {
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)
  const sugg = useMemo(() => {
    const q = input.trim().toLowerCase()
    const existing = new Set((value || []).map(v => v.toLowerCase()))
    return (tagDefs || []).filter(t => !existing.has((t.name || '').toLowerCase()) && (!q || t.name.toLowerCase().includes(q))).slice(0, 8)
  }, [input, tagDefs, value])
  function addTag(name: string) { const n = (name || '').trim(); if (!n) return; if (!(value || []).includes(n)) onChange([...(value || []), n]); setInput('') }
  function removeTag(name: string) { onChange((value || []).filter(v => v !== name)) }
  const colorFor = (name: string) => (tagDefs || []).find(t => (t.name || '').toLowerCase() === (name || '').toLowerCase())?.color
  return (
    <div className={`field ${className || ''}`.trim()} style={{ gridColumn: '1 / span 2' }}>
      {label && <label>{label}</label>}
      <div className="input" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 34 }}>
        {(value || []).map((t) => { const bg = colorFor(t) || undefined; const fg = contrastText(bg); return (
          <span key={t} className="chip" style={{ background: bg, color: bg ? fg : undefined }}>
            {t}
            <button className="chip-x" onClick={() => removeTag(t)} aria-label={`Tag ${t} entfernen`} type="button">×</button>
          </span> ) })}
        <select className="input" value="" onChange={(e) => { const name = e.target.value; if (name) addTag(name) }} style={{ minWidth: 140 }} title="Tag aus Liste hinzufügen">
          <option value="">+ Tag auswählen…</option>
          {(tagDefs || []).filter(t => !(value || []).some(v => v.toLowerCase() === (t.name || '').toLowerCase())).map(t => (
            <option key={t.id} value={t.name}>{t.name}</option>
          ))}
        </select>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input) }
          if (e.key === 'Backspace' && !input && (value || []).length) { removeTag((value || [])[value.length - 1]) }
        }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={(value || []).length ? '' : 'Tag hinzufügen…'} style={{ flex: 1, minWidth: 120, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)' }} />
      </div>
      {focused && sugg.length > 0 && (
        <div className="card" style={{ padding: 6, marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {sugg.map(s => { const bg = s.color || undefined; const fg = contrastText(bg); return <button key={s.id} type="button" className="btn" style={{ background: bg, color: bg ? fg : undefined }} onClick={() => addTag(s.name)}>{s.name}</button> })}
        </div>
      )}
    </div>
  )
}

// Invoices list with filters, pagination, and basic actions (add payment / delete)
export default function InvoicesView() {
  const { notify } = useToast()
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
  const [summary, setSummary] = useState<{ count: number; gross: number; paid: number; remaining: number } | null>(null)
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>(() => { try { return ((localStorage.getItem('invoices.sort') as 'ASC' | 'DESC') || 'ASC') } catch { return 'ASC' } })
  const [sortBy, setSortBy] = useState<'date' | 'due' | 'amount' | 'status'>(() => { try { return ((localStorage.getItem('invoices.sortBy') as 'date' | 'due' | 'amount' | 'status') || 'due') } catch { return 'due' } })
  const [showDueFilter, setShowDueFilter] = useState<boolean>(false)
  const [yearsAvail, setYearsAvail] = useState<number[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [rows, setRows] = useState<any[]>([])
  const [error, setError] = useState<string>('')
  const [tags, setTags] = useState<Array<{ id: number; name: string; color?: string | null }>>([])
  const [budgets, setBudgets] = useState<Array<{ id: number; name?: string | null; year: number }>>([])
  const [earmarks, setEarmarks] = useState<Array<{ id: number; code: string; name: string; color?: string | null }>>([])

  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const dateFmtPref = useMemo(() => { try { return (localStorage.getItem('ui.dateFmt') as 'ISO' | 'PRETTY') || 'ISO' } catch { return 'ISO' } }, [])
  const fmtDateLocal = useMemo(() => { const pretty = (s?: string) => { if (!s) return ''; const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return s || ''; const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]); const dt = new Date(Date.UTC(y, mo - 1, d)); const mon = dt.toLocaleString('de-DE', { month: 'short' }).replace('.', ''); const dd = String(d).padStart(2, '0'); return `${dd} ${mon} ${y}` }; return (s?: string) => dateFmtPref === 'PRETTY' ? pretty(s) : (s || '') }, [dateFmtPref])

  const [qDebounced, setQDebounced] = useState('')
  useEffect(() => { const t = setTimeout(() => setQDebounced(q.trim()), 250); return () => clearTimeout(t) }, [q])

  useEffect(() => { let cancelled = false; (async () => { try { const t = await window.api?.tags?.list?.({}); if (!cancelled) setTags((t?.rows || []).map(r => ({ id: r.id, name: r.name, color: r.color ?? null }))) } catch { } try { const b = await window.api?.budgets?.list?.({}); if (!cancelled) setBudgets((b?.rows || []).map(r => ({ id: r.id, name: r.name || r.categoryName || r.projectName || undefined, year: r.year }))) } catch { } try { const em = await window.api?.bindings?.list?.({ activeOnly: true }); if (!cancelled) setEarmarks((em?.rows || []).map(r => ({ id: r.id, code: r.code, name: r.name, color: r.color ?? null }))) } catch { } try { const y = await window.api?.reports?.years?.(); if (!cancelled && y?.years) setYearsAvail(y.years) } catch { } })(); return () => { cancelled = true } }, [])

  const [flashId, setFlashId] = useState<number | null>(null)

  async function load() {
    setLoading(true); setError('')
    try { const res = await window.api?.invoices?.list?.({ limit, offset, sort: sortDir, sortBy, status, sphere: sphere || undefined, budgetId: typeof budgetId === 'number' ? budgetId : undefined, q: qDebounced || undefined, dueFrom: dueFrom || undefined, dueTo: dueTo || undefined, tag: tag || undefined }); setRows(res?.rows || []); setTotal(res?.total || 0) } catch (e: any) { setError(e?.message || String(e)) } finally { setLoading(false) }
  }
  async function loadSummary() {
    try { const res = await window.api?.invoices?.summary?.({ status, sphere: sphere || undefined, budgetId: typeof budgetId === 'number' ? budgetId : undefined, q: qDebounced || undefined, dueFrom: dueFrom || undefined, dueTo: dueTo || undefined, tag: tag || undefined }); setSummary(res || null) } catch { setSummary(null) }
  }
  useEffect(() => { load() }, [limit, offset, status, sphere, budgetId, qDebounced, dueFrom, dueTo, tag, sortDir, sortBy])
  useEffect(() => { loadSummary() }, [status, sphere, budgetId, qDebounced, dueFrom, dueTo, tag])
  useEffect(() => { const onChanged = () => { loadSummary() }; try { window.addEventListener('data-changed', onChanged) } catch { } return () => { try { window.removeEventListener('data-changed', onChanged) } catch { } } }, [status, sphere, budgetId, qDebounced, dueFrom, dueTo, tag])
  useEffect(() => { try { localStorage.setItem('invoices.sort', sortDir) } catch { } }, [sortDir])
  useEffect(() => { try { localStorage.setItem('invoices.sortBy', sortBy) } catch { } }, [sortBy])

  function clearFilters() { setQ(''); setStatus('ALL'); setSphere(''); setDueFrom(''); setDueTo(''); setBudgetId(''); setTag(''); setOffset(0) }

  const page = Math.floor(offset / limit) + 1
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)))
  const canPrev = offset > 0
  const canNext = offset + limit < total

  const [showPayModal, setShowPayModal] = useState<null | { id: number; party?: string; invoiceNo?: string | null; remaining: number }>(null)
  const [payDate, setPayDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [payAmount, setPayAmount] = useState<string>('')
  const [busyAction, setBusyAction] = useState<boolean>(false)
  const [deleteConfirm, setDeleteConfirm] = useState<null | { id: number; party?: string; invoiceNo?: string | null }>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [detail, setDetail] = useState<null | { id: number; date: string; dueDate?: string | null; invoiceNo?: string | null; party: string; description?: string | null; grossAmount: number; paymentMethod?: string | null; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; earmarkId?: number | null; budgetId?: number | null; autoPost?: number; voucherType: 'IN' | 'OUT'; postedVoucherId?: number | null; postedVoucherNo?: string | null; payments: Array<{ id: number; date: string; amount: number }>; files: Array<{ id: number; fileName: string; mimeType?: string | null; size?: number | null; createdAt?: string | null }>; tags: string[]; paidSum: number; status: 'OPEN' | 'PARTIAL' | 'PAID' }>(null)
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false)
  async function openDetails(id: number) { setDetailId(id) }
  useEffect(() => { let cancelled = false; async function fetchDetail() { if (!detailId) return; setLoadingDetail(true); try { const d = await window.api?.invoices?.get?.({ id: detailId }); if (!cancelled) setDetail(d || null) } catch (e) { if (!cancelled) setDetail(null) } finally { if (!cancelled) setLoadingDetail(false) } } fetchDetail(); return () => { cancelled = true } }, [detailId])
  useEffect(() => { function onOpen(e: any) { const id = Number(e?.detail?.id); if (isFinite(id) && id > 0) openDetails(id) } window.addEventListener('open-invoice-details', onOpen as any); return () => window.removeEventListener('open-invoice-details', onOpen as any) }, [])

  async function addPayment() {
    if (!showPayModal) return
    const amt = Number(payAmount.replace(',', '.'))
    if (!isFinite(amt) || Math.abs(amt) < 0.01) { alert('Bitte einen Betrag angeben'); return }
    const remainingCap = typeof showPayModal.remaining === 'number' ? Math.max(0, Math.round(showPayModal.remaining * 100) / 100) : undefined
    if (remainingCap != null && amt - remainingCap > 1e-6) { alert(`Der Betrag übersteigt den offenen Rest (${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(remainingCap)}).`); return }
    setBusyAction(true)
    try {
      const res = await window.api?.invoices?.addPayment?.({ invoiceId: showPayModal.id, date: payDate, amount: amt })
      if (res) {
        // Check if invoice has autoPost enabled before updating
        const invoiceRow = rows.find(r => r.id === showPayModal.id)
        const hasAutoPost = invoiceRow && !!(invoiceRow.autoPost ?? 0)
        
        setRows(prev => prev.map(r => r.id === showPayModal.id ? { ...r, paidSum: res.paidSum ?? (r.paidSum + amt), status: res.status } : r))
        
        // Show toast notification if invoice is now fully paid and has autoPost enabled
        if (res.status === 'PAID' && hasAutoPost) {
          const invoiceLabel = showPayModal.invoiceNo || `#${showPayModal.id}`
          notify('success', `Verbindlichkeit ${invoiceLabel} wurde automatisch als Buchung gebucht`)
        }
        
        setShowPayModal(null)
        try { window.dispatchEvent(new Event('data-changed')) } catch { }
        await loadSummary()
      }
    } catch (e: any) {
      alert(e?.message || String(e))
    } finally {
      setBusyAction(false)
    }
  }
  async function deleteInvoice(id: number) { setBusyAction(true); try { const res = await window.api?.invoices?.delete?.({ id }); if (res) { setRows(prev => prev.filter(r => r.id !== id)); setTotal(t => Math.max(0, t - 1)); await loadSummary() } } catch (e: any) { alert(e?.message || String(e)) } finally { setBusyAction(false); setDeleteConfirm(null) } }

  const statusBadge = (s: 'OPEN' | 'PARTIAL' | 'PAID') => { const map: Record<string, string> = { OPEN: 'var(--danger)', PARTIAL: '#f9a825', PAID: 'var(--success)' }; const bg = map[s] || 'var(--muted)'; const fg = contrastText(bg); return <span className="badge" style={{ background: bg, color: fg }}>{s}</span> }

  type InvoiceDraft = { id?: number; date: string; dueDate?: string | null; invoiceNo?: string | null; party: string; description?: string | null; grossAmount: string; paymentMethod?: '' | 'BAR' | 'BANK'; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; earmarkId?: number | ''; budgetId?: number | ''; autoPost: boolean; voucherType: 'IN' | 'OUT'; tags: string[] }
  const [form, setForm] = useState<null | { mode: 'create' | 'edit'; draft: InvoiceDraft; sourceRow?: any }>(null)
  const [formFiles, setFormFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const editInvoiceFileInputRef = useRef<HTMLInputElement | null>(null)
  const [editInvoiceFiles, setEditInvoiceFiles] = useState<Array<{ id: number; fileName: string; size?: number | null; createdAt?: string | null }>>([])
  const [formError, setFormError] = useState<string>('')
  function openCreate() { const today = new Date().toISOString().slice(0, 10); setForm({ mode: 'create', draft: { date: today, dueDate: null, invoiceNo: '', party: '', description: '', grossAmount: '', paymentMethod: 'BANK', sphere: 'IDEELL', earmarkId: '', budgetId: '', autoPost: true, voucherType: 'OUT', tags: [] } }); setFormFiles([]); setFormError('') }
  function openEdit(row: any) { setForm({ mode: 'edit', draft: { id: row.id, date: row.date, dueDate: row.dueDate ?? null, invoiceNo: row.invoiceNo ?? '', party: row.party, description: row.description ?? '', grossAmount: String(row.grossAmount ?? ''), paymentMethod: (row.paymentMethod ?? '') as any, sphere: row.sphere, earmarkId: (typeof row.earmarkId === 'number' ? row.earmarkId : '') as any, budgetId: (typeof row.budgetId === 'number' ? row.budgetId : '') as any, autoPost: !!(row.autoPost ?? 0), voucherType: row.voucherType, tags: (row.tags || []) as string[] }, sourceRow: row }); setFormFiles([]); setFormError('') }
  function parseAmount(input: string): number | null { if (!input) return null; const s = input.replace(/\./g, '').replace(',', '.'); const n = Number(s); return isFinite(n) ? Math.round(n * 100) / 100 : null }
  async function saveForm() {
    if (!form) return; setFormError(''); const d = form.draft; if (!d.date) { setFormError('Bitte Datum angeben'); return } if (!d.party || !d.party.trim()) { setFormError('Bitte Partei angeben'); return } const amt = parseAmount(d.grossAmount); if (amt == null || amt <= 0) { setFormError('Bitte gültigen Betrag eingeben (> 0)'); return }
    try {
      if (form.mode === 'create') {
        let files: { name: string; dataBase64: string; mime?: string }[] | undefined
        if (formFiles.length) { const enc = async (f: File) => { const buf = await f.arrayBuffer(); let binary = ''; const bytes = new Uint8Array(buf); const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) { binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any) } const dataBase64 = btoa(binary); return { name: f.name, dataBase64, mime: f.type || undefined } }; files = await Promise.all(formFiles.map(enc)) }
        const payload = { date: d.date, dueDate: d.dueDate || null, invoiceNo: (d.invoiceNo || '').trim() || null, party: d.party.trim(), description: (d.description || '').trim() || null, grossAmount: amt, paymentMethod: d.paymentMethod || null, sphere: d.sphere, earmarkId: (typeof d.earmarkId === 'number') ? d.earmarkId : null, budgetId: (typeof d.budgetId === 'number') ? d.budgetId : null, autoPost: !!d.autoPost, voucherType: d.voucherType, files, tags: d.tags || [] }
        const res = await window.api?.invoices?.create?.(payload as any)
        if (res?.id) { setForm(null); setFormFiles([]); setOffset(0); setFlashId(res.id); window.setTimeout(() => setFlashId((cur) => (cur === res.id ? null : cur)), 3000); await Promise.all([load(), loadSummary()]) }
      } else {
        const payload = { id: d.id!, date: d.date, dueDate: d.dueDate || null, invoiceNo: (d.invoiceNo || '').trim() || null, party: d.party.trim(), description: (d.description || '').trim() || null, grossAmount: amt, paymentMethod: d.paymentMethod || null, sphere: d.sphere, earmarkId: (typeof d.earmarkId === 'number') ? d.earmarkId : null, budgetId: (typeof d.budgetId === 'number') ? d.budgetId : null, autoPost: !!d.autoPost, voucherType: d.voucherType, tags: d.tags || [] }
        const res = await window.api?.invoices?.update?.(payload as any)
        if (res?.id) { setForm(null); setFormFiles([]); if (payload.id) { setFlashId(payload.id); window.setTimeout(() => setFlashId((cur) => (cur === payload.id ? null : cur)), 3000) }; await Promise.all([load(), loadSummary()]) }
      }
    } catch (e: any) { setFormError(e?.message || String(e)) }
  }
  function removeFileAt(i: number) { setFormFiles(prev => prev.filter((_, idx) => idx !== i)) }

  const partySuggestions = useMemo(() => { const set = new Set<string>(); for (const r of rows) { if (r?.party) set.add(String(r.party)) } return Array.from(set).sort().slice(0, 30) }, [rows])
  const descSuggestions = useMemo(() => { const set = new Set<string>(); for (const r of rows) { if (r?.description) set.add(String(r.description)) } return Array.from(set).sort().slice(0, 30) }, [rows])

  useEffect(() => { if (!form) return; function onKey(e: KeyboardEvent) { const target = e.target as HTMLElement | null; const tagName = (target?.tagName || '').toLowerCase(); const inEditable = !!(target && ((target as any).isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select')); if (e.key === 'Escape') { setForm(null); e.preventDefault(); return } if (e.key === 'Enter' && !e.shiftKey && inEditable && tagName !== 'textarea') { saveForm(); e.preventDefault(); return } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') { if (form.mode === 'create') fileInputRef.current?.click(); else editInvoiceFileInputRef.current?.click(); e.preventDefault(); return } } window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [form])
  useEffect(() => { let alive = true; async function loadFiles() { try { if (form && form.mode === 'edit' && (form.draft as any).id) { const res = await window.api?.invoiceFiles?.list?.({ invoiceId: (form.draft as any).id }); if (alive && res?.files) setEditInvoiceFiles(res.files as any) } else { if (alive) setEditInvoiceFiles([]) } } catch { } } loadFiles(); return () => { alive = false } }, [form?.mode, (form?.draft as any)?.id])

  return (
    <div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Verbindlichkeiten</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" placeholder="Suche Verbindlichkeiten (Nr., Partei, Text)…" value={q} onChange={e => { setQ(e.target.value); setOffset(0) }} style={{ width: 280 }} />
          <select className="input" value={status} onChange={e => { setStatus(e.target.value as any); setOffset(0) }}>
            <option value="ALL">Alle</option><option value="OPEN">Offen</option><option value="PARTIAL">Teilweise</option><option value="PAID">Bezahlt</option>
          </select>
          <select className="input" value={sphere} onChange={e => { setSphere((e.target.value || '') as any); setOffset(0) }}>
            <option value="">Sphäre: alle</option><option value="IDEELL">IDEELL</option><option value="ZWECK">ZWECK</option><option value="VERMOEGEN">VERMÖGEN</option><option value="WGB">WGB</option>
          </select>
          <select className="input" value={String(budgetId)} onChange={e => { const v = e.target.value; setBudgetId(v && v !== '' ? Number(v) : ''); setOffset(0) }}>
            <option value="">Budget: alle</option>
            {budgets.map(b => (<option key={b.id} value={b.id}>{b.year}{b.name ? ` – ${b.name}` : ''}</option>))}
          </select>
          <select className="input" value={tag} onChange={e => { setTag(e.target.value); setOffset(0) }}>
            <option value="">Tag: alle</option>
            {tags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <span style={{ color: 'var(--text-dim)' }}>Fällig:</span>
          <button className="btn" title="Fälligkeits-Zeitraum/Jahr wählen" onClick={() => setShowDueFilter(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1a11 11 0 1 0 11 11A11.013 11.013 0 0 0 12 1Zm0 20a9 9 0 1 1 9-9 9.01 9.01 0 0 1-9 9Zm.5-14h-2v6l5.2 3.12 1-1.64-4.2-2.48Z" /></svg>
          </button>
          {(dueFrom || dueTo) && (<span className="helper">{dueFrom || '—'} – {dueTo || '—'}</span>)}
          {(() => { const hasFilters = !!(q.trim() || (status !== 'ALL') || sphere || budgetId || tag || dueFrom || dueTo); return hasFilters ? (<button className="btn ghost" onClick={clearFilters} title="Alle Filter löschen">Filter zurücksetzen</button>) : null })()}
          <div style={{ width: 12 }} />
          <button className="btn primary" onClick={() => openCreate()}>+ Neu</button>
        </div>
      </div>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      {loading ? (<div className="helper">Lade…</div>) : (<>
        {summary && (<div className="helper" style={{ marginBottom: 6 }}>Offen gesamt: <strong>{eurFmt.format(Math.max(0, Math.round((summary.remaining || 0) * 100) / 100))}</strong><span style={{ marginLeft: 8, color: 'var(--text-dim)' }}>({summary.count} Verbindlichkeiten; Brutto {eurFmt.format(summary.gross || 0)}, Bezahlt {eurFmt.format(summary.paid || 0)})</span></div>)}
        <table cellPadding={6} style={{ width: '100%' }}>
          <thead><tr><th align="center" title="Typ">Typ</th><th align="left"><button className="btn ghost" title="Nach Datum sortieren" onClick={() => { setSortBy('date'); setSortDir(prev => (sortBy === 'date' ? (prev === 'DESC' ? 'ASC' : 'DESC') : (prev || 'DESC'))); setOffset(0) }} style={{ padding: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}><span>Datum</span><span aria-hidden="true" className="sort-icon" style={{ color: sortBy === 'date' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'date' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span></button></th><th align="left"><button className="btn ghost" title="Nach Fälligkeit sortieren" onClick={() => { setSortBy('due'); setSortDir(prev => (sortBy === 'due' ? (prev === 'DESC' ? 'ASC' : 'DESC') : (prev || 'ASC'))); setOffset(0) }} style={{ padding: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}><span>Fällig</span><span aria-hidden="true" className="sort-icon" style={{ color: sortBy === 'due' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'due' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span></button></th><th align="left">Nr.</th><th align="left">Partei</th><th align="left">Tags</th><th align="right"><button className="btn ghost" title="Nach Betrag sortieren" onClick={() => { setSortBy('amount'); setSortDir(prev => (sortBy === 'amount' ? (prev === 'DESC' ? 'ASC' : 'DESC') : (prev || 'DESC'))); setOffset(0) }} style={{ padding: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}><span>Brutto</span><span aria-hidden="true" className="sort-icon" style={{ color: sortBy === 'amount' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'amount' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span></button></th><th align="right">Bezahlt</th><th align="right">Rest</th><th align="left"><button className="btn ghost" title="Nach Status sortieren" onClick={() => { setSortBy('status'); setSortDir(prev => (sortBy === 'status' ? (prev === 'DESC' ? 'ASC' : 'DESC') : (prev || 'ASC'))); setOffset(0) }} style={{ padding: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}><span>Status</span><span aria-hidden="true" className="sort-icon" style={{ color: sortBy === 'status' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'status' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span></button></th><th align="center" title="Anhänge">📎</th><th align="center">Aktionen</th></tr></thead>
          <tbody>{rows.map((r: any) => { const remaining = Math.max(0, Math.round((Number(r.grossAmount || 0) - Number(r.paidSum || 0)) * 100) / 100); return (<tr key={r.id} className={flashId === r.id ? 'row-flash' : undefined}><td align="center" title={r.voucherType === 'IN' ? 'Einnahme' : 'Ausgabe'}><span className="badge" style={{ background: r.voucherType === 'IN' ? 'var(--success)' : 'var(--danger)', color: 'white', padding: '2px 6px' }}>{r.voucherType === 'IN' ? '↑ IN' : '↓ OUT'}</span></td><td>{fmtDateLocal(r.date)}</td>{(() => { const due = r.dueDate || ''; let style: React.CSSProperties | undefined; let title = 'Fälligkeit'; if (due) { try { const today = new Date(); const d = new Date(due); const diffMs = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).getTime() - new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).getTime(); const days = Math.round(diffMs / (1000 * 60 * 60 * 24)); if (days < 0) { style = { color: 'var(--danger)', fontWeight: 600 }; title = 'Überfällig' } else if (days <= 5) { style = { color: '#f9a825', fontWeight: 600 }; title = 'Fällig in ≤ 5 Tagen' } } catch { } } return (<td style={style} title={title}>{fmtDateLocal(due)}</td>) })()}<td>{r.invoiceNo || '—'}</td><td>{r.party}</td><td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{(r.tags || []).map((t: string) => { const def = (tags || []).find(td => (td.name || '').toLowerCase() === (t || '').toLowerCase()); const bg = def?.color || undefined; const fg = bg ? contrastText(bg) : undefined; return (<button key={t} className="chip" onClick={() => { setTag(t); setOffset(0) }} title={`Nach Tag "${t}" filtern`} style={bg ? { background: bg, color: fg, borderColor: bg } : undefined}>{t}</button>) })}</div></td><td align="right">{eurFmt.format(r.grossAmount)}</td><td align="right" title={`Summe Zahlungen`}>{eurFmt.format(r.paidSum || 0)}</td><td align="right" style={{ color: remaining > 0 ? 'var(--danger)' : 'var(--success)' }}>{eurFmt.format(remaining)}</td><td>{statusBadge(r.status)}</td><td align="center">{(r.fileCount || 0) > 0 ? <span className="badge">📎 {r.fileCount}</span> : ''}</td><td align="center" style={{ whiteSpace: 'nowrap' }}><button className="btn" title="Details" onClick={() => openDetails(r.id)}>ℹ</button><button className="btn" title="Bearbeiten" onClick={() => openEdit(r)}>✎</button>{remaining > 0 && r.status !== 'PAID' && (<button className="btn" title="Zahlung hinzufügen" onClick={() => { setShowPayModal({ id: r.id, party: r.party, invoiceNo: r.invoiceNo || null, remaining }); setPayAmount(String(remaining || '')) }}>{'€+'}</button>)}<button className="btn danger" title="Löschen" onClick={() => setDeleteConfirm({ id: r.id, party: r.party, invoiceNo: r.invoiceNo || null })}>🗑</button></td></tr>) })}{rows.length === 0 && (<tr><td colSpan={12} className="helper">Keine Rechnungen gefunden.</td></tr>)}</tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
          <div className="helper">Gesamt: {total}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label className="helper">Pro Seite</label>
            <select className="input" value={limit} onChange={e => { setLimit(Number(e.target.value)); setOffset(0) }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select>
            <button className="btn" disabled={!canPrev} onClick={() => setOffset(Math.max(0, offset - limit))}>Zurück</button>
            <span className="helper">Seite {page} / {pages}</span>
            <button className="btn" disabled={!canNext} onClick={() => setOffset(offset + limit)}>Weiter</button>
          </div>
        </div>
      </>)}

      <TimeFilterModal open={showDueFilter} onClose={() => setShowDueFilter(false)} yearsAvail={yearsAvail} from={dueFrom} to={dueTo} onApply={({ from: nf, to: nt }) => { setDueFrom(nf); setDueTo(nt); setOffset(0) }} />

      {showPayModal && (<div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowPayModal(null)}><div className="modal" onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 10, maxWidth: 420 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0 }}>Zahlung hinzufügen</h2><button className="btn ghost" onClick={() => setShowPayModal(null)}>✕</button></div><div className="helper">{showPayModal.invoiceNo ? `Rechnung ${showPayModal.invoiceNo}` : `Rechnung #${showPayModal.id}`} · {showPayModal.party || ''}</div>{typeof showPayModal.remaining === 'number' && (<div className="helper">Offener Rest: <strong>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Math.max(0, Math.round(showPayModal.remaining * 100) / 100))}</strong></div>)}<div className="row"><div className="field"><label>Datum</label><input className="input" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} /></div><div className="field"><label>Betrag (EUR)</label><input className="input" type="text" inputMode="decimal" value={payAmount} onChange={e => setPayAmount(e.target.value)} onBlur={() => { if (!showPayModal) return; const cap = typeof showPayModal.remaining === 'number' ? Math.max(0, Math.round(showPayModal.remaining * 100) / 100) : undefined; const v = Number(String(payAmount || '').replace(',', '.')); if (isFinite(v) && cap != null && v - cap > 1e-6) setPayAmount(String(cap)) }} placeholder="z. B. 199,90" /></div></div><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn" onClick={() => setShowPayModal(null)}>Abbrechen</button><button className="btn primary" disabled={busyAction} onClick={addPayment}>Speichern</button></div></div></div>)}

      {deleteConfirm && (<div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteConfirm(null)}><div className="modal" onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 12, maxWidth: 520 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0 }}>Rechnung löschen</h2><button className="btn ghost" onClick={() => setDeleteConfirm(null)}>✕</button></div><div>Diese Rechnung wirklich löschen?<div className="helper">{deleteConfirm.invoiceNo ? `Nr. ${deleteConfirm.invoiceNo}` : `#${deleteConfirm.id}`} · {deleteConfirm.party || ''}</div></div><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn" onClick={() => setDeleteConfirm(null)}>Abbrechen</button><button className="btn danger" disabled={busyAction} onClick={() => deleteInvoice(deleteConfirm.id)}>Ja, löschen</button></div></div></div>)}

      {form && createPortal(<div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setForm(null)}><div className="modal invoice-modal" onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 10, width: 'min(1100px, 96vw)', maxHeight: '90vh', overflow: 'auto' }}><div className="card" style={{ padding: 10, display: 'grid', gap: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><h2 style={{ margin: 0 }}>{form.mode === 'create' ? 'Rechnung anlegen' : 'Rechnung bearbeiten'}</h2><div className="badge" title="Rechnungsdatum" style={{ padding: '2px 6px' }}><input aria-label="Datum" className="input" type="date" value={form.draft.date} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, date: e.target.value } }))} style={{ height: 26, padding: '2px 6px' }} /></div></div><div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{(() => { const missing: string[] = []; if (!form.draft.date) missing.push('Datum'); if (!form.draft.party?.trim()) missing.push('Partei'); if (!(form.draft.invoiceNo || '').trim()) missing.push('Rechnungsnummer'); const a = parseAmount(form.draft.grossAmount); if (a == null || a <= 0) missing.push('Betrag'); return missing.length ? (<span className="helper" style={{ whiteSpace: 'nowrap' }}>Fehlende Felder: {missing.join(', ')}</span>) : null })()}{form.mode === 'edit' && form.sourceRow?.status && <span className="badge" title="Zahlstatus">{String(form.sourceRow.status)}</span>}<button className="btn ghost" onClick={() => setForm(null)} aria-label="Schließen">✕</button></div></div><div className="helper" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><span>Buchungstyp: <strong style={{ color: form.draft.voucherType === 'IN' ? 'var(--success)' : 'var(--danger)' }}>{form.draft.voucherType}</strong></span><span>Betrag: <strong>{(() => { const a = parseAmount(form.draft.grossAmount); return a != null && a > 0 ? eurFmt.format(a) : '—' })()}</strong></span><span>Fällig: <strong>{form.draft.dueDate || '—'}</strong></span><span>Zahlweg: <strong>{form.draft.paymentMethod || '—'}</strong></span><span>Sphäre: <strong>{form.draft.sphere}</strong></span></div></div>{formError && <div style={{ color: 'var(--danger)' }}>{formError}</div>}<div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 3fr) minmax(320px, 2fr)', gap: 12 }}><div className="card" style={{ padding: 12, display: 'grid', gap: 10 }}><div className="field"><label>Rechnungsnummer <span className="req-asterisk" aria-hidden="true">*</span></label><input className="input" value={form.draft.invoiceNo || ''} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, invoiceNo: e.target.value } }))} placeholder="z. B. 2025-001" /></div><div className="field"><label>Partei <span className="req-asterisk" aria-hidden="true">*</span></label><input className="input party-input" list="party-suggestions" value={form.draft.party} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, party: e.target.value } }))} placeholder="Name der Partei" /></div><div className="field"><label>Beschreibung</label><input className="input" list="desc-suggestions" value={form.draft.description || ''} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, description: e.target.value } }))} placeholder="Kurzbeschreibung" /></div><div className="field"><label>Betrag (EUR) <span className="req-asterisk" aria-hidden="true">*</span></label><input className="input amount-input" inputMode="decimal" placeholder="z. B. 199,90" value={form.draft.grossAmount} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, grossAmount: e.target.value } }))} style={{ fontSize: 24, paddingTop: 10, paddingBottom: 10 }} /><div className="helper">{(() => { const a = parseAmount(form.draft.grossAmount); return a != null && a > 0 ? eurFmt.format(a) : 'Bitte Betrag eingeben' })()}</div></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><div className="field" style={{ minWidth: 160 }}><label>Fällig</label><input className="input" type="date" value={form.draft.dueDate || ''} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, dueDate: e.target.value || null } }))} style={{ minWidth: 0 }} /></div><div className="field" style={{ minWidth: 160 }}><label>Zahlweg</label><div style={{ display: 'flex', gap: 6 }}><button type="button" className="btn" style={{ width: 56, justifyContent: 'center', background: !form.draft.paymentMethod ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }} onClick={() => setForm(f => f && ({ ...f, draft: { ...f.draft, paymentMethod: '' } }))} title="Kein Zahlweg">—</button><button type="button" className="btn" style={{ width: 80, justifyContent: 'center', background: form.draft.paymentMethod === 'BAR' ? 'color-mix(in oklab, var(--accent) 25%, transparent)' : undefined }} onClick={() => setForm(f => f && ({ ...f, draft: { ...f.draft, paymentMethod: 'BAR' } }))} title="Bar">💵 Bar</button><button type="button" className="btn" style={{ width: 80, justifyContent: 'center', background: form.draft.paymentMethod === 'BANK' ? 'color-mix(in oklab, var(--accent) 25%, transparent)' : undefined }} onClick={() => setForm(f => f && ({ ...f, draft: { ...f.draft, paymentMethod: 'BANK' } }))} title="Bank">🏦 Bank</button></div></div><div className="field" style={{ minWidth: 180 }}><label>Buchungstyp</label><div style={{ display: 'flex', gap: 6 }}><button type="button" className="btn" style={{ width: 80, justifyContent: 'center', background: form.draft.voucherType === 'IN' ? 'color-mix(in oklab, var(--success) 25%, transparent)' : undefined }} onClick={() => setForm(f => f && ({ ...f, draft: { ...f.draft, voucherType: 'IN' } }))}>IN</button><button type="button" className="btn" style={{ width: 80, justifyContent: 'center', background: form.draft.voucherType === 'OUT' ? 'color-mix(in oklab, var(--danger) 25%, transparent)' : undefined }} onClick={() => setForm(f => f && ({ ...f, draft: { ...f.draft, voucherType: 'OUT' } }))}>OUT</button></div></div></div><TagsEditor label="Tags" value={form.draft.tags} onChange={tags => setForm(f => f && ({ ...f, draft: { ...f.draft, tags } }))} tagDefs={tags} className="tags-editor" /></div><div className="card" style={{ padding: 12, display: 'grid', gap: 10 }}><div className="field"><label>Sphäre <span className="helper">(Steuerlicher Bereich)</span></label><select className="input" value={form.draft.sphere} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, sphere: e.target.value as any } }))}><option value="IDEELL">IDEELL</option><option value="ZWECK">ZWECK</option><option value="VERMOEGEN">VERMÖGEN</option><option value="WGB">WGB</option></select></div><div className="field"><label>Zweckbindung</label><select className="input" value={(form.draft.earmarkId ?? '') as any} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, earmarkId: e.target.value ? Number(e.target.value) : '' } }))}><option value="">—</option>{earmarks.map(em => (<option key={em.id} value={em.id}>{em.code} – {em.name}</option>))}</select></div><div className="field"><label>Budget <span className="helper">(optional)</span></label><select className="input" value={(form.draft.budgetId ?? '') as any} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, budgetId: e.target.value ? Number(e.target.value) : '' } }))}><option value="">—</option>{budgets.map(b => (<option key={b.id} value={b.id}>{b.year}{b.name ? ` – ${b.name}` : ''}</option>))}</select></div><div className="field"><label>Auto-Buchung</label><select className="input" value={form.draft.autoPost ? '1' : '0'} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, autoPost: e.target.value === '1' } }))}><option value="1">Ja</option><option value="0">Nein</option></select></div>{form.mode === 'create' && (<div className="field"><label>Dateien</label><div onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const fl = e.dataTransfer?.files; if (fl && fl.length) setFormFiles(prev => [...prev, ...Array.from(fl)]) }} className="card" style={{ padding: 10, border: '1px dashed var(--muted)', background: 'color-mix(in oklab, var(--accent) 10%, transparent)' }}><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><input ref={fileInputRef} type="file" multiple accept=".png,.jpg,.jpeg,.pdf,.doc,.docx" style={{ display: 'none' }} onChange={e => { const f = Array.from(e.target.files || []); if (f.length) setFormFiles(prev => [...prev, ...f]); if (fileInputRef.current) fileInputRef.current.value = '' }} /><button className="btn" onClick={() => fileInputRef.current?.click()}>+ Dateien auswählen</button><span className="helper">oder hierher ziehen</span></div>{formFiles.length > 0 && (<table cellPadding={6} style={{ width: '100%', marginTop: 6 }}><thead><tr><th align="left">Datei</th><th align="right">Größe</th><th align="center">Aktion</th></tr></thead><tbody>{formFiles.map((f, i) => (<tr key={i}><td>{f.name}</td><td align="right">{f.size} B</td><td align="center"><button className="btn danger" onClick={() => removeFileAt(i)}>Entfernen</button></td></tr>))}</tbody></table>)}</div></div>)}{form.mode === 'edit' && (<div className="field"><label>Dateien</label><div onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }} onDrop={async (e) => { e.preventDefault(); e.stopPropagation(); const fl = e.dataTransfer?.files; if (fl && fl.length && (form.draft as any).id) { for (const f of Array.from(fl)) { const buf = await f.arrayBuffer(); let binary = ''; const bytes = new Uint8Array(buf); const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) { binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any) } const dataBase64 = btoa(binary); await window.api?.invoiceFiles?.add?.({ invoiceId: (form.draft as any).id, fileName: f.name, dataBase64, mimeType: (f as any).type || undefined }) } const res = await window.api?.invoiceFiles?.list?.({ invoiceId: (form.draft as any).id }); setEditInvoiceFiles(res?.files || []) }} } className="card" style={{ padding: 10, border: '1px dashed var(--muted)', background: 'color-mix(in oklab, var(--accent) 10%, transparent)' }}><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><input ref={editInvoiceFileInputRef} type="file" multiple hidden accept=".png,.jpg,.jpeg,.pdf,.doc,.docx" onChange={async (e) => { const files = Array.from(e.target.files || []); try { if (files.length && (form.draft as any).id) { for (const f of files) { const buf = await f.arrayBuffer(); let binary = ''; const bytes = new Uint8Array(buf); const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) { binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any) } const dataBase64 = btoa(binary); await window.api?.invoiceFiles?.add?.({ invoiceId: (form.draft as any).id, fileName: f.name, dataBase64, mimeType: (f as any).type || undefined }) } const res = await window.api?.invoiceFiles?.list?.({ invoiceId: (form.draft as any).id }); setEditInvoiceFiles(res?.files || []) } } finally { if (editInvoiceFileInputRef.current) editInvoiceFileInputRef.current.value = '' } }} /><button className="btn" onClick={() => editInvoiceFileInputRef.current?.click?.()}>+ Dateien auswählen</button><span className="helper">oder hierher ziehen</span></div><table cellPadding={6} style={{ width: '100%', marginTop: 6 }}><thead><tr><th align="left">Datei</th><th align="right">Größe</th><th align="center">Aktion</th></tr></thead><tbody>{(editInvoiceFiles || []).map((f) => (<tr key={f.id}><td>{f.fileName}</td><td align="right">{f.size != null ? `${f.size} B` : '—'}</td><td align="center"><button className="btn danger" onClick={async () => { try { await window.api?.invoiceFiles?.delete?.({ fileId: f.id }); const res = await window.api?.invoiceFiles?.list?.({ invoiceId: (form.draft as any).id }); setEditInvoiceFiles(res?.files || []) } catch (e: any) { alert(e?.message || String(e)) } }}>Entfernen</button></td></tr>))}{(editInvoiceFiles || []).length === 0 && <tr><td colSpan={3} className="helper">Keine Dateien.</td></tr>}</tbody></table></div></div>)}</div></div>{(() => { const missing: string[] = []; if (!form.draft.date) missing.push('Datum'); if (!form.draft.party?.trim()) missing.push('Partei'); if (!(form.draft.invoiceNo || '').trim()) missing.push('Rechnungsnummer'); const a = parseAmount(form.draft.grossAmount); if (a == null || a <= 0) missing.push('Betrag'); return (<div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}><button className="btn" onClick={() => setForm(null)}>Abbrechen (Esc)</button><button className="btn primary" onClick={saveForm} disabled={missing.length > 0}>Speichern (Enter)</button></div>) })()}<datalist id="party-suggestions">{partySuggestions.map((p, i) => <option key={i} value={p} />)}</datalist><datalist id="desc-suggestions">{descSuggestions.map((p, i) => <option key={i} value={p} />)}</datalist></div></div>, document.body)}

      {detailId != null && (<div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => { setDetailId(null); setDetail(null) }}><div className="modal" onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 10, maxWidth: 760 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><h2 style={{ margin: 0 }}>Rechnung {detail?.invoiceNo ? `#${detail.invoiceNo}` : (detail ? `#${detail.id}` : '')}</h2><div style={{ display: 'flex', gap: 6 }}>{detail && <button className="btn" onClick={() => { const d = detail as any; setDetailId(null); setDetail(null); setTimeout(() => openEdit(d), 0) }}>✎ Bearbeiten</button>}<button className="btn ghost" onClick={() => { setDetailId(null); setDetail(null) }}>✕</button></div></div>{loadingDetail && <div className="helper">Lade Details…</div>}{!loadingDetail && detail && (<div style={{ display: 'grid', gap: 12 }}><div className="card" style={{ padding: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><div style={{ display: 'grid', gap: 4 }}><div style={{ fontWeight: 600 }}>{detail.party}</div><div className="helper">{detail.description || '—'}</div></div><div>{statusBadge(detail.status)}</div></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 8 }}><div><div className="helper">Datum</div><div>{fmtDateLocal(detail.date)}</div></div><div><div className="helper">Fällig</div><div>{fmtDateLocal(detail.dueDate || '')}</div></div><div><div className="helper">Sphäre</div><div>{detail.sphere}</div></div><div><div className="helper">Zahlweg</div><div>{detail.paymentMethod || '—'}</div></div><div><div className="helper">Betrag</div><div>{eurFmt.format(detail.grossAmount)}</div></div><div><div className="helper">Bezahlt</div><div>{eurFmt.format(detail.paidSum || 0)}</div></div><div><div className="helper">Rest</div><div style={{ color: Math.max(0, Math.round((detail.grossAmount - (detail.paidSum || 0)) * 100) / 100) > 0 ? 'var(--danger)' : 'var(--success)' }}>{eurFmt.format(Math.max(0, Math.round((detail.grossAmount - (detail.paidSum || 0)) * 100) / 100))}</div></div><div><div className="helper">Auto-Buchung</div><div>{(detail.autoPost ?? 0) ? 'ja' : 'nein'}</div></div><div><div className="helper">Buchungstyp</div><div>{detail.voucherType}</div></div><div><div className="helper">Verknüpfte Buchung</div><div>{(detail.postedVoucherNo || detail.postedVoucherId) ? (<button className="chip" title="Zur Buchung springen" onClick={() => { const q2 = detail.postedVoucherNo || ''; if (q2) { try { window.dispatchEvent(new CustomEvent('apply-voucher-jump', { detail: { q: q2 } })) } catch { } } else if (detail.postedVoucherId) { try { window.dispatchEvent(new CustomEvent('apply-voucher-jump', { detail: { voucherId: detail.postedVoucherId } })) } catch { } } setDetailId(null); setDetail(null) }} style={{ color: '#fff' }}>{detail.postedVoucherNo ? detail.postedVoucherNo : `#${detail.postedVoucherId}`}</button>) : '—'}</div></div></div>{(detail.tags || []).length > 0 && (<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{(detail.tags || []).map(t => { const def = (tags || []).find(td => (td.name || '').toLowerCase() === (t || '').toLowerCase()); const bg = def?.color || undefined; const fg = bg ? contrastText(bg) : undefined; return (<button key={t} className="chip" onClick={() => { setTag(t); setOffset(0) }} title={`Nach Tag "${t}" filtern`} style={bg ? { background: bg, color: fg, borderColor: bg } : undefined}>{t}</button>) })}</div>)}</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div className="card" style={{ padding: 12 }}><strong>Zahlungen</strong><table cellPadding={6} style={{ width: '100%', marginTop: 6 }}><thead><tr><th align="left">Datum</th><th align="right">Betrag</th></tr></thead><tbody>{(detail.payments || []).map(p => (<tr key={p.id}><td>{fmtDateLocal(p.date)}</td><td align="right">{eurFmt.format(p.amount)}</td></tr>))}{detail.payments.length === 0 && <tr><td colSpan={2} className="helper">Keine Zahlungen.</td></tr>}</tbody></table></div><div className="card" style={{ padding: 12 }}><strong>Dateien</strong><table cellPadding={6} style={{ width: '100%', marginTop: 6 }}><thead><tr><th align="left">Datei</th><th align="right">Größe</th><th align="left">Datum</th><th align="center">Aktion</th></tr></thead><tbody>{(detail.files || []).map(f => (<tr key={f.id}><td>{f.fileName}</td><td align="right">{f.size != null ? `${f.size} B` : '—'}</td><td>{f.createdAt || '—'}</td><td align="center" style={{ display: 'flex', justifyContent: 'center', gap: 6 }}><button className="btn" title="Datei öffnen" onClick={async () => { try { const res = await window.api?.invoiceFiles?.open?.({ fileId: f.id }); if (!res?.ok) alert('Datei konnte nicht geöffnet werden') } catch (e: any) { alert(e?.message || String(e)) } }}>Öffnen</button><button className="btn" title="Speichern unter …" onClick={async () => { try { const res = await window.api?.invoiceFiles?.saveAs?.({ fileId: f.id }); if (res?.filePath) alert(`Gespeichert: ${res.filePath}`) } catch (e: any) { const msg = e?.message || String(e); if (!/Abbruch/i.test(msg)) alert(msg) } }}>Speichern…</button></td></tr>))}{detail.files.length === 0 && <tr><td colSpan={4} className="helper">Keine Dateien.</td></tr>}</tbody></table></div></div><div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn" onClick={() => { setDetailId(null); setDetail(null) }}>Schließen</button></div></div>)}</div></div>)}
    </div>
  )
}
