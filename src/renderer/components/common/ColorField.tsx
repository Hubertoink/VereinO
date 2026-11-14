import React, { useId, useState } from 'react'
import { IconPalette, IconX } from '@tabler/icons-react'
import MasterDataDialog from './MasterDataDialog'
import RandomColorButton from './RandomColorButton'

const PALETTE = ['#7C4DFF', '#2962FF', '#00B8D4', '#00C853', '#AEEA00', '#FFD600', '#FF9100', '#FF3D00', '#F50057', '#9C27B0']

export default function ColorField({ value, onChange }: { value?: string | null; onChange: (color: string | null) => void }) {
  const id = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('#1976D2')
  const [error, setError] = useState('')
  const custom = !!value && !PALETTE.includes(value.toUpperCase())
  return <fieldset className="dialog-color-field">
    <legend className="dialog-field-label"><IconPalette size={15} aria-hidden="true" /> Farbe</legend>
    <div className="dialog-color-options">
      {PALETTE.map(color => <button type="button" key={color} className="dialog-color-swatch" style={{ background: color }} aria-label={`Farbe ${color}`} title={color} aria-pressed={value?.toUpperCase() === color} onClick={() => onChange(color)} />)}
      <RandomColorButton size={28} color={value} onChange={onChange} />
      <button type="button" className="btn dialog-color-custom" aria-pressed={custom} onClick={() => { setDraft(value || '#1976D2'); setError(''); setEditing(true) }}>
        {custom && <span className="dialog-color-current" style={{ background: value }} title={value} aria-label={`Ausgewählte Farbe ${value}`} />}Eigene…
      </button>
      <button type="button" className="btn dialog-color-clear" aria-label="Keine Farbe" title="Keine Farbe" aria-pressed={!value} onClick={() => onChange(null)}><IconX size={15} aria-hidden="true" /></button>
    </div>
    {editing && <MasterDataDialog compact title="Eigene Farbe wählen" subtitle="Wähle einen Farbton oder gib einen HEX-Wert ein." icon={<IconPalette size={21} />} onClose={() => setEditing(false)} saveLabel="Übernehmen" footerHint="HEX-Format: #RRGGBB" onSave={() => {
      if (!/^#[0-9a-f]{6}$/i.test(draft.trim())) { setError('Bitte einen gültigen HEX-Wert eingeben, z. B. #1976D2.'); return }
      onChange(draft.trim()); setEditing(false)
    }}>
      <div className="dialog-form-grid">
        <div className="field"><label htmlFor={`${id}-picker`}>Farbton</label><input id={`${id}-picker`} className="dialog-color-native" type="color" value={/^#[0-9a-f]{6}$/i.test(draft) ? draft : '#1976D2'} onChange={e => { setDraft(e.target.value); setError('') }} /></div>
        <div className="field"><label htmlFor={`${id}-hex`}>HEX</label><input id={`${id}-hex`} className="input" value={draft} autoFocus aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={e => { setDraft(e.target.value); setError('') }} /></div>
      </div>
      {error && <div id={`${id}-error`} className="helper error-text" role="alert">{error}</div>}
    </MasterDataDialog>}
  </fieldset>
}
