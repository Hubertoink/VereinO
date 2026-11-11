import React, { useEffect, useRef, useState } from 'react'
import type { ContributionAllocation, ContributionPaymentInput, ContributionPreview } from '../../../../shared/membershipPayments'
import './membershipPayments.css'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
export default function ContributionAllocationEditor({ source, onReady, disabled = false }: {
  source: ContributionPaymentInput; onReady: (preview: ContributionPreview | null, input: ContributionPaymentInput) => void; disabled?: boolean
}) {
  const [start, setStart] = useState(source.startPeriod || '')
  const [manual, setManual] = useState<ContributionAllocation[] | undefined>()
  const [preview, setPreview] = useState<ContributionPreview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const callback = useRef(onReady)
  callback.current = onReady
  const sourceKey = JSON.stringify(source)
  const manualKey = JSON.stringify(manual)
  useEffect(() => {
    let live = true
    const input = { ...JSON.parse(sourceKey), startPeriod: start || undefined, allocations: manualKey ? JSON.parse(manualKey) : undefined }
    setLoading(true); setError(''); callback.current(null, input)
    const timer = setTimeout(() => {
      window.api.payments.previewAllocation(input).then(result => {
        if (live) { setPreview(result); callback.current(result, input) }
      }).catch(reason => { if (live) setError(reason.message || String(reason)) })
        .finally(() => { if (live) setLoading(false) })
    }, 150)
    return () => { live = false; clearTimeout(timer) }
  }, [sourceKey, start, manualKey])
  return <section className="contribution-allocation" aria-label="Beitragsaufteilung">
    <strong>Automatische Verrechnung</strong>
    <p className="helper">VereinO gleicht zuerst offene Restbeträge aus und verwendet den übrigen Betrag für zukünftige Beiträge.</p>
    <details onToggle={event => setEditing(event.currentTarget.open)}><summary>Aufteilung anpassen (optional)</summary>
    <div className="contribution-controls"><label>Startperiode<input className="input" aria-label="Startperiode" placeholder="Älteste offene Periode" value={start} disabled={disabled} onChange={e => { setStart(e.target.value); setManual(undefined) }} /></label>
      <button type="button" className="btn" disabled={disabled} onClick={() => { setStart(''); setManual(undefined) }}>Automatisch verteilen</button></div>
    <p className="helper">Monat: 2027-01 · Quartal: 2027-Q1 · Jahr: 2027. Ohne Startperiode werden zuerst die ältesten offenen Beiträge bezahlt.</p>
    </details>
    {error && <p role="alert" className="contribution-error">{error}</p>}
    {loading && <p role="status" className="helper">Aufteilung wird berechnet …</p>}
    {preview && <><p className="helper">{preview.allocations.length} Beitragsperioden{preview.allocations.length > 0 ? ` · ${preview.allocations[0].periodKey} bis ${preview.allocations.at(-1)!.periodKey}` : ''}</p><div className="contribution-table-wrap"><table className="contribution-table"><thead><tr><th>Periode</th><th>Soll</th><th>Bereits bezahlt</th><th>Diese Zahlung</th><th>Rest</th></tr></thead>
      <tbody>{preview.allocations.map((row, index) => <tr key={`${row.interval}:${row.periodKey}`}><td>{row.periodKey}</td><td>{euro.format(row.expected)}</td><td>{euro.format(row.paidBefore)}</td>
        <td>{!editing ? euro.format(row.amount) : <input className="input contribution-amount" type="number" min="0.01" step="0.01" aria-label={`Zuordnung ${row.periodKey}`} value={manual?.[index]?.amount ?? row.amount} disabled={disabled || loading} onChange={e => {
          const next = preview.allocations.map(p => ({ periodKey: p.periodKey, interval: p.interval, amount: p.amount }))
          next[index].amount = Number(e.target.value)
          setManual(next)
        }} />}</td><td>{euro.format(row.remaining)}</td></tr>)}</tbody></table></div>
      <p className="helper">{preview.memberName} · Zahlung {euro.format(preview.amount)} · Nicht verteilt / Guthaben: <strong>{euro.format(preview.credit)}</strong></p>
    </>}
  </section>
}
