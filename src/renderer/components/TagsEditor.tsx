import React, { useMemo, useState } from 'react'
import { getContrastTextColor, resolveTagDisplayColor } from '../utils/tagColors'

export default function TagsEditor({ label, labelAccessory, value, onChange, tagDefs, className, inputRef }: { label?: string; labelAccessory?: React.ReactNode; value: string[]; onChange: (v: string[]) => void; tagDefs: Array<{ id: number; name: string; color?: string | null }>; className?: string; inputRef?: React.Ref<HTMLInputElement> }) {
  const [input, setInput] = useState('')
  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase()
    return (tagDefs || [])
      .filter(t => !q || t.name.toLowerCase().includes(q))
      .slice(0, 32)
  }, [input, tagDefs])
  function addTag(name: string) {
    const n = (name || '').trim()
    if (!n) return
    if (!(value || []).includes(n)) onChange([...(value || []), n])
    setInput('')
  }
  function removeTag(name: string) { onChange((value || []).filter(v => v !== name)) }
  const colorFor = (name: string) => resolveTagDisplayColor(name, tagDefs)
  return (
    <div className={`field field-full-width ${className || ''}`.trim()}>
      {label && <label>{label}{labelAccessory}</label>}
      <div className="input tags-editor-input">
        {(value || []).map(t => {
          const bg = colorFor(t) || undefined
          const fg = getContrastTextColor(bg)
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
            const bg = colorFor(s.name) || undefined
            const fg = getContrastTextColor(bg)
            const selected = (value || []).some(v => v.toLowerCase() === (s.name || '').toLowerCase())
            return (
              <button
                key={s.id}
                type="button"
                className={`btn tag-suggestion-btn${bg ? ' tag-has-color' : ''}${selected ? ' tag-suggestion-btn--selected' : ''}`}
                style={bg ? ({ '--tag-bg': bg, '--tag-fg': fg } as React.CSSProperties) : undefined}
                onClick={() => selected ? removeTag(s.name) : addTag(s.name)}
                aria-pressed={selected}
                aria-label={selected ? `Tag ${s.name} entfernen` : `Tag ${s.name} hinzufügen`}
              >{selected ? '✓ ' : ''}{s.name}</button>
            )
          })}
        </div>
      )}
    </div>
  )
}
