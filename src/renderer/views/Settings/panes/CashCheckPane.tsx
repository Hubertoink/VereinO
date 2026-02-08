import React, { useEffect, useMemo, useState } from 'react'
import CashCheckModal from '@renderer/renderer/components/modals/CashCheckModal'
import CashCheckAuditorsModal from '@renderer/renderer/components/modals/CashCheckAuditorsModal'
import type { CashCheckPaneProps } from '../types'

type CashCheckRow = {
  id: number
  year: number
  date: string
  soll: number
  ist: number
  diff: number
  voucherId?: number | null
  voucherNo?: string | null
  budgetId?: number | null
  budgetLabel?: string | null
  note?: string | null
  inspector1Name?: string | null
  inspector2Name?: string | null
}

export function CashCheckPane({ notify, bumpDataVersion }: CashCheckPaneProps) {
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [yearsAvail, setYearsAvail] = useState<number[]>([])
  const [showModal, setShowModal] = useState(false)

  const [cashChecks, setCashChecks] = useState<CashCheckRow[]>([])
  const [cashChecksBusy, setCashChecksBusy] = useState(false)
  const [auditorsPrompt, setAuditorsPrompt] = useState<null | { cashCheckId: number; initial1?: string | null; initial2?: string | null }>(null)

  useEffect(() => {
    let cancelled = false
    window.api?.reports
      ?.years?.()
      .then((res) => {
        if (!cancelled && res?.years) setYearsAvail(res.years)
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function refreshCashChecks() {
    try {
      setCashChecksBusy(true)
      const res = await window.api?.cashChecks?.list({ year })
      setCashChecks((res?.rows || []) as CashCheckRow[])
    } catch {
      setCashChecks([])
    } finally {
      setCashChecksBusy(false)
    }
  }

  useEffect(() => {
    refreshCashChecks()
  }, [year])

  async function exportCashCheckPdf(cashCheckId: number) {
    try {
      const res = await window.api?.cashChecks?.exportPdf({ id: cashCheckId })
      if (res?.filePath) {
        notify('success', `PDF erstellt: ${res.filePath}`)
        try {
          await window.api?.shell?.openPath(res.filePath)
        } catch {
          // ignore
        }
      }
    } catch (e: any) {
      const msg = e?.message || String(e)
      if (msg.includes('KASSENPRUEFER_REQUIRED')) {
        await openAuditorsPrompt(cashCheckId)
        return
      }
      notify('error', msg)
    }
  }

  async function openAuditorsPrompt(cashCheckId: number) {
    const existing = cashChecks.find((cc) => Number(cc.id) === Number(cashCheckId))
    try {
      const defs = await window.api?.cashChecks?.getInspectorDefaults?.()
      setAuditorsPrompt({
        cashCheckId,
        initial1: existing?.inspector1Name ?? defs?.inspector1Name ?? null,
        initial2: existing?.inspector2Name ?? defs?.inspector2Name ?? null,
      })
    } catch {
      setAuditorsPrompt({
        cashCheckId,
        initial1: existing?.inspector1Name ?? null,
        initial2: existing?.inspector2Name ?? null,
      })
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <strong>Kassenprüfung</strong>
          <div className="helper">Erstelle neue Kassenprüfungen und verwalte bereits durchgeführte.</div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="field" style={{ minWidth: 120 }}>
            <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} title="Jahr auswählen">
              {[...new Set([new Date().getFullYear(), ...yearsAvail])]
                .sort((a, b) => b - a)
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </select>
          </div>
          <button className="btn primary" onClick={() => setShowModal(true)}>
            + Neue Kassenprüfung
          </button>
        </div>
      </div>

      <CashCheckModal
        open={showModal}
        year={year}
        notify={notify}
        onClose={() => setShowModal(false)}
        onCreated={() => {
          bumpDataVersion()
          refreshCashChecks()
        }}
      />

      <CashCheckAuditorsModal
        open={!!auditorsPrompt}
        initial1={auditorsPrompt?.initial1 ?? null}
        initial2={auditorsPrompt?.initial2 ?? null}
        notify={(t, text, ms) => notify(t, text, ms)}
        onClose={() => setAuditorsPrompt(null)}
        onConfirm={async ({ inspector1Name, inspector2Name }) => {
          if (!auditorsPrompt) return
          try {
            await window.api?.cashChecks?.setInspectors({
              id: auditorsPrompt.cashCheckId,
              inspector1Name: inspector1Name || null,
              inspector2Name: inspector2Name || null,
            })
            setAuditorsPrompt(null)
            await exportCashCheckPdf(auditorsPrompt.cashCheckId)
            await refreshCashChecks()
          } catch (e: any) {
            notify('error', e?.message || String(e))
          }
        }}
      />

      <section className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 600 }}>Historie</div>
          <div className="helper">Durchgeführte Kassenprüfungen im Jahr {year}.</div>
        </div>

        {cashChecksBusy ? (
          <div className="helper">Lade…</div>
        ) : cashChecks.length === 0 ? (
          <div className="helper">Keine Kassenprüfung erfasst.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {cashChecks.map((cc) => (
              <div key={cc.id} className="card" style={{ padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'grid', gap: 2 }}>
                  <div>
                    <strong>{cc.date}</strong>
                    {cc.voucherNo ? <span className="helper"> · {cc.voucherNo}</span> : null}
                    {cc.budgetLabel ? <span className="helper"> · {cc.budgetLabel}</span> : null}
                  </div>
                  <div className="helper">
                    Soll {eur.format(cc.soll || 0)} · Ist {eur.format(cc.ist || 0)} · Diff {eur.format(cc.diff || 0)}
                    {(cc.inspector1Name || cc.inspector2Name) ? (
                      <span>
                        {' '}
                        · Prüfer {(cc.inspector1Name || '').trim()}
                        {(cc.inspector2Name || '').trim() ? ` / ${(cc.inspector2Name || '').trim()}` : ''}
                      </span>
                    ) : null}
                  </div>
                </div>

                <button
                  className="btn"
                  onClick={() => openAuditorsPrompt(Number(cc.id))}
                  title="PDF-Bericht erstellen und öffnen"
                  aria-label="PDF-Bericht erstellen und öffnen"
                  style={{
                    background: '#c62828',
                    color: '#fff',
                    fontWeight: 500,
                    padding: '6px 12px',
                  }}
                >
                  📄 PDF
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
