import React, { useEffect, useMemo, useState } from 'react'

export default function CashCheckAuditorsModal(props: {
  open: boolean
  initial1?: string | null
  initial2?: string | null
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
  onClose: () => void
  onConfirm: (v: { inspector1Name: string; inspector2Name: string }) => void
}) {
  const { open, initial1, initial2, notify, onClose, onConfirm } = props
  const [inspector1, setInspector1] = useState('')
  const [inspector2, setInspector2] = useState('')

  const canSubmit = useMemo(() => {
    return !!inspector1.trim() || !!inspector2.trim()
  }, [inspector1, inspector2])

  useEffect(() => {
    if (!open) return
    setInspector1((initial1 || '').trim())
    setInspector2((initial2 || '').trim())
  }, [open, initial1, initial2])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Kassenprüfer eintragen</h3>
          <button className="btn ghost" onClick={onClose} aria-label="Schließen" style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 8 }}>
            ✕
          </button>
        </div>

        <div className="helper">
          Für den PDF-Kassenprüferbericht wird mindestens ein Kassenprüfer benötigt. Wenn ihr sie noch nicht bei den Mitgliedern gepflegt habt, tragt sie hier ein.
        </div>

        <div className="row" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>1. Kassenprüfer (optional)</label>
            <input className="input" value={inspector1} onChange={(e) => setInspector1(e.target.value)} placeholder="Name" />
          </div>
          <div className="field">
            <label>2. Kassenprüfer (optional)</label>
            <input className="input" value={inspector2} onChange={(e) => setInspector2(e.target.value)} placeholder="Name" />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="btn"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) {
                notify('error', 'Bitte mindestens einen Kassenprüfer angeben.')
                return
              }
              onConfirm({ inspector1Name: inspector1.trim(), inspector2Name: inspector2.trim() })
            }}
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  )
}
