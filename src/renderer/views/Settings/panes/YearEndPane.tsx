import React from 'react'
import { YearEndPaneProps } from '../types'
import { dispatchDataChanged } from '../../../utils/refresh'

/**
 * YearEndPane - Year-End Closing: Preview, Export, Close/Reopen
 */
export function YearEndPane({ notify }: YearEndPaneProps) {
  const [year, setYear] = React.useState<number>(new Date().getFullYear())
  const [yearsAvail, setYearsAvail] = React.useState<number[]>([])
  const [preview, setPreview] = React.useState<any | null>(null)
  const [overall, setOverall] = React.useState<any | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState('')
  const [status, setStatus] = React.useState<{ closedUntil: string | null } | null>(null)
  const [confirmAction, setConfirmAction] = React.useState<null | { type: 'close' | 'reopen' }>(null)
  const eur = React.useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

  React.useEffect(() => {
    let cancelled = false
    window.api?.reports?.years?.().then(res => { if (!cancelled && res?.years) setYearsAvail(res.years) })
    window.api?.yearEnd?.status?.().then(s => { if (!cancelled) setStatus(s as any) })
    return () => { cancelled = true }
  }, [])

  async function refresh() {
    setErr('')
    try { 
      setBusy(true)
      const res = await window.api?.yearEnd?.preview?.({ year })
      setPreview(res || null)
      // Load overall totals (all time)
      const overallRes = await window.api?.reports?.summary?.({ from: '', to: '' })
      setOverall(overallRes || null)
    }
    catch (e: any) { setErr(e?.message || String(e)) }
    finally { setBusy(false) }
  }
  React.useEffect(() => { refresh() }, [year])

  const closedUntil = status?.closedUntil || null
  const isLocked = !!closedUntil
  const lockedYear = isLocked ? Number(String(closedUntil).slice(0, 4)) : null
  const closeDisabled = lockedYear !== null && year <= lockedYear

  async function doExport() {
    setBusy(true); setErr('')
    try {
      const res = await window.api?.yearEnd?.export?.({ year })
      if (res?.filePath) notify('success', `Export erstellt: ${res.filePath}`)
    } catch (e: any) { setErr(e?.message || String(e)); notify('error', e?.message || String(e)) }
    finally { setBusy(false) }
  }

  async function executeClose() {
    setBusy(true); setErr('')
    try { const res = await window.api?.yearEnd?.close?.({ year }); if (res?.ok) { notify('success', `Abgeschlossen bis ${res.closedUntil}`); const s = await window.api?.yearEnd?.status?.(); setStatus(s as any); await refresh(); dispatchDataChanged(['settings', 'vouchers']) } }
    catch (e: any) { setErr(e?.message || String(e)); notify('error', e?.message || String(e)) }
    finally { setBusy(false); setConfirmAction(null) }
  }
  async function executeReopen() {
    setBusy(true); setErr('')
    try { const res = await window.api?.yearEnd?.reopen?.({ year }); if (res?.ok) { notify('success', 'Periode geöffnet'); const s = await window.api?.yearEnd?.status?.(); setStatus(s as any); await refresh(); dispatchDataChanged(['settings', 'vouchers']) } }
    catch (e: any) { setErr(e?.message || String(e)); notify('error', e?.message || String(e)) }
    finally { setBusy(false); setConfirmAction(null) }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <strong>Jahresabschluss</strong>
        <div className="helper">Vorschau, Export und Abschluss des Geschäftsjahres.</div>
      </div>

      <section className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 10, background: isLocked ? 'color-mix(in oklab, var(--danger) 12%, transparent)' : 'color-mix(in oklab, var(--accent) 12%, transparent)' }}>
            <span aria-hidden>🛡️</span>
            <div>
              <div className="helper">Sperrstatus</div>
              <div>
                {isLocked ? (<span>Abgeschlossen bis <strong>{closedUntil}</strong>. Buchungen bis zu diesem Datum sind gesperrt.</span>) : (<span>Derzeit ist kein Jahr abgeschlossen.</span>)}
              </div>
            </div>
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label>Jahr</label>
            <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} title="Jahr auswählen">
              {[...new Set([new Date().getFullYear(), ...yearsAvail])].sort((a, b) => b - a).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
        <div className="helper">Interaktive Schritte</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy} onClick={doExport}>📤 Export-Paket</button>
          {!closeDisabled && (
            <button className="btn danger" disabled={busy} onClick={() => setConfirmAction({ type: 'close' })}>✅ Jahr abschließen…</button>
          )}
          {closeDisabled && (
            <button className="btn" disabled={busy} onClick={() => setConfirmAction({ type: 'reopen' })}>Wieder öffnen…</button>
          )}
        </div>
      </section>

      {preview && (
        <section className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
          <div className="helper">Zeitraum: {preview.from} – {preview.to}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="card" style={{ padding: 12 }}>
              <div className="helper">Einnahmen</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span aria-hidden style={{ fontSize: 20 }}>📈</span>
                <div style={{ fontWeight: 600, color: 'var(--success)' }}>
                  {eur.format(preview.totals.inGross || 0)}
                </div>
              </div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div className="helper">Ausgaben</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span aria-hidden style={{ fontSize: 20 }}>📉</span>
                <div style={{ fontWeight: 600, color: 'var(--danger)' }}>
                  {eur.format(Math.abs(preview.totals.outGross || 0))}
                </div>
              </div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div className="helper">Saldo</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span aria-hidden style={{ fontSize: 20 }}>💰</span>
                <div style={{ fontWeight: 600, color: (preview.totals.inGross - Math.abs(preview.totals.outGross)) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {eur.format(preview.totals.inGross - Math.abs(preview.totals.outGross))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {overall && (
        <section className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
          <div className="helper">Gesamtzeitraum (alle Buchungen)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="card" style={{ padding: 12 }}>
              <div className="helper">Einnahmen</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span aria-hidden style={{ fontSize: 20 }}>📈</span>
                <div style={{ fontWeight: 600, color: 'var(--success)' }}>
                  {eur.format((overall.byType.find((t: any) => t.key === 'IN')?.gross || 0))}
                </div>
              </div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div className="helper">Ausgaben</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span aria-hidden style={{ fontSize: 20 }}>📉</span>
                <div style={{ fontWeight: 600, color: 'var(--danger)' }}>
                  {eur.format(Math.abs(overall.byType.find((t: any) => t.key === 'OUT')?.gross || 0))}
                </div>
              </div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div className="helper">Saldo</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span aria-hidden style={{ fontSize: 20 }}>💰</span>
                <div style={{ fontWeight: 600, color: ((overall.byType.find((t: any) => t.key === 'IN')?.gross || 0) - Math.abs(overall.byType.find((t: any) => t.key === 'OUT')?.gross || 0)) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {eur.format((overall.byType.find((t: any) => t.key === 'IN')?.gross || 0) - Math.abs(overall.byType.find((t: any) => t.key === 'OUT')?.gross || 0))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {confirmAction && (
        <div className="modal-overlay" onClick={() => setConfirmAction(null)} role="dialog" aria-modal="true">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{confirmAction.type === 'close' ? 'Jahr abschließen' : 'Periode wieder öffnen'}</h3>
              <button className="btn ghost" onClick={() => setConfirmAction(null)} aria-label="Schließen" style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 8 }}>✕</button>
            </div>
            {confirmAction.type === 'close' ? (
              <div>Jahr <strong>{year}</strong> abschließen? Buchungen bis <strong>{year}-12-31</strong> sind danach gesperrt.</div>
            ) : (
              <div>Jahr <strong>{year}</strong> wieder öffnen?</div>
            )}
            <div className="helper">Dieser Vorgang kann später über „Wieder öffnen…“ rückgängig gemacht werden.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setConfirmAction(null)}>Abbrechen</button>
              {confirmAction.type === 'close' ? (
                <button className="btn danger" onClick={executeClose} disabled={busy}>Ja, abschließen</button>
              ) : (
                <button className="btn primary" onClick={executeReopen} disabled={busy}>Ja, öffnen</button>
              )}
            </div>
          </div>
        </div>
      )}
      {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
    </div>
  )
}
