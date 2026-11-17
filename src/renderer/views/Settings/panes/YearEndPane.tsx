import ModalHeader from '../../../components/ModalHeader'
import React from 'react'
import { YearEndPaneProps } from '../types'
import { dispatchDataChanged } from '../../../utils/refresh'
import { IconCash, IconCircleCheck, IconDownload, IconLock, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react'
import { SettingsPageHeader } from '../components'

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
    <div className="settings-page settings-workflow-page">
      <SettingsPageHeader
        title="Jahresabschluss"
        description="Prüfe Einnahmen und Ausgaben, exportiere den Abschluss und sperre das Geschäftsjahr."
      />

      <section className="settings-workflow-section">
        <div className="settings-workflow-status-row">
          <div className={`settings-workflow-status ${isLocked ? 'is-locked' : ''}`}>
            <IconLock size={20} aria-hidden="true" />
            <div>
              <div className="helper">Sperrstatus</div>
              <div>
                {isLocked ? (<span>Abgeschlossen bis <strong>{closedUntil}</strong>. Buchungen bis zu diesem Datum sind gesperrt.</span>) : (<span>Derzeit ist kein Jahr abgeschlossen.</span>)}
              </div>
            </div>
          </div>
          <div className="field settings-workflow-year">
            <label>Jahr</label>
            <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} title="Jahr auswählen">
              {[...new Set([new Date().getFullYear(), ...yearsAvail])].sort((a, b) => b - a).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="settings-workflow-section">
        <div className="settings-workflow-section__heading">
          <h3>Abschlussschritte</h3>
          <p>Exportiere die Unterlagen oder schließe das ausgewählte Jahr ab.</p>
        </div>
        <div className="settings-workflow-actions">
          <button className="btn" disabled={busy} onClick={doExport}><IconDownload size={16} aria-hidden="true" /> Export-Paket</button>
          {!closeDisabled && (
            <button className="btn danger" disabled={busy} onClick={() => setConfirmAction({ type: 'close' })}><IconCircleCheck size={16} aria-hidden="true" /> Jahr abschließen…</button>
          )}
          {closeDisabled && (
            <button className="btn" disabled={busy} onClick={() => setConfirmAction({ type: 'reopen' })}>Wieder öffnen…</button>
          )}
        </div>
      </section>

      {preview && (
        <section className="settings-workflow-section">
          <div className="settings-workflow-section__heading">
            <h3>Jahresübersicht</h3>
            <p>Zeitraum: {preview.from} – {preview.to}</p>
          </div>
          <div className="settings-workflow-metrics">
            <div className="settings-workflow-metric">
              <div className="helper">Einnahmen</div>
              <div className="settings-workflow-metric__value">
                <IconTrendingUp size={20} aria-hidden="true" />
                <div className="settings-workflow-metric__amount is-positive">
                  {eur.format(preview.totals.inGross || 0)}
                </div>
              </div>
            </div>
            <div className="settings-workflow-metric">
              <div className="helper">Ausgaben</div>
              <div className="settings-workflow-metric__value">
                <IconTrendingDown size={20} aria-hidden="true" />
                <div className="settings-workflow-metric__amount is-negative">
                  {eur.format(Math.abs(preview.totals.outGross || 0))}
                </div>
              </div>
            </div>
            <div className="settings-workflow-metric">
              <div className="helper">Saldo</div>
              <div className="settings-workflow-metric__value">
                <IconCash size={20} aria-hidden="true" />
                <div className={`settings-workflow-metric__amount ${(preview.totals.inGross - Math.abs(preview.totals.outGross)) >= 0 ? 'is-positive' : 'is-negative'}`}>
                  {eur.format(preview.totals.inGross - Math.abs(preview.totals.outGross))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {overall && (
        <section className="settings-workflow-section">
          <div className="settings-workflow-section__heading">
            <h3>Gesamtzeitraum</h3>
            <p>Überblick über alle Buchungen, unabhängig vom ausgewählten Jahr.</p>
          </div>
          <div className="settings-workflow-metrics">
            <div className="settings-workflow-metric">
              <div className="helper">Einnahmen</div>
              <div className="settings-workflow-metric__value">
                <IconTrendingUp size={20} aria-hidden="true" />
                <div className="settings-workflow-metric__amount is-positive">
                  {eur.format((overall.byType.find((t: any) => t.key === 'IN')?.gross || 0))}
                </div>
              </div>
            </div>
            <div className="settings-workflow-metric">
              <div className="helper">Ausgaben</div>
              <div className="settings-workflow-metric__value">
                <IconTrendingDown size={20} aria-hidden="true" />
                <div className="settings-workflow-metric__amount is-negative">
                  {eur.format(Math.abs(overall.byType.find((t: any) => t.key === 'OUT')?.gross || 0))}
                </div>
              </div>
            </div>
            <div className="settings-workflow-metric">
              <div className="helper">Saldo</div>
              <div className="settings-workflow-metric__value">
                <IconCash size={20} aria-hidden="true" />
                <div className={`settings-workflow-metric__amount ${((overall.byType.find((t: any) => t.key === 'IN')?.gross || 0) - Math.abs(overall.byType.find((t: any) => t.key === 'OUT')?.gross || 0)) >= 0 ? 'is-positive' : 'is-negative'}`}>
                  {eur.format((overall.byType.find((t: any) => t.key === 'IN')?.gross || 0) - Math.abs(overall.byType.find((t: any) => t.key === 'OUT')?.gross || 0))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {confirmAction && (
        <div className="modal-overlay" onClick={() => setConfirmAction(null)} role="dialog" aria-modal="true">
          <div className="modal modal-inset-header" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, display: 'grid', gap: 12 }}>
            <ModalHeader
              title={<>{confirmAction.type === 'close' ? 'Jahr abschließen' : 'Periode wieder öffnen'}</>}
              onClose={() => setConfirmAction(null)}
              closeLabel="Schließen"
              closeOnEscape={false}
            />
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
      {err && <div className="settings-page-error" role="alert">{err}</div>}
    </div>
  )
}
