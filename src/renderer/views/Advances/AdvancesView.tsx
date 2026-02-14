import React, { useEffect, useMemo, useState } from 'react'
import { useToast } from '../../context/ToastContext'
import QuickAddModal from '../../components/modals/QuickAddModal'
import type { QA } from '../../hooks/useQuickAdd'

type DateFmt = 'ISO' | 'PRETTY'

type AdvanceStatus = 'OPEN' | 'RESOLVED' | 'ALL'

type AdvanceRow = {
  id: number
  memberId?: number | null
  recipientName: string
  memberName: string
  issuedAt: string
  amount: number
  settledAmount: number
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

type AdvanceDetail = AdvanceRow & {
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
    description?: string | null
    netAmount: number
    grossAmount: number
    vatRate: number
    paymentMethod?: 'BAR' | 'BANK' | null
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
    return (s?: string) => dateFmt === 'PRETTY' ? pretty(s) : (s || '')
  }, [dateFmt])

  const getBookedAmount = (amount: number, openAmount: number) => {
    const booked = Number(amount || 0) - Number(openAmount || 0)
    return booked > 0 ? booked : 0
  }

  const [rows, setRows] = useState<AdvanceRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<AdvanceStatus>('OPEN')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<AdvanceDetail | null>(null)

  const [budgets, setBudgets] = useState<
    Array<{ id: number; label: string; year?: number; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number; isArchived?: number; color?: string | null }>
  >([])
  const [earmarks, setEarmarks] = useState<
    Array<{ id: number; code: string; name: string; color?: string | null; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number; isActive?: number }>
  >([])
  const [invoices, setInvoices] = useState<Array<{ id: number; invoiceNo?: string | null; party: string; status: 'OPEN' | 'PARTIAL' | 'PAID'; remaining: number }>>([])

  const [tagDefs, setTagDefs] = useState<Array<{ id: number; name: string; color?: string | null }>>([])
  const [descSuggest, setDescSuggest] = useState<string[]>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createDraft, setCreateDraft] = useState({
    recipientName: '',
    issuedAt: new Date().toISOString().slice(0, 10),
    amount: '',
    notes: '',
    budgetId: '',
    earmarkId: ''
  })

  const [settleOpen, setSettleOpen] = useState(false)
  const [settleBusy, setSettleBusy] = useState(false)
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
  const [purchaseQa, setPurchaseQa] = useState<QA>(() => {
    const today = new Date().toISOString().slice(0, 10)
    return {
      date: today,
      type: 'OUT',
      sphere: 'IDEELL',
      mode: 'GROSS',
      grossAmount: 0,
      vatRate: 0,
      description: '',
      paymentMethod: 'BAR'
    }
  })
  const [editPurchaseId, setEditPurchaseId] = useState<number | null>(null)

  function startEditPurchase(p: NonNullable<AdvanceDetail['purchases']>[number]) {
    const mode = (p.netAmount && p.netAmount > 0) ? 'NET' : 'GROSS'
    setPurchaseQa({
      date: p.date,
      type: p.type,
      sphere: p.sphere,
      mode,
      grossAmount: p.grossAmount ?? 0,
      netAmount: p.netAmount ?? 0,
      vatRate: p.vatRate ?? 0,
      description: p.description || '',
      paymentMethod: p.paymentMethod ?? 'BAR',
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

  async function loadList() {
    setLoading(true)
    try {
      const res = await (window as any).api?.advances?.list?.({
        q: q.trim() || undefined,
        status,
        limit: pageLimit,
        offset: 0
      })
      const list = (res?.rows || []) as AdvanceRow[]
      setRows(list)
      setTotal(Number(res?.total || 0))
      if (list.length === 0) {
        setSelectedId(null)
        setDetail(null)
      } else if (!selectedId || !list.some((row) => row.id === selectedId)) {
        setSelectedId(list[0].id)
      }
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadDetail(id: number) {
    try {
      const res = await (window as any).api?.advances?.get?.({ id })
      setDetail((res as AdvanceDetail) || null)
    } catch (e: any) {
      notify('error', e?.message || String(e))
      setDetail(null)
    }
  }

  async function loadMeta() {
    const [budgetState, earmarkState, openInvState, partialInvState, tagsState] = await Promise.allSettled([
      (window as any).api?.budgets?.list?.({ includeArchived: false }),
      (window as any).api?.bindings?.list?.({ activeOnly: true }),
      (window as any).api?.invoices?.list?.({ limit: 80, offset: 0, status: 'OPEN', sort: 'ASC', sortBy: 'due' }),
      (window as any).api?.invoices?.list?.({ limit: 80, offset: 0, status: 'PARTIAL', sort: 'ASC', sortBy: 'due' }),
      (window as any).api?.tags?.list?.({ includeUsage: true })
    ])

    const budgetRes = budgetState.status === 'fulfilled' ? budgetState.value : null
    const earmarkRes = earmarkState.status === 'fulfilled' ? earmarkState.value : null
    const openInvRes = openInvState.status === 'fulfilled' ? openInvState.value : null
    const partialInvRes = partialInvState.status === 'fulfilled' ? partialInvState.value : null
    const tagsRes = tagsState.status === 'fulfilled' ? tagsState.value : null

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
    loadList()
  }, [q, status])

  useEffect(() => {
    if (selectedId != null) loadDetail(selectedId)
  }, [selectedId])

  const totals = useMemo(() => {
    const openSum = rows.reduce((sum, row) => sum + Number(row.openAmount || 0), 0)
    const paidSum = rows.reduce((sum, row) => sum + getBookedAmount(row.amount, row.openAmount), 0)
    return {
      openSum,
      paidSum,
      openCount: rows.filter((row) => row.status === 'OPEN').length
    }
  }, [rows])

  const detailBookedAmount = useMemo(() => {
    if (!detail) return 0
    return getBookedAmount(detail.amount, detail.openAmount)
  }, [detail])

  async function submitCreate() {
    const amount = Number(String(createDraft.amount).replace(',', '.'))
    if (!createDraft.recipientName.trim()) return notify('error', 'Empfänger ist erforderlich')
    if (!createDraft.issuedAt) return notify('error', 'Ausgabedatum ist erforderlich')
    if (!isFinite(amount) || amount <= 0) return notify('error', 'Betrag muss positiv sein')

    setCreateBusy(true)
    try {
      await (window as any).api?.advances?.create?.({
        recipientName: createDraft.recipientName.trim(),
        issuedAt: createDraft.issuedAt,
        amount,
        notes: createDraft.notes.trim() || null,
        budgetId: createDraft.budgetId ? Number(createDraft.budgetId) : null,
        earmarkId: createDraft.earmarkId ? Number(createDraft.earmarkId) : null
      })
      setCreateOpen(false)
      setCreateDraft({
        recipientName: '',
        issuedAt: new Date().toISOString().slice(0, 10),
        amount: '',
        notes: '',
        budgetId: '',
        earmarkId: ''
      })
      await loadList()
      notify('success', 'Vorschuss erfasst')
      window.dispatchEvent(new Event('data-changed'))
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
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
      window.dispatchEvent(new Event('data-changed'))
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
      window.dispatchEvent(new Event('data-changed'))
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
      description: qa.description || undefined,
      vatRate: qa.vatRate
    }

    if (qa.type === 'TRANSFER') {
      notify('error', 'Transfers sind im Vorschuss nicht erlaubt')
      return
    }

    payload.paymentMethod = qa.paymentMethod

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
      const enc = async (f: File) => {
        const buf = await f.arrayBuffer()
        let binary = ''
        const bytes = new Uint8Array(buf)
        const chunk = 0x8000
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any)
        }
        const dataBase64 = btoa(binary)
        return { name: f.name, dataBase64, mime: f.type || undefined }
      }
      payload.files = await Promise.all(purchaseFiles.map(enc))
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
        ...prev,
        description: '',
        tags: [],
        ...(prev.mode === 'GROSS' ? { grossAmount: 0 } : { netAmount: 0 })
      }))
      await Promise.all([loadList(), loadDetail(advanceId)])
      notify('success', editPurchaseId ? 'Buchung aktualisiert' : 'Buchung hinzugefügt')
      window.dispatchEvent(new Event('data-changed'))
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
      window.dispatchEvent(new Event('data-changed'))
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
      window.dispatchEvent(new Event('data-changed'))
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
          <p className="helper">Erfasst Auszahlungen an Mitglieder/Personen und löst sie bei Rechnungs- oder Belegbearbeitung wieder auf.</p>
        </div>
        <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}>+ Vorschuss</button>
      </header>

      <div className="advances-summary-grid">
        <div className="card advances-summary-card">
          <div className="helper">Offener Betrag</div>
          <div className="advances-summary-value">{eurFmt.format(totals.openSum)}</div>
        </div>
        <div className="card advances-summary-card">
          <div className="helper">Bereits verbucht</div>
          <div className="advances-summary-value">{eurFmt.format(totals.paidSum)}</div>
        </div>
        <div className="card advances-summary-card">
          <div className="helper">Offene Vorschüsse</div>
          <div className="advances-summary-value">{totals.openCount}</div>
        </div>
      </div>

      <div className="advances-layout">
        <section className="card advances-list-card">
          <div className="advances-toolbar">
            <input
              className="input"
              placeholder="Suchen (Person, Notiz)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Vorschüsse durchsuchen"
            />
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as AdvanceStatus)} aria-label="Status filtern">
              <option value="OPEN">Offen</option>
              <option value="RESOLVED">Erledigt</option>
              <option value="ALL">Alle</option>
            </select>
          </div>

          {loading ? (
            <div className="helper">Lade Vorschüsse…</div>
          ) : rows.length === 0 ? (
            <div className="helper">Keine Vorschüsse gefunden.</div>
          ) : (
            <div className="advances-list-table-wrap">
              <table className="table advances-list-table">
                <thead>
                  <tr>
                    <th>Empfänger</th>
                    <th>Ausgegeben</th>
                    <th>Offen</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={row.id === selectedId ? 'advances-row-active' : ''} onClick={() => setSelectedId(row.id)}>
                      <td>
                        <div>{row.memberName || row.recipientName}</div>
                        <div className="helper">{fmtDate(row.issuedAt)}</div>
                      </td>
                      <td>{eurFmt.format(row.amount)}</td>
                      <td>{eurFmt.format(row.openAmount)}</td>
                      <td>
                        <span className={`advances-status ${row.status === 'OPEN' ? 'open' : 'resolved'}`}>
                          {row.status === 'OPEN' ? 'Offen' : 'Erledigt'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="helper">{total} Eintrag{total === 1 ? '' : 'e'}</div>
        </section>

        <section className="card advances-detail-card">
          {!detail ? (
            <div className="helper">Wähle links einen Vorschuss aus.</div>
          ) : (
            <>
              <div className="advances-detail-header">
                <div>
                  <h2 style={{ margin: 0 }}>{detail.memberName || detail.recipientName}</h2>
                  <div className="helper">Ausgegeben am {fmtDate(detail.issuedAt)}</div>
                </div>
                <div className="advances-detail-actions">
                  <button className="btn" type="button" onClick={() => { setEditPurchaseId(null); setPurchaseModalOpen(true) }} disabled={detail.status !== 'OPEN'}>+ Buchung</button>
                  <button className="btn primary" type="button" onClick={resolveSelectedAdvance} disabled={detail.status !== 'OPEN'}>Auflösen</button>
                </div>
              </div>

              <div className="advances-detail-kpis">
                <div>
                  <div className="helper">Ausgegeben</div>
                  <div>{eurFmt.format(detail.amount)}</div>
                </div>
                <div className={detailBookedAmount > detail.amount ? 'advances-kpi-overdrawn' : ''}>
                  <div className="helper">Verbucht</div>
                  <div>{eurFmt.format(detailBookedAmount)}</div>
                </div>
                <div className={detail.openAmount < 0 ? 'advances-kpi-negative' : ''}>
                  <div className="helper">Offen</div>
                  <div>{eurFmt.format(detail.openAmount)}</div>
                </div>
              </div>

              {detail.notes ? <div className="helper">Notiz: {detail.notes}</div> : null}

              <h3 className="advances-subtitle">Buchungen</h3>
              {(!detail.purchases || detail.purchases.length === 0) ? (
                <div className="helper">Noch keine Buchungen vorhanden.</div>
              ) : (
                <div className="advances-list-table-wrap">
                  <table className="table advances-list-table">
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Beschreibung</th>
                        <th>Zahlweg</th>
                        <th>Betrag</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {detail.purchases.map((p) => (
                        <tr key={p.id}>
                          <td>{fmtDate(p.date)}</td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{p.description || '—'}</div>
                            <div className="helper">{p.type} · {p.sphere}</div>
                          </td>
                          <td>{p.paymentMethod || '—'}</td>
                          <td>{eurFmt.format(p.grossAmount)}</td>
                          <td>{p.voucherId ? 'Gebucht' : 'Entwurf'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                              {!p.voucherId && detail.status === 'OPEN' ? (
                                <>
                                  <button className="btn btn-edit" type="button" aria-label="Buchung bearbeiten" title="Bearbeiten" onClick={() => startEditPurchase(p)}>✎</button>
                                  <button className="btn ghost danger" type="button" aria-label="Buchung entfernen" onClick={() => deletePurchaseRow(p.id)}>×</button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)} role="dialog" aria-modal="true">
          <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="advances-modal-header">
              <h2 style={{ margin: 0 }}>Vorschuss erfassen</h2>
              <button className="btn ghost" type="button" aria-label="Schließen" onClick={() => setCreateOpen(false)}>×</button>
            </div>
            <div className="row">
              <div className="field">
                <label>Empfänger *</label>
                <input className="input" value={createDraft.recipientName} onChange={(e) => setCreateDraft((prev) => ({ ...prev, recipientName: e.target.value }))} placeholder="z. B. Max Mustermann" />
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label>Ausgabedatum *</label>
                <input type="date" className="input" value={createDraft.issuedAt} onChange={(e) => setCreateDraft((prev) => ({ ...prev, issuedAt: e.target.value }))} />
              </div>
              <div className="field">
                <label>Betrag (€) *</label>
                <input className="input" value={createDraft.amount} onChange={(e) => setCreateDraft((prev) => ({ ...prev, amount: e.target.value }))} placeholder="0,00" />
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label>Budget (optional)</label>
                <select className="input" value={createDraft.budgetId} onChange={(e) => setCreateDraft((prev) => ({ ...prev, budgetId: e.target.value }))}>
                  <option value="">Nicht gesetzt</option>
                  {budgets.map((budget) => (
                    <option key={budget.id} value={budget.id}>{budget.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Zweckbindung (optional)</label>
                <select className="input" value={createDraft.earmarkId} onChange={(e) => setCreateDraft((prev) => ({ ...prev, earmarkId: e.target.value }))}>
                  <option value="">Nicht gesetzt</option>
                  {earmarks.map((earmark) => (
                    <option key={earmark.id} value={earmark.id}>{earmark.code} – {earmark.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Notiz (optional)</label>
              <textarea className="input" rows={3} value={createDraft.notes} onChange={(e) => setCreateDraft((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>
            <div className="advances-modal-actions">
              <button className="btn" type="button" onClick={() => setCreateOpen(false)}>Abbrechen</button>
              <button className="btn primary" type="button" disabled={createBusy} onClick={submitCreate}>Speichern</button>
            </div>
          </div>
        </div>
      )}

      {settleOpen && detail && (
        <div className="modal-overlay" onClick={() => setSettleOpen(false)} role="dialog" aria-modal="true">
          <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="advances-modal-header">
              <h2 style={{ margin: 0 }}>Vorschuss auflösen</h2>
              <button className="btn ghost" type="button" aria-label="Schließen" onClick={() => setSettleOpen(false)}>×</button>
            </div>
            <div className="helper">Offener Betrag: {eurFmt.format(detail.openAmount)}</div>
            <div className="row">
              <div className="field">
                <label>Auflösungsdatum *</label>
                <input type="date" className="input" value={settleDraft.settledAt} onChange={(e) => setSettleDraft((prev) => ({ ...prev, settledAt: e.target.value }))} />
              </div>
              <div className="field">
                <label>Betrag (€) *</label>
                <input className="input" value={settleDraft.amount} onChange={(e) => setSettleDraft((prev) => ({ ...prev, amount: e.target.value }))} placeholder="0,00" />
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label>Rechnung (optional)</label>
                <select className="input" value={settleDraft.invoiceId} onChange={(e) => setSettleDraft((prev) => ({ ...prev, invoiceId: e.target.value }))}>
                  <option value="">Keine Zuordnung</option>
                  {invoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNo ? `${invoice.invoiceNo} – ` : ''}{invoice.party} ({eurFmt.format(invoice.remaining)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Beleg-ID (optional)</label>
                <input className="input" value={settleDraft.voucherId} onChange={(e) => setSettleDraft((prev) => ({ ...prev, voucherId: e.target.value }))} placeholder="z. B. 123" />
              </div>
            </div>
            <div className="field">
              <label>Notiz (optional)</label>
              <textarea className="input" rows={3} value={settleDraft.note} onChange={(e) => setSettleDraft((prev) => ({ ...prev, note: e.target.value }))} />
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
              <button className="btn ghost" type="button" aria-label="Schließen" disabled={resolveBusy} onClick={() => setResolveConfirmOpen(false)}>×</button>
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
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => onDropFiles(e.target.files)} />
          <QuickAddModal
            qa={purchaseQa}
            setQa={setPurchaseQa}
            onSave={submitPurchase}
            onClose={() => { setPurchaseModalOpen(false); setPurchaseFiles([]); setEditPurchaseId(null) }}
            files={purchaseFiles}
            setFiles={setPurchaseFiles}
            openFilePicker={openFilePicker}
            onDropFiles={onDropFiles}
            fileInputRef={fileInputRef}
            fmtDate={fmtDate}
            eurFmt={eurFmt}
            budgetsForEdit={budgets}
            earmarks={earmarks as any}
            tagDefs={tagDefs as any}
            descSuggest={descSuggest}
            title={editPurchaseId ? 'Buchung bearbeiten' : '+ Buchung'}
          />
        </>
      )}
    </div>
  )
}
