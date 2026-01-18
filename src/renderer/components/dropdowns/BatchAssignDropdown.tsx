import React, { useEffect, useMemo, useState } from 'react'
import FilterDropdown from './FilterDropdown'

export interface BatchAssignDropdownProps {
  earmarks: Array<{ id: number; code: string; name: string; color?: string | null }>
  tagDefs: Array<{ id: number; name: string; color?: string | null }>
  budgets: Array<{ id: number; label: string }>
  currentFilters: {
    paymentMethod?: 'BAR' | 'BANK'
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    type?: 'IN' | 'OUT' | 'TRANSFER'
    from?: string
    to?: string
    q?: string
    earmarkId?: number
    budgetId?: number
    tag?: string
  }
  onApplied: (updated: number) => void
  notify: (type: 'info' | 'success' | 'error', text: string, duration?: number) => void
}

type Mode = 'EARMARK' | 'TAGS' | 'BUDGET'

export default function BatchAssignDropdown({ earmarks, tagDefs, budgets, currentFilters, onApplied, notify }: BatchAssignDropdownProps) {
  const [mode, setMode] = useState<Mode>('EARMARK')
  const [earmarkId, setEarmarkId] = useState<number | ''>('')
  const [budgetId, setBudgetId] = useState<number | ''>('')
  const [onlyWithout, setOnlyWithout] = useState<boolean>(false)

  const [tagInput, setTagInput] = useState<string>('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const [busy, setBusy] = useState(false)
  const [affectedCount, setAffectedCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState<boolean>(false)
  const [confirm, setConfirm] = useState<boolean>(false)

  const hasAnyFilter = useMemo(() => {
    return Object.keys(currentFilters).some((k) => (currentFilters as any)[k] != null && (currentFilters as any)[k] !== '')
  }, [currentFilters])

  const selectedEarmark = earmarks.find((e) => e.id === (typeof earmarkId === 'number' ? earmarkId : -1))

  const addTag = (t: string) => {
    const v = (t || '').trim()
    if (!v) return
    if (!selectedTags.some((x) => x.toLowerCase() === v.toLowerCase())) setSelectedTags((prev) => [...prev, v])
  }

  const removeTag = (name: string) => setSelectedTags((prev) => prev.filter((t) => t.toLowerCase() !== name.toLowerCase()))

  const tagsToApply = useMemo(() => {
    if (selectedTags.length) return selectedTags
    return (tagInput || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }, [selectedTags, tagInput])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoadingCount(true)
      try {
        const res = await (window as any).api?.vouchers?.list?.({
          limit: 1,
          offset: 0,
          ...currentFilters
        })
        if (alive) setAffectedCount(res?.total ?? 0)
      } catch {
        if (alive) setAffectedCount(null)
      } finally {
        if (alive) setLoadingCount(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [currentFilters])

  const validate = (): string | null => {
    if (mode === 'EARMARK' && !earmarkId) return 'Bitte eine Zweckbindung wählen'
    if (mode === 'BUDGET' && !budgetId) return 'Bitte ein Budget wählen'
    if (mode === 'TAGS' && !tagsToApply.length) return 'Bitte mindestens einen Tag angeben'
    if (!hasAnyFilter) return 'Bitte mindestens einen Filter setzen (sonst würden alle Buchungen geändert)'
    return null
  }

  const run = async () => {
    const err = validate()
    if (err) {
      notify('error', err)
      return
    }

    try {
      setBusy(true)

      if (mode === 'EARMARK') {
        const payload: any = { ...currentFilters, earmarkId: Number(earmarkId) }
        if (onlyWithout) payload.onlyWithout = true
        const res = await (window as any).api?.vouchers?.batchAssignEarmark?.(payload)
        const n = res?.updated ?? 0
        notify('success', `${n} Buchung(en) aktualisiert`)
        onApplied(n)
      }

      if (mode === 'TAGS') {
        const res = await (window as any).api?.vouchers?.batchAssignTags?.({ tags: tagsToApply, ...currentFilters })
        const n = res?.updated ?? 0
        notify('success', `${n} Buchung(en) aktualisiert`)
        onApplied(n)
      }

      if (mode === 'BUDGET') {
        const payload: any = { ...currentFilters, budgetId: Number(budgetId) }
        if (onlyWithout) payload.onlyWithout = true
        const res = await (window as any).api?.vouchers?.batchAssignBudget?.(payload)
        const n = res?.updated ?? 0
        notify('success', `${n} Buchung(en) aktualisiert`)
        onApplied(n)
      }

      setConfirm(false)
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FilterDropdown
      trigger={
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <rect x="3" y="10" width="18" height="4" rx="1" />
          <rect x="3" y="16" width="18" height="4" rx="1" />
        </svg>
      }
      title="Batch zuweisen"
      hasActiveFilters={false}
      alignRight
      width={460}
      ariaLabel="Batch zuweisen"
      buttonTitle="Batch zuweisen"
    >
      <div className="filter-dropdown__mode">
        <button type="button" className={`btn ${mode === 'EARMARK' ? 'primary' : ''}`} onClick={() => { setMode('EARMARK'); setConfirm(false) }}>
          Zweckbindung
        </button>
        <button type="button" className={`btn ${mode === 'TAGS' ? 'primary' : ''}`} onClick={() => { setMode('TAGS'); setConfirm(false) }}>
          Tags
        </button>
        <button type="button" className={`btn ${mode === 'BUDGET' ? 'primary' : ''}`} onClick={() => { setMode('BUDGET'); setConfirm(false) }}>
          Budget
        </button>
      </div>

      {mode === 'EARMARK' && (
        <>
          <div className="filter-dropdown__field filter-dropdown__field--mt">
            <label className="filter-dropdown__label">Zweckbindung</label>
            <select className="input" value={earmarkId as any} onChange={(e) => setEarmarkId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— bitte wählen —</option>
              {earmarks.map((em) => (
                <option key={em.id} value={em.id}>
                  {em.code} – {em.name}
                </option>
              ))}
            </select>
            {selectedEarmark?.color && (
              <div className="filter-dropdown__hint">
                <span>Farbe:</span>
                <span className="filter-dropdown__color" title={selectedEarmark.color || ''} style={{ background: selectedEarmark.color || undefined }} />
              </div>
            )}
          </div>
          <label className="filter-dropdown__checkbox">
            <input type="checkbox" checked={onlyWithout} onChange={(e) => setOnlyWithout(e.target.checked)} />
            <span>Nur Buchungen ohne Zweckbindung</span>
          </label>
        </>
      )}

      {mode === 'BUDGET' && (
        <>
          <div className="filter-dropdown__field filter-dropdown__field--mt">
            <label className="filter-dropdown__label">Budget</label>
            <select className="input" value={budgetId as any} onChange={(e) => setBudgetId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— bitte wählen —</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <label className="filter-dropdown__checkbox">
            <input type="checkbox" checked={onlyWithout} onChange={(e) => setOnlyWithout(e.target.checked)} />
            <span>Nur Buchungen ohne Budget</span>
          </label>
        </>
      )}

      {mode === 'TAGS' && (
        <>
          <div className="filter-dropdown__field filter-dropdown__field--mt">
            <label className="filter-dropdown__label">Tags hinzufügen</label>
            <input
              className="input"
              placeholder="Tags, kommasepariert …"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  e.preventDefault()
                  addTag(tagInput.trim())
                  setTagInput('')
                }
              }}
            />
          </div>

          {(selectedTags.length > 0 || tagDefs.length > 0) && (
            <div className="filter-dropdown__chips">
              {selectedTags.map((t) => {
                const def = tagDefs.find((td) => td.name.toLowerCase() === t.toLowerCase())
                return (
                  <span key={t} className="chip" style={{ background: def?.color || undefined, color: def?.color ? '#fff' : undefined }}>
                    {t}
                    <button className="chip-x" type="button" onClick={() => removeTag(t)} aria-label={`Tag ${t} entfernen`}>
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          {tagDefs.length > 0 && (
            <div className="filter-dropdown__tag-pills">
              {tagDefs.map((t) => (
                <button type="button" key={t.id} className="btn" onClick={() => addTag(t.name)} style={{ background: t.color || 'var(--muted)', color: '#fff', border: 'none' }}>
                  {t.name}
                </button>
              ))}
            </div>
          )}

          <div className="filter-dropdown__hint">Tipp: Mit Enter hinzufügen.</div>
        </>
      )}

      <div className="filter-dropdown__info">
        {loadingCount ? 'Lade …' : affectedCount !== null ? `${affectedCount} Buchung(en) betroffen` : '—'}
      </div>

      {!confirm ? (
        <div className="filter-dropdown__actions filter-dropdown__actions--end">
          <button
            className="btn primary"
            type="button"
            disabled={busy || loadingCount || affectedCount === 0}
            onClick={() => {
              const err = validate()
              if (err) {
                notify('error', err)
                return
              }
              setConfirm(true)
            }}
          >
            Übernehmen…
          </button>
        </div>
      ) : (
        <div className="filter-dropdown__confirm">
          <div className="filter-dropdown__confirm-text">
            {affectedCount != null ? `Wirklich ${affectedCount} Buchung(en) aktualisieren?` : 'Wirklich aktualisieren?'}
          </div>
          <div className="filter-dropdown__actions filter-dropdown__actions--end">
            <button className="btn" type="button" onClick={() => setConfirm(false)} disabled={busy}>
              Abbrechen
            </button>
            <button className="btn primary" type="button" onClick={run} disabled={busy || affectedCount === 0}>
              Ja
            </button>
          </div>
        </div>
      )}
    </FilterDropdown>
  )
}
