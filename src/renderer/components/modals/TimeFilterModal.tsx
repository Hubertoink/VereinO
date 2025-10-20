import React, { useEffect, useState } from 'react'

export default function TimeFilterModal({ open, onClose, yearsAvail, from, to, onApply }: {
  open: boolean
  onClose: () => void
  yearsAvail: number[]
  from: string
  to: string
  onApply: (v: { from: string; to: string }) => void
}) {
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
            <select className="input" value={(() => {
              if (!f || !t) return ''
              const fy = f.slice(0, 4)
              const ty = t.slice(0, 4)
              if (f === `${fy}-01-01` && t === `${fy}-12-31` && fy === ty) return fy
              return ''
            })()} onChange={(e) => {
              const y = e.target.value
              if (!y) { setF(''); setT(''); return }
              const yr = Number(y)
              const nf = new Date(Date.UTC(yr, 0, 1)).toISOString().slice(0, 10)
              const nt = new Date(Date.UTC(yr, 11, 31)).toISOString().slice(0, 10)
              setF(nf); setT(nt)
            }}>
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
