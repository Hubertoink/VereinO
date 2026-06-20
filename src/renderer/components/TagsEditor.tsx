import React, { useMemo, useState } from 'react'

// Local contrast text helper to ensure readable tag chips
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

export default function TagsEditor({ label, labelAccessory, value, onChange, tagDefs, className, inputRef }: { label?: string; labelAccessory?: React.ReactNode; value: string[]; onChange: (v: string[]) => void; tagDefs: Array<{ id: number; name: string; color?: string | null }>; className?: string; inputRef?: React.Ref<HTMLInputElement> }) {
  const [input, setInput] = useState('')
  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase()
    const chosen = new Set((value || []).map(v => v.toLowerCase()))
    return (tagDefs || [])
      .filter(t => !chosen.has((t.name || '').toLowerCase()))
      .filter(t => !q || t.name.toLowerCase().includes(q))
      .slice(0, 32)
  }, [input, tagDefs, value])
  function addTag(name: string) {
    const n = (name || '').trim()
    if (!n) return
    if (!(value || []).includes(n)) onChange([...(value || []), n])
    setInput('')
  }
  function removeTag(name: string) { onChange((value || []).filter(v => v !== name)) }
  const colorFor = (name: string) => (tagDefs || []).find(t => (t.name || '').toLowerCase() === (name || '').toLowerCase())?.color
  return (
    <div className={`field field-full-width ${className || ''}`.trim()}>
      {label && <label>{label}{labelAccessory}</label>}
      <div className="input tags-editor-input">
        {(value || []).map(t => {
          const bg = colorFor(t) || undefined
          const fg = contrastText(bg)
          return (
            <span key={t} className="chip" style={{ background: bg, color: bg ? fg : undefined }}>
              {t}
              <button className="chip-x" onClick={() => removeTag(t)} aria-label={`Tag ${t} entfernen`} type="button">×</button>
            </span>
          )
        })}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input) }
            if (e.key === 'Backspace' && !input && (value || []).length) { removeTag((value || [])[value.length - 1]) }
          }}
          placeholder={(value || []).length ? '' : 'Tag hinzufügen…'}
          className="tags-editor-text-input"
          aria-label="Neuen Tag hinzufügen"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="card tags-suggestions" aria-label="Verfügbare Tags">
          {suggestions.map(s => {
            const bg = s.color || undefined
            const fg = contrastText(bg)
            return (
              <button
                key={s.id}
                type="button"
                className={`btn tag-suggestion-btn${bg ? ' tag-has-color' : ''}`}
                style={bg ? ({ '--tag-bg': bg, '--tag-fg': fg } as React.CSSProperties) : undefined}
                onClick={() => addTag(s.name)}
                aria-label={`Tag ${s.name} hinzufügen`}
              >{s.name}</button>
            )
          })}
        </div>
      )}
    </div>
  )
}
