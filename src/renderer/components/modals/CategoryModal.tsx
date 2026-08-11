import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getContrastTextColor } from '../../utils/tagColors'

const PALETTE = ['#7C4DFF', '#2962FF', '#00B8D4', '#00C853', '#AEEA00', '#FFD600', '#FF9100', '#FF3D00', '#F50057', '#9C27B0']
const ICONS = ['🏷️', '📁', '🧾', '🛒', '🚗', '🏗️', '💡', '📣', '🎯', '🧰', '☕']

export type CategoryValue = { id?: number; name: string; color?: string | null; icon?: string | null }

export default function CategoryModal({ value, onClose, onSaved, notify }: {
  value: CategoryValue
  onClose: () => void
  onSaved: () => void
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
}) {
  const [draft, setDraft] = useState(value)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [draftColor, setDraftColor] = useState(value.color || '#00C853')
  const [colorError, setColorError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDraft(value)
    setDraftColor(value.color || '#00C853')
    setColorError('')
  }, [value])

  const save = async () => {
    const name = draft.name.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      if (draft.id) await window.api.classifications.primary.update({ id: draft.id, name, color: draft.color || null, icon: draft.icon || null })
      else await window.api.classifications.primary.create({ name, color: draft.color || null, icon: draft.icon || null })
      onSaved()
    } catch (error: any) {
      notify('error', error?.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  const previewColor = draft.color || 'var(--muted)'
  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onMouseDown={(event) => event.stopPropagation()}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 20 }}>🏷️</span><h2 style={{ margin: 0 }}>{draft.id ? 'Kategorie bearbeiten' : 'Neue Kategorie'}</h2></div>
          <button className="btn ghost" onClick={onClose} aria-label="Schließen" style={{ padding: '4px 8px', fontSize: 18 }}>✕</button>
        </header>

        <div className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, background: draft.color ? `${draft.color}20` : 'var(--muted)' }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: previewColor, display: 'grid', placeItems: 'center', color: draft.color ? getContrastTextColor(draft.color) : 'var(--text)', fontSize: 20 }}>{draft.icon || '🏷️'}</div>
          <div><div style={{ fontWeight: 600, fontSize: 15 }}>{draft.name || 'Kategorie-Name'}</div><div className="helper" style={{ fontSize: 11 }}>Vorschau</div></div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div className="field"><label>Name</label><input className="input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="z. B. Material, Vertrieb oder Projekt A" autoFocus /></div>
          <div className="field"><label>Zeichen</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}><button type="button" onClick={() => setDraft({ ...draft, icon: null })} style={{ minWidth: 76, height: 32, padding: '0 9px', borderRadius: 8, border: !draft.icon ? '2px solid var(--accent)' : '1px solid var(--border)', background: !draft.icon ? 'color-mix(in oklab, var(--accent) 16%, transparent)' : 'transparent', color: 'var(--text)', cursor: 'pointer' }}>Kein Zeichen</button>{ICONS.map((icon) => <button key={icon} type="button" onClick={() => setDraft({ ...draft, icon })} style={{ width: 32, height: 32, borderRadius: 8, border: draft.icon === icon ? '2px solid var(--accent)' : '1px solid var(--border)', background: draft.icon === icon ? 'color-mix(in oklab, var(--accent) 16%, transparent)' : 'transparent', cursor: 'pointer' }}>{icon}</button>)}</div></div>
          <div className="field">
            <label>Farbe</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>{PALETTE.map((color) => <button key={color} type="button" onClick={() => setDraft({ ...draft, color })} title={color} style={{ width: 32, height: 32, borderRadius: 8, border: draft.color === color ? '3px solid var(--text)' : '2px solid transparent', background: color, cursor: 'pointer', transform: draft.color === color ? 'scale(1.1)' : undefined }} />)}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button type="button" className="btn" onClick={() => setShowColorPicker(true)} style={{ flex: 1 }}>🎨 Eigene Farbe…</button><button type="button" className="btn" onClick={() => setDraft({ ...draft, color: null })} style={{ flex: 1 }}>Keine Farbe</button></div>
          </div>
        </div>
        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={!draft.name.trim() || busy} onClick={() => void save()}>{busy ? 'Speichert…' : 'Speichern'}</button></footer>
      </div>
      {showColorPicker && <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={() => setShowColorPicker(false)}><div className="modal" style={{ maxWidth: 420, display: 'grid', gap: 12 }} onMouseDown={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ margin: 0 }}>Eigene Farbe wählen</h3><button className="btn ghost" onClick={() => setShowColorPicker(false)} aria-label="Schließen">✕</button></div>
        <div className="row"><div className="field"><label>Picker</label><input type="color" value={draftColor} onChange={(event) => { setDraftColor(event.target.value); setColorError('') }} style={{ width: 60, height: 36, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent' }} /></div><div className="field"><label>HEX</label><input className="input" value={draftColor} onChange={(event) => { setDraftColor(event.target.value); setColorError('') }} placeholder="#00C853" />{colorError && <div className="helper" style={{ color: 'var(--danger)' }}>{colorError}</div>}</div></div>
        <div className="card" style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 28, height: 28, borderRadius: 6, background: draftColor, border: '1px solid var(--border)' }} /><div className="helper">Kontrast: <span style={{ background: draftColor, color: getContrastTextColor(draftColor), padding: '2px 6px', borderRadius: 6 }}>{getContrastTextColor(draftColor)}</span></div></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn" onClick={() => setShowColorPicker(false)}>Abbrechen</button><button className="btn primary" onClick={() => { const color = draftColor.trim(); if (!/^#[0-9a-fA-F]{6}$/.test(color)) { setColorError('Bitte gültigen HEX-Wert eingeben (z. B. #00C853)'); return } setDraft({ ...draft, color }); setShowColorPicker(false) }}>Übernehmen</button></div>
      </div></div>}
    </div>, document.body
  )
}
