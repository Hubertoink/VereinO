import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ModalHeader from '../ModalHeader'

// Local contrast helper (kept self-contained)
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

const EARMARK_PALETTE = ['#7C4DFF', '#2962FF', '#00B8D4', '#00C853', '#AEEA00', '#FFD600', '#FF9100', '#FF3D00', '#F50057', '#9C27B0']

export type BindingModalValue = {
  id?: number
  code: string
  name: string
  description?: string | null
  startDate?: string | null
  endDate?: string | null
  isActive?: boolean
  color?: string | null
  budget?: number | null
}

export default function BindingModal({ value, onClose, onSaved }: { value: BindingModalValue; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(value)
  const [requiredTouched, setRequiredTouched] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [draftColor, setDraftColor] = useState<string>(value.color || '#00C853')
  const [draftError, setDraftError] = useState<string>('')
  const [askDelete, setAskDelete] = useState(false)
  useEffect(() => { setV(value); setRequiredTouched(false); setDraftColor(value.color || '#00C853'); setDraftError(''); setAskDelete(false) }, [value])

  async function save() {
    setRequiredTouched(true)
    const name = (v.name || '').trim()
    const code = (v.code || '').trim()
    if (!name || !code) return
    await (window as any).api?.bindings.upsert?.({
      id: v.id as any,
      code,
      name,
      description: v.description ?? null,
      startDate: v.startDate ?? null,
      endDate: v.endDate ?? null,
      isActive: v.isActive ?? true,
      color: v.color ?? null,
      budget: v.budget ?? null
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
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader 
          title={v.id ? 'Zweckbindung bearbeiten' : 'Zweckbindung anlegen'}
          onClose={onClose}
        />
        <div className="row">
          <div className="field">
            <label htmlFor="binding-code">Code<span className="req-asterisk">*</span></label>
            <input
              id="binding-code"
              className={`input ${requiredTouched && !v.code.trim() ? 'input-error' : ''}`}
              value={v.code}
              onChange={(e) => setV({ ...v, code: e.target.value })}
              placeholder="z.B. ZW01"
            />
            {requiredTouched && !v.code.trim() && (
              <div className="helper error-text">Bitte Code angeben</div>
            )}
          </div>
          <div className="field">
            <label htmlFor="binding-name">Name<span className="req-asterisk">*</span></label>
            <input
              id="binding-name"
              className={`input ${requiredTouched && !v.name.trim() ? 'input-error' : ''}`}
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
              placeholder="z.B. Sommerfest 2025"
            />
            {requiredTouched && !v.name.trim() && (
              <div className="helper error-text">Bitte Namen angeben</div>
            )}
          </div>
          <div className="field field-full-width">
            <label htmlFor="binding-description">Beschreibung</label>
            <input id="binding-description" className="input" value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="Optional" />
          </div>
          <div className="field">
            <label htmlFor="binding-start-date">Von</label>
            <input id="binding-start-date" className="input" type="date" value={v.startDate ?? ''} onChange={(e) => setV({ ...v, startDate: e.target.value || null })} />
          </div>
          <div className="field">
            <label htmlFor="binding-end-date">Bis</label>
            <input id="binding-end-date" className="input" type="date" value={v.endDate ?? ''} onChange={(e) => setV({ ...v, endDate: e.target.value || null })} />
          </div>
          <div className="field">
            <label htmlFor="binding-status">Status</label>
            <select id="binding-status" className="input" value={(v.isActive ?? true) ? '1' : '0'} onChange={(e) => setV({ ...v, isActive: e.target.value === '1' })}>
              <option value="1">aktiv</option>
              <option value="0">inaktiv</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="binding-budget">Budget (€)</label>
            <input id="binding-budget" className="input" type="number" step="0.01" value={(v.budget ?? '') as any}
              onChange={(e) => {
                const val = e.target.value
                setV({ ...v, budget: val === '' ? null : Number(val) })
              }} placeholder="0.00" />
          </div>
          <div className="field field-full-width">
            <label>Farbe</label>
            <div className="color-picker-container">
              {EARMARK_PALETTE.map((c) => (
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
          <div className="helper m-0">Ctrl+S = Speichern · Esc = Abbrechen</div>
          <div className="modal-actions">
            {!!v.id && (
              <button className="btn danger" onClick={() => setAskDelete(true)}>🗑 Löschen</button>
            )}
            <button className="btn" onClick={onClose}>Abbrechen</button>
            <button className="btn primary" onClick={() => save()}>Speichern</button>
          </div>
        </div>
      </div>
      {askDelete && v.id && (
        <div className="modal-overlay" onClick={() => setAskDelete(false)} role="dialog" aria-modal="true">
          <div className="modal delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-header">
              <h3 className="m-0">Zweckbindung löschen</h3>
              <button className="btn ghost" onClick={() => setAskDelete(false)} aria-label="Schließen">✕</button>
            </div>
            <div>Möchtest du die Zweckbindung <strong>{v.code}</strong> – {v.name} wirklich löschen?</div>
            <div className="helper">Hinweis: Die Zuordnung bestehender Buchungen bleibt erhalten; es wird nur die Zweckbindung entfernt.</div>
            <div className="delete-modal-actions">
              <button className="btn" onClick={() => setAskDelete(false)}>Abbrechen</button>
              <button className="btn danger" onClick={async () => { await (window as any).api?.bindings.delete?.({ id: v.id as number }); setAskDelete(false); onSaved(); onClose() }}>Ja, löschen</button>
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
                <label htmlFor="color-picker-native">Picker</label>
                <input id="color-picker-native" className="color-input-native" type="color" value={draftColor} onChange={(e) => { setDraftColor(e.target.value); setDraftError('') }} />
              </div>
              <div className="field">
                <label htmlFor="color-picker-hex">HEX</label>
                <input id="color-picker-hex" className="input" value={draftColor} onChange={(e) => { setDraftColor(e.target.value); setDraftError('') }} placeholder="#00C853" />
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
