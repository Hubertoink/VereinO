import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ModalHeader from '../ModalHeader'

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

const PALETTE = ['#7C4DFF', '#2962FF', '#00B8D4', '#00C853', '#AEEA00', '#FFD600', '#FF9100', '#FF3D00', '#F50057', '#9C27B0']

export type BudgetModalValue = {
  id?: number
  year: number
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  amountPlanned: number
  name?: string | null
  categoryName?: string | null
  projectName?: string | null
  startDate?: string | null
  endDate?: string | null
  color?: string | null
  categoryId?: number | null
  projectId?: number | null
  earmarkId?: number | null
}

export default function BudgetModal({ value, onClose, onSaved }: { value: BudgetModalValue; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(value)
  const [nameError, setNameError] = useState<string>('')
  const [requiredTouched, setRequiredTouched] = useState(false)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [draftColor, setDraftColor] = useState<string>(value.color || '#00C853')
  const [draftError, setDraftError] = useState<string>('')
  const [askDelete, setAskDelete] = useState(false)
  useEffect(() => { setV(value); setNameError(''); setRequiredTouched(false); setDraftColor(value.color || '#00C853'); setDraftError(''); setAskDelete(false) }, [value])

  async function save() {
    setRequiredTouched(true)
    const name = (v.name || '').trim()
    if (!name) { setNameError('Bitte Namen angeben'); nameRef.current?.focus(); return }
    await (window as any).api?.budgets.upsert?.({
      id: v.id as any,
      year: v.year,
      sphere: v.sphere,
      amountPlanned: v.amountPlanned,
      name: name || null,
      categoryName: (v.categoryName || '').trim() || null,
      projectName: (v.projectName || '').trim() || null,
      startDate: v.startDate || null,
      endDate: v.endDate || null,
      color: v.color || null,
      categoryId: v.categoryId || null,
      projectId: v.projectId || null,
      earmarkId: v.earmarkId || null
    })
    onSaved()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); e.preventDefault(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { save(); e.preventDefault(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [v])

  return createPortal(
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader 
          title={v.id ? 'Budget bearbeiten' : 'Budget anlegen'}
          onClose={onClose}
        />
        <div className="row">
          <div className="field">
            <label htmlFor="budget-year">Jahr <span className="req-asterisk" aria-hidden="true">*</span></label>
            <input id="budget-year" className="input" type="number" value={v.year} onChange={(e) => setV({ ...v, year: Number(e.target.value) })} placeholder="2025" />
          </div>
          <div className="field">
            <label htmlFor="budget-amount">Budget (€) <span className="req-asterisk" aria-hidden="true">*</span></label>
            <input id="budget-amount" className="input" type="number" step="0.01" value={v.amountPlanned} onChange={(e) => setV({ ...v, amountPlanned: Number(e.target.value) })} placeholder="0.00" />
          </div>
          <div className="field">
            <label htmlFor="budget-name">Name <span className="req-asterisk" aria-hidden="true">*</span></label>
            <input
              id="budget-name"
              ref={nameRef}
              className={`input ${nameError ? 'input-error' : ''}`}
              value={v.name ?? ''}
              onChange={(e) => { const nv = e.target.value; setV({ ...v, name: nv }); if (nameError && nv.trim()) setNameError('') }}
              placeholder="z. B. Jugendfreizeit"
              style={requiredTouched && !(v.name || '').trim() ? { borderColor: 'var(--danger)' } : undefined}
            />
            {requiredTouched && !(v.name || '').trim() && (
              <div className="helper" style={{ color: 'var(--danger)' }}>Bitte Namen angeben</div>
            )}
          </div>
          <div className="field">
            <label htmlFor="budget-category">Kategorie</label>
            <input id="budget-category" className="input" value={v.categoryName ?? ''} onChange={(e) => setV({ ...v, categoryName: e.target.value || null })} placeholder="z. B. Material" />
          </div>
          <div className="field">
            <label htmlFor="budget-project">Projekt</label>
            <input id="budget-project" className="input" value={v.projectName ?? ''} onChange={(e) => setV({ ...v, projectName: e.target.value || null })} placeholder="z. B. Projekt X" />
          </div>
          <div className="date-range-container">
            <div className="field">
              <label htmlFor="budget-start-date">Von</label>
              <input id="budget-start-date" className="input" type="date" value={v.startDate ?? ''} onChange={(e) => setV({ ...v, startDate: e.target.value || null })} />
            </div>
            <div className="field">
              <label htmlFor="budget-end-date">Bis</label>
              <input id="budget-end-date" className="input" type="date" value={v.endDate ?? ''} onChange={(e) => setV({ ...v, endDate: e.target.value || null })} />
            </div>
          </div>
          <div className="field field-full-width">
            <label>Farbe</label>
            <div className="color-picker-container">
              {PALETTE.map((c) => (
                <button key={c} type="button" className={`btn color-swatch-btn ${v.color === c ? 'color-swatch-selected' : 'color-swatch-unselected'}`} onClick={() => setV({ ...v, color: c })} title={c} style={{ background: c }} aria-label={`Farbe ${c}`}>
                  <span aria-hidden="true" />
                </button>
              ))}
              <button type="button" className="btn custom-color-btn" onClick={() => setShowColorPicker(true)} title="Eigene Farbe" style={{ background: v.color || 'var(--muted)', color: v.color ? contrastText(v.color) : 'var(--text)' }}>
                Eigene…
              </button>
              <button type="button" className="btn custom-color-btn" onClick={() => setV({ ...v, color: null })} title="Keine Farbe">Keine</button>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <div className="helper">Ctrl+S = Speichern · Esc = Abbrechen</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!!v.id && (
              <button className="btn danger modal-delete-btn" onClick={() => setAskDelete(true)}>🗑 Löschen</button>
            )}
            <button className="btn" onClick={onClose}>Abbrechen</button>
            <button className="btn primary" onClick={save}>Speichern</button>
          </div>
        </div>
      </div>
      {askDelete && v.id && (
        <div className="modal-overlay" onClick={() => setAskDelete(false)} role="dialog" aria-modal="true">
          <div className="modal delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-header">
              <h3 className="m-0">Budget löschen</h3>
              <button className="btn ghost" onClick={() => setAskDelete(false)} aria-label="Schließen">✕</button>
            </div>
            <div>Möchtest du das Budget <strong>{(v.name || '').trim() || ('#' + v.id)}</strong> wirklich löschen?</div>
            <div className="helper">Dieser Vorgang kann nicht rückgängig gemacht werden.</div>
            <div className="delete-modal-actions">
              <button className="btn" onClick={() => setAskDelete(false)}>Abbrechen</button>
              <button className="btn danger" onClick={async () => { await (window as any).api?.budgets.delete?.({ id: v.id as number }); setAskDelete(false); onSaved(); onClose() }}>Ja, löschen</button>
            </div>
          </div>
        </div>
      )}
      {showColorPicker && (
        <div className="modal-overlay" onClick={() => setShowColorPicker(false)} role="dialog" aria-modal="true">
          <div className="modal color-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="color-picker-header">
              <h3 className="m-0">Eigene Farbe wählen</h3>
              <button className="btn ghost" onClick={() => setShowColorPicker(false)} aria-label="Schließen">✕</button>
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="budget-color-picker-native">Picker</label>
                <input id="budget-color-picker-native" className="color-input-native" type="color" value={draftColor} onChange={(e) => { setDraftColor(e.target.value); setDraftError('') }} />
              </div>
              <div className="field">
                <label htmlFor="budget-color-picker-hex">HEX</label>
                <input id="budget-color-picker-hex" className="input" value={draftColor} onChange={(e) => { setDraftColor(e.target.value); setDraftError('') }} placeholder="#00C853" />
                {draftError && <div className="helper error-text">{draftError}</div>}
              </div>
            </div>
            <div className="card color-preview-card">
              <div className="color-preview-swatch" style={{ background: draftColor }} />
              <div className="helper">Kontrast: <span className="contrast-sample" style={{ background: draftColor, color: contrastText(draftColor) }}>{contrastText(draftColor)}</span></div>
            </div>
            <div className="delete-modal-actions">
              <button className="btn" onClick={() => setShowColorPicker(false)}>Abbrechen</button>
              <button className="btn primary" onClick={() => {
                const hex = draftColor.trim()
                const ok = /^#([0-9a-fA-F]{6})$/.test(hex)
                if (!ok) { setDraftError('Bitte gültigen HEX-Wert eingeben (z. B. #00C853)'); return }
                setV({ ...v, color: hex })
                setShowColorPicker(false)
              }}>Übernehmen</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
