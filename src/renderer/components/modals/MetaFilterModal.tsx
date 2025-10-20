import React, { useEffect, useState } from 'react'

export type Sphere = null | 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'

export default function MetaFilterModal({ open, onClose, budgets, earmarks, sphere, earmarkId, budgetId, onApply }: {
  open: boolean
  onClose: () => void
  budgets: Array<{ id: number; name?: string | null; categoryName?: string | null; projectName?: string | null; year: number }>
  earmarks: Array<{ id: number; code: string; name?: string | null }>
  sphere: Sphere
  earmarkId: number | null
  budgetId: number | null
  onApply: (v: { sphere: Sphere; earmarkId: number | null; budgetId: number | null }) => void
}) {
  const [s, setS] = useState<Sphere>(sphere)
  const [e, setE] = useState<number | null>(earmarkId)
  const [b, setB] = useState<number | null>(budgetId)
  useEffect(() => { setS(sphere); setE(earmarkId); setB(budgetId) }, [sphere, earmarkId, budgetId, open])
  const labelForBudget = (bud: { id: number; name?: string | null; categoryName?: string | null; projectName?: string | null; year: number }) =>
    (bud.name && bud.name.trim()) || bud.categoryName || bud.projectName || String(bud.year)
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Filter wählen</h2>
          <button className="btn danger" onClick={onClose}>Schließen</button>
        </header>
        <div className="row">
          <div className="field">
            <label>Sphäre</label>
            <select className="input" value={s ?? ''} onChange={(ev) => setS((ev.target.value as any) || null)}>
              <option value="">Alle</option>
              <option value="IDEELL">IDEELL</option>
              <option value="ZWECK">ZWECK</option>
              <option value="VERMOEGEN">VERMOEGEN</option>
              <option value="WGB">WGB</option>
            </select>
          </div>
          <div className="field">
            <label>Zweckbindung</label>
            <select className="input" value={e ?? ''} onChange={(ev) => setE(ev.target.value ? Number(ev.target.value) : null)}>
              <option value="">Alle</option>
              {earmarks.map(em => (
                <option key={em.id} value={em.id}>{em.code} – {em.name || ''}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Budget</label>
            <select className="input" value={b ?? ''} onChange={(ev) => setB(ev.target.value ? Number(ev.target.value) : null)}>
              <option value="">Alle</option>
              {budgets.map(bu => (
                <option key={bu.id} value={bu.id}>{labelForBudget(bu)}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <button className="btn" onClick={() => { setS(null); setE(null); setB(null) }}>Zurücksetzen</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Abbrechen</button>
            <button className="btn primary" onClick={() => { onApply({ sphere: s, earmarkId: e, budgetId: b }); onClose() }}>Übernehmen</button>
          </div>
        </div>
      </div>
    </div>
  )
}
