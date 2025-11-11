import React, { useState } from 'react'
import { createPortal } from 'react-dom'

export interface BatchEarmarkModalProps {
  onClose: () => void
  earmarks: Array<{ id: number; code: string; name: string; color?: string | null }>
  tagDefs: Array<{ id: number; name: string; color?: string | null }>
  budgets: Array<{ id: number; label: string }>
  currentFilters: { paymentMethod?: 'BAR' | 'BANK'; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; type?: 'IN' | 'OUT' | 'TRANSFER'; from?: string; to?: string; q?: string; earmarkId?: number; budgetId?: number; tag?: string }
  onApplied: (updated: number) => void
  notify?: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
}

const BatchEarmarkModal: React.FC<BatchEarmarkModalProps> = ({ onClose, earmarks, tagDefs, budgets, currentFilters, onApplied, notify }) => {
  const [mode, setMode] = useState<'EARMARK' | 'TAGS' | 'BUDGET'>('EARMARK')
  const [earmarkId, setEarmarkId] = useState<number | ''>('')
  const [onlyWithout, setOnlyWithout] = useState<boolean>(false)
  const [tagInput, setTagInput] = useState<string>('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [budgetId, setBudgetId] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)
  const [affectedCount, setAffectedCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState<boolean>(false)
  const [showConfirm, setShowConfirm] = useState<boolean>(false)

  const selectedEarmark = earmarks.find(e => e.id === (typeof earmarkId === 'number' ? earmarkId : -1))
  const addTag = (t: string) => {
    const v = (t || '').trim()
    if (!v) return
    if (!selectedTags.some(x => x.toLowerCase() === v.toLowerCase())) setSelectedTags(prev => [...prev, v])
  }
  const removeTag = (name: string) => setSelectedTags(prev => prev.filter(t => t.toLowerCase() !== name.toLowerCase()))

  // Load affected count whenever filters change
  React.useEffect(() => {
    (async () => {
      setLoadingCount(true)
      try {
        const res = await (window as any).api?.vouchers?.list?.({
          limit: 1,
          offset: 0,
          ...currentFilters
        })
        setAffectedCount(res?.total ?? 0)
      } catch {
        setAffectedCount(null)
      } finally {
        setLoadingCount(false)
      }
    })()
  }, [currentFilters])

  async function run() {
    try {
      setBusy(true)
      if (mode === 'EARMARK') {
        if (!earmarkId) { notify?.('error', 'Bitte eine Zweckbindung wählen'); return }
        const payload: any = { ...currentFilters, earmarkId: Number(earmarkId) }
        if (onlyWithout) payload.onlyWithout = true
        const res = await (window as any).api?.vouchers.batchAssignEarmark?.(payload)
        const n = res?.updated ?? 0
        onApplied(n); onClose()
      } else if (mode === 'TAGS') {
        const tags = selectedTags.length ? selectedTags : (tagInput || '').split(',').map(s => s.trim()).filter(Boolean)
        if (!tags.length) { notify?.('error', 'Bitte mindestens einen Tag angeben'); return }
        const res = await (window as any).api?.vouchers.batchAssignTags?.({ tags, ...currentFilters })
        const n = res?.updated ?? 0
        onApplied(n); onClose()
      } else if (mode === 'BUDGET') {
        if (!budgetId) { notify?.('error', 'Bitte ein Budget wählen'); return }
        const payload: any = { ...currentFilters, budgetId: Number(budgetId) }
        if (onlyWithout) payload.onlyWithout = true
        const res = await (window as any).api?.vouchers.batchAssignBudget?.(payload)
        const n = res?.updated ?? 0
        onApplied(n); onClose()
      }
    } catch (e: any) {
      notify?.('error', e?.message || String(e))
    } finally { setBusy(false) }
  }

  function prepareConfirm() {
    // Validate before showing confirmation
    if (mode === 'EARMARK' && !earmarkId) { notify?.('error', 'Bitte eine Zweckbindung wählen'); return }
    if (mode === 'BUDGET' && !budgetId) { notify?.('error', 'Bitte ein Budget wählen'); return }
    if (mode === 'TAGS') {
      const tags = selectedTags.length ? selectedTags : (tagInput || '').split(',').map(s => s.trim()).filter(Boolean)
      if (!tags.length) { notify?.('error', 'Bitte mindestens einen Tag angeben'); return }
    }
    setShowConfirm(true)
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Batch zuweisen</h2>
          <button className="btn danger" onClick={onClose}>Schließen</button>
        </header>
        <div className="row">
          <div className="field" style={{ gridColumn: '1 / span 2' }}>
            <label>Was soll zugewiesen werden?</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className={`btn ${mode === 'EARMARK' ? 'primary' : ''}`} onClick={() => setMode('EARMARK')}>Zweckbindung</button>
              <button className={`btn ${mode === 'TAGS' ? 'primary' : ''}`} onClick={() => setMode('TAGS')}>Tags</button>
              <button className={`btn ${mode === 'BUDGET' ? 'primary' : ''}`} onClick={() => setMode('BUDGET')}>Budget</button>
            </div>
          </div>

          {mode === 'EARMARK' && (
            <>
              <div className="field" style={{ gridColumn: '1 / span 2' }}>
                <label>Zweckbindung</label>
                <select className="input" value={earmarkId as any} onChange={(e) => setEarmarkId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">— bitte wählen —</option>
                  {earmarks.map(em => (
                    <option key={em.id} value={em.id}>{em.code} – {em.name}</option>
                  ))}
                </select>
                {selectedEarmark?.color && (
                  <div className="helper" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span>Farbe:</span>
                    <span title={selectedEarmark.color || ''} style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 4, background: selectedEarmark.color || undefined }} />
                  </div>
                )}
              </div>
              <div className="field" style={{ gridColumn: '1 / span 2' }}>
                <label><input type="checkbox" checked={onlyWithout} onChange={(e) => setOnlyWithout(e.target.checked)} /> Nur Buchungen ohne Zweckbindung aktualisieren</label>
              </div>
            </>
          )}

          {mode === 'TAGS' && (
            <>
              <div className="field" style={{ gridColumn: '1 / span 2' }}>
                <label>Tags hinzufügen</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {(selectedTags || []).map(t => {
                    const tagDef = tagDefs.find(td => td.name.toLowerCase() === t.toLowerCase())
                    return (
                      <span key={t} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: tagDef?.color || undefined, color: tagDef?.color ? '#fff' : undefined }}>
                        {t}
                        <button className="btn" title="Entfernen" onClick={() => removeTag(t)} style={{ background: 'transparent', border: 'none', color: 'inherit', padding: 0, cursor: 'pointer' }}>×</button>
                      </span>
                    )
                  })}
                </div>
                <input className="input" placeholder="Tags, kommasepariert…" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && tagInput.trim()) { addTag(tagInput.trim()); setTagInput('') } }} />
                {!!tagDefs.length && (
                  <div style={{ marginTop: 8 }}>
                    <div className="helper" style={{ marginBottom: 6 }}>Alle verfügbaren Tags:</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {tagDefs.map(t => (
                        <button 
                          key={t.id} 
                          className="btn" 
                          onClick={() => addTag(t.name)}
                          style={{ 
                            background: t.color || 'var(--muted)', 
                            color: '#fff',
                            border: 'none'
                          }}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="helper" style={{ marginTop: 6 }}>Tipp: Mit Enter hinzufügen. Bereits existierende Tags werden automatisch wiederverwendet.</div>
              </div>
            </>
          )}

          {mode === 'BUDGET' && (
            <>
              <div className="field" style={{ gridColumn: '1 / span 2' }}>
                <label>Budget</label>
                <select className="input" value={budgetId as any} onChange={(e) => setBudgetId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">— bitte wählen —</option>
                  {budgets.map(b => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ gridColumn: '1 / span 2' }}>
                <label><input type="checkbox" checked={onlyWithout} onChange={(e) => setOnlyWithout(e.target.checked)} /> Nur Buchungen ohne Budget aktualisieren</label>
              </div>
            </>
          )}

          <div className="card" style={{ gridColumn: '1 / span 2', padding: 10 }}>
            <div className="helper">
              {loadingCount ? 'Lade Anzahl …' : affectedCount !== null ? `${affectedCount} Buchung(en) werden von der aktuellen Filterung erfasst` : 'Anzahl konnte nicht geladen werden'}
            </div>
            <div className="helper" style={{ marginTop: 6 }}>Betroffene Buchungen: Aktuelle Filter werden angewandt (Suche, Zeitraum, Sphäre, Art, Zahlweg).</div>
            <ul style={{ margin: '6px 0 0 16px' }}>
              {currentFilters.q && <li>Suche: <code>{currentFilters.q}</code></li>}
              {currentFilters.from && currentFilters.to && <li>Zeitraum: {currentFilters.from} – {currentFilters.to}</li>}
              {currentFilters.sphere && <li>Sphäre: {currentFilters.sphere}</li>}
              {currentFilters.type && <li>Art: {currentFilters.type}</li>}
              {currentFilters.paymentMethod && <li>Zahlweg: {currentFilters.paymentMethod}</li>}
              {currentFilters.earmarkId && <li>Zweckbindung-Filter: #{currentFilters.earmarkId}</li>}
              {currentFilters.budgetId && <li>Budget-Filter: #{currentFilters.budgetId}</li>}
              {currentFilters.tag && <li>Tag-Filter: {currentFilters.tag}</li>}
              {onlyWithout && mode === 'EARMARK' && <li>Nur ohne bestehende Zweckbindung</li>}
              {onlyWithout && mode === 'BUDGET' && <li>Nur ohne bestehendes Budget</li>}
            </ul>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn primary" disabled={busy || loadingCount || (mode === 'EARMARK' && !earmarkId) || (mode === 'BUDGET' && !budgetId)} onClick={prepareConfirm}>Übernehmen</button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)} role="dialog" aria-modal="true">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Batch-Zuweisung bestätigen</h3>
              <button className="btn ghost" onClick={() => setShowConfirm(false)} aria-label="Schließen">✕</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              {affectedCount !== null && affectedCount > 0 ? (
                <>
                  <p>
                    Möchtest du wirklich <strong>{affectedCount} Buchung(en)</strong> mit folgenden Werten aktualisieren?
                  </p>
                  <ul style={{ marginLeft: 16 }}>
                    {mode === 'EARMARK' && earmarkId && (
                      <li>
                        <strong>Zweckbindung:</strong> {earmarks.find(e => e.id === earmarkId)?.code} – {earmarks.find(e => e.id === earmarkId)?.name}
                      </li>
                    )}
                    {mode === 'TAGS' && (
                      <li>
                        <strong>Tags:</strong> {(selectedTags.length ? selectedTags : (tagInput || '').split(',').map(s => s.trim()).filter(Boolean)).join(', ')}
                      </li>
                    )}
                    {mode === 'BUDGET' && budgetId && (
                      <li>
                        <strong>Budget:</strong> {budgets.find(b => b.id === budgetId)?.label}
                      </li>
                    )}
                  </ul>
                </>
              ) : (
                <p>Keine Buchungen gefunden, die der aktuellen Filterung entsprechen.</p>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setShowConfirm(false)}>Abbrechen</button>
              {affectedCount !== null && affectedCount > 0 && (
                <button className="btn primary" onClick={() => { setShowConfirm(false); run(); }} disabled={busy}>
                  Ja, {affectedCount} Buchung(en) aktualisieren
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}

export default BatchEarmarkModal
