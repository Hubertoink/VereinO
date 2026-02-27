import React, { useEffect, useMemo, useState } from 'react'

type BudgetRow = {
  id: number
  year: number
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  name?: string | null
  categoryName?: string | null
  projectName?: string | null
  isArchived?: number
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

function labelForBudget(b: BudgetRow): string {
  const n = (b.name || '').trim()
  if (n) return `${b.year} – ${n}`
  const c = (b.categoryName || '').trim()
  if (c) return `${b.year} – ${c}`
  const p = (b.projectName || '').trim()
  if (p) return `${b.year} – ${p}`
  return String(b.year)
}

export default function CashCheckModal(props: {
  open: boolean
  year: number
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
  onClose: () => void
  onCreated?: () => void
}) {
  const { open, year, notify, onClose, onCreated } = props
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const maxDate = yearEnd > todayIso ? todayIso : yearEnd

  const [date, setDate] = useState<string>(maxDate)
  const [soll, setSoll] = useState<number>(0)
  const [ist, setIst] = useState<string>('')
  const [note, setNote] = useState<string>('')
  const [budgetId, setBudgetId] = useState<number | ''>('')
  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Reset defaults when opened or year changes
  useEffect(() => {
    if (!open) return
    const nextMax = `${year}-12-31` > todayIso ? todayIso : `${year}-12-31`
    setDate(nextMax)
    setSoll(0)
    setIst('')
    setNote('')
    setBudgetId('')
    setErr('')
  }, [open, year, todayIso])

  // Load budgets (year-scoped) on open
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await (window as any).api?.budgets?.list?.({ year, includeArchived: true })
        if (cancelled) return
        setBudgets((res?.rows || []) as BudgetRow[])
      } catch {
        if (!cancelled) setBudgets([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, year])

  // Load BAR Soll for date
  useEffect(() => {
    if (!open) return
    if (!date) {
      setSoll(0)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await (window as any).api?.reports?.cashBalance?.({
          to: date,
          ...(typeof budgetId === 'number' ? { budgetId } : {}),
        })
        if (cancelled) return
        const bar = Number(res?.BAR || 0)
        setSoll(round2(bar))
      } catch (e: any) {
        if (cancelled) return
        setSoll(0)
        setErr(e?.message || String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, date, budgetId])

  const istNum = useMemo(() => {
    const v = ist === '' ? NaN : Number(ist)
    return Number.isFinite(v) ? round2(v) : NaN
  }, [ist])

  const diff = useMemo(() => {
    if (!Number.isFinite(istNum)) return NaN
    return round2(istNum - soll)
  }, [istNum, soll])

  const diffLabel = useMemo(() => {
    if (!Number.isFinite(diff)) return '—'
    return diff === 0 ? '0,00 €' : eur.format(diff)
  }, [diff, eur])

  async function createAdjustmentVoucher() {
    if (!date) return
    if (!Number.isFinite(istNum)) {
      setErr('Bitte Ist-Bestand als Zahl eingeben.')
      return
    }
    if (!Number.isFinite(diff) || diff === 0) {
      setErr('Keine Differenz – keine Buchung nötig.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const abs = round2(Math.abs(diff))
      const type = diff > 0 ? 'IN' : 'OUT'
      const base = `Kassenprüfung ${date}: Soll ${eur.format(soll)} / Ist ${eur.format(istNum)} / Diff ${eur.format(diff)}`
      const description = (note || '').trim() ? `${base} – ${(note || '').trim()}` : base

      const payload: any = {
        date,
        type,
        sphere: 'IDEELL',
        description,
        grossAmount: abs,
        vatRate: 0,
        paymentMethod: 'BAR',
      }
      if (typeof budgetId === 'number') {
        payload.budgets = [{ budgetId, amount: abs }]
        payload.budgetId = budgetId
        payload.budgetAmount = abs
      }

      const res = await (window as any).api?.vouchers?.create?.(payload)

      // Persist as cash check record for history + PDF report
      try {
        await (window as any).api?.cashChecks?.create?.({
          year,
          date,
          soll: round2(soll),
          ist: round2(istNum),
          diff: round2(diff),
          voucherId: res?.id ?? null,
          budgetId: typeof budgetId === 'number' ? budgetId : null,
          note: (note || '').trim() ? (note || '').trim() : null,
        })
      } catch {
        // Do not block booking if cash check record fails
      }

      const voucherNo = res?.voucherNo ? String(res.voucherNo) : ''
      notify('success', voucherNo ? `Kassenprüfung gebucht (${voucherNo}).` : 'Kassenprüfung gebucht.')
      try {
        window.dispatchEvent(new Event('data-changed'))
      } catch {
        // ignore
      }
      onCreated?.()
      onClose()
    } catch (e: any) {
      const msg = e?.message || String(e)
      setErr(msg)
      notify('error', msg)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Neue Kassenprüfung</h3>
          <button
            className="btn ghost"
            onClick={onClose}
            aria-label="Schließen"
            style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 8 }}
          >
            ✕
          </button>
        </div>

        <div className="helper">
          Soll wird aus BAR-Buchungen über den gesamten Zeitraum bis Stichtag
          {typeof budgetId === 'number' ? ' (nur für das gewählte Budget)' : ''} berechnet.
        </div>

        <div className="row" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>Stichtag</label>
            <input
              className="input"
              type="date"
              min={yearStart}
              max={maxDate}
              value={date}
              onChange={(e) => {
                setErr('')
                setDate(e.target.value)
              }}
            />
          </div>
          <div className="field">
            <label>Budget (optional)</label>
            <select
              className="input"
              value={budgetId as any}
              onChange={(e) => setBudgetId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">—</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {labelForBudget(b)}
                  {b.isArchived ? ' (archiviert)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>Soll (BAR)</label>
            <div className="input" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{eur.format(soll)}</span>
              <span className="helper">berechnet</span>
            </div>
          </div>
          <div className="field">
            <label>Ist (gezählt)</label>
            <span className="adorn-wrap">
              <input
                className="input"
                type="number"
                step="0.01"
                value={ist}
                onChange={(e) => {
                  setErr('')
                  setIst(e.target.value)
                }}
                placeholder="0,00"
              />
              <span className="adorn-suffix">€</span>
            </span>
          </div>
          <div className="field">
            <label>Differenz (Ist − Soll)</label>
            <div className="input" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{diffLabel}</span>
              {Number.isFinite(diff) && diff !== 0 ? (
                <span className="helper">{diff > 0 ? 'Überschuss' : 'Fehlbetrag'}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="field">
          <label>Notiz (optional)</label>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Zählfehler korrigiert, Wechselgeld…"
          />
        </div>

        {err ? <div style={{ color: 'var(--danger)' }}>{err}</div> : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button
            className="btn primary"
            onClick={createAdjustmentVoucher}
            disabled={busy || !date || !Number.isFinite(istNum) || !Number.isFinite(diff) || diff === 0}
            title={diff === 0 ? 'Keine Differenz – keine Buchung nötig' : 'Ausgleichsbuchung erstellen'}
          >
            Ausgleichen buchen
          </button>
        </div>
      </div>
    </div>
  )
}
