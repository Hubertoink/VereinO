import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Local contrast helper to keep this component self-contained
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

export type TagValue = { id?: number; name: string; color?: string | null }

export default function TagModal({ value, onClose, onSaved, notify }: { value: TagValue; onClose: () => void; onSaved: () => void; notify?: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void }) {
    const [v, setV] = useState(value)
    const [showColorPicker, setShowColorPicker] = useState(false)
    const [draftColor, setDraftColor] = useState<string>(value.color || '#00C853')
    const [draftError, setDraftError] = useState<string>('')
    useEffect(() => { setV(value); setDraftColor(value.color || '#00C853'); setDraftError('') }, [value])
    const canSave = (v.name || '').trim().length > 0
    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 20 }}>🏷️</span>
                        <h2 style={{ margin: 0 }}>{v.id ? 'Tag bearbeiten' : 'Neuer Tag'}</h2>
                    </div>
                    <button className="btn ghost" onClick={onClose} aria-label="Schließen" style={{ padding: '4px 8px', fontSize: 18 }}>✕</button>
                </header>
                
                {/* Preview */}
                <div className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, background: v.color ? `${v.color}20` : 'var(--muted)' }}>
                    <div style={{ 
                        width: 40, 
                        height: 40, 
                        borderRadius: 8, 
                        background: v.color || 'var(--border)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        color: v.color ? contrastText(v.color) : 'var(--text)',
                        fontWeight: 700,
                        fontSize: 18
                    }}>
                        {(v.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{v.name || 'Tag-Name'}</div>
                        <div className="helper" style={{ fontSize: 11 }}>Vorschau</div>
                    </div>
                </div>

                <div style={{ display: 'grid', gap: 16 }}>
                    <div className="field">
                        <label>Name</label>
                        <input 
                            className="input" 
                            value={v.name} 
                            onChange={(e) => setV({ ...v, name: e.target.value })} 
                            placeholder="z.B. Mitgliedsbeitrag, Material, Event..."
                            autoFocus
                        />
                    </div>
                    
                    <div className="field">
                        <label>Farbe</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                            {PALETTE.map((c) => (
                                <button 
                                    key={c} 
                                    type="button" 
                                    onClick={() => setV({ ...v, color: c })} 
                                    title={c} 
                                    style={{ 
                                        padding: 0, 
                                        width: 32, 
                                        height: 32, 
                                        borderRadius: 8, 
                                        border: v.color === c ? '3px solid var(--text)' : '2px solid transparent', 
                                        background: c,
                                        cursor: 'pointer',
                                        transition: 'transform 0.1s ease',
                                        transform: v.color === c ? 'scale(1.1)' : 'scale(1)'
                                    }}
                                />
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            <button 
                                type="button" 
                                className="btn" 
                                onClick={() => setShowColorPicker(true)} 
                                style={{ 
                                    flex: 1,
                                    background: v.color && !PALETTE.includes(v.color) ? v.color : 'var(--muted)', 
                                    color: v.color && !PALETTE.includes(v.color) ? contrastText(v.color) : 'var(--text)',
                                    border: v.color && !PALETTE.includes(v.color) ? '2px solid var(--text)' : undefined
                                }}
                            >
                                🎨 Eigene Farbe…
                            </button>
                            <button 
                                type="button" 
                                className="btn" 
                                onClick={() => setV({ ...v, color: null })} 
                                style={{ 
                                    flex: 1,
                                    border: !v.color ? '2px solid var(--text)' : undefined 
                                }}
                            >
                                Keine Farbe
                            </button>
                        </div>
                    </div>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <button className="btn" onClick={onClose}>Abbrechen</button>
                    <button className="btn primary" disabled={!canSave} onClick={async () => {
                        try {
                            const payload = { ...v, name: (v.name || '').trim() }
                            if (!payload.name) { notify?.('error', 'Bitte einen Namen eingeben'); return }
                            await (window as any).api?.tags?.upsert?.(payload as any)
                            window.dispatchEvent(new Event('tags-changed'))
                            onSaved()
                        } catch (e: any) {
                            const msg = e?.message || String(e)
                            if (notify) notify('error', msg)
                            else alert(msg)
                        }
                    }}>Speichern</button>
                </div>
            </div>
            {showColorPicker && (
                <div className="modal-overlay" onClick={() => setShowColorPicker(false)} role="dialog" aria-modal="true">
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, display: 'grid', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Eigene Farbe wählen</h3>
                            <button className="btn ghost" onClick={() => setShowColorPicker(false)} aria-label="Schließen">✕</button>
                        </div>
                        <div className="row">
                            <div className="field">
                                <label>Picker</label>
                                <input type="color" value={draftColor} onChange={(e) => { setDraftColor(e.target.value); setDraftError('') }} style={{ width: 60, height: 36, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent' }} />
                            </div>
                            <div className="field">
                                <label>HEX</label>
                                <input className="input" value={draftColor} onChange={(e) => { setDraftColor(e.target.value); setDraftError('') }} placeholder="#00C853" />
                                {draftError && <div className="helper" style={{ color: 'var(--danger)' }}>{draftError}</div>}
                            </div>
                        </div>
                        <div className="card" style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: draftColor, border: '1px solid var(--border)' }} />
                            <div className="helper">Kontrast: <span style={{ background: draftColor, color: contrastText(draftColor), padding: '2px 6px', borderRadius: 6 }}>{contrastText(draftColor)}</span></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
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
