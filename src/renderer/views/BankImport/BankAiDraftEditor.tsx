import React, { useState } from 'react'
import type { BankBookingCandidate } from '../../../../shared/bankAiBatch'
import type { ClassificationValue } from '../../../../shared/classification'
import BookingOptionalArea from '../../components/booking/BookingOptionalArea'
import SelectDropdown from '../../components/common/SelectDropdown'
import TagsEditor from '../../components/TagsEditor'

export type BankDraftOption = { id: number; name: string }
export type BankDraftTag = BankDraftOption & { color?: string | null }
type Section = 'budgets' | 'earmarks' | 'tags' | 'note'
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export default function BankAiDraftEditor({ candidate, editable, commentsEnabled, classifications, classificationLabel, general, budgets, bindings, tagDefs, onChange }: {
  candidate: BankBookingCandidate
  editable: boolean
  commentsEnabled: boolean
  classifications: ClassificationValue[]
  classificationLabel: string
  general: boolean
  budgets: BankDraftOption[]
  bindings: BankDraftOption[]
  tagDefs: BankDraftTag[]
  onChange: (update: Partial<BankBookingCandidate>) => void
}) {
  const [visible, setVisible] = useState<Set<Section>>(() => new Set(
    (['budgets', 'earmarks', 'tags', 'note'] as const).filter(key => candidate[key]?.length)
  ))
  const selectedClassification = classifications.find(value => candidate.primaryClassificationValueId
    ? value.id === candidate.primaryClassificationValueId : !general && value.stableKey === candidate.sphere)
  const addAllocation = (kind: 'budgets' | 'earmarks') => {
    const values = candidate[kind] || []
    const remaining = Math.max(0, Number((candidate.grossAmount - values.reduce((sum, item) => sum + item.amount, 0)).toFixed(2)))
    onChange({ [kind]: [...values, { id: 0, amount: remaining }] })
  }
  const toggle = (key: Section) => {
    if (!visible.has(key) && (key === 'budgets' || key === 'earmarks') && !candidate[key]?.length) addAllocation(key)
    setVisible(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }
  const removeSection = (key: Section) => {
    onChange(key === 'note' ? { note: '' } : { [key]: [] })
    setVisible(previous => { const next = new Set(previous); next.delete(key); return next })
  }

  return <section className={`bank-ai-draft-editor bank-ai-draft-editor--${candidate.type.toLowerCase()}`} aria-label={editable ? 'Buchungsentwurf bearbeiten' : 'Buchungsdaten'}>
    <header className="bank-ai-draft-heading">
      <div><h3>{editable ? 'Buchungsentwurf bearbeiten' : 'Buchungsdaten'}</h3><p>{editable ? 'Änderungen werden vor der Übernahme geprüft.' : 'Daten des vorgeschlagenen Vorgangs.'}</p></div>
      <span className="bank-ai-draft-amount"><small>{candidate.type === 'IN' ? 'Einnahme' : 'Ausgabe'}</small><strong>{euro.format(candidate.grossAmount)}</strong></span>
    </header>
    <fieldset disabled={!editable} className="bank-ai-draft-form">
      <div className="bank-ai-draft-core">
        <label className="compact-booking-field"><span>Buchungsdatum</span><input className="input" type="date" value={candidate.date} onChange={event => onChange({ date: event.target.value })} /></label>
        <label className="compact-booking-field"><span>{classificationLabel}</span><select className="input" aria-label={classificationLabel} value={selectedClassification?.id || ''} onChange={event => {
          const value = classifications.find(item => item.id === Number(event.target.value))
          if (value) onChange({ primaryClassificationValueId: value.id, sphere: general ? candidate.sphere : value.stableKey })
        }}><option value="" disabled>Bitte auswählen</option>{classifications.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
        <label className="compact-booking-field bank-ai-draft-description"><span>Buchungstext</span><input className="input" value={candidate.description} onChange={event => onChange({ description: event.target.value })} /></label>
        <label className="compact-booking-field"><span>Gegenpartei</span><input className="input" value={candidate.counterparty || ''} onChange={event => onChange({ counterparty: event.target.value })} /></label>
        <label className="compact-booking-field"><span>Umsatzsteuer (%)</span><input className="input" type="number" min="0" max="100" step="0.01" value={candidate.vatRate ?? 0} onChange={event => onChange({ vatRate: Number(event.target.value) })} /></label>
      </div>
      <BookingOptionalArea actions={[
        { key: 'budgets', label: 'Budget', count: candidate.budgets?.length, active: visible.has('budgets'), disabled: !editable || (!budgets.length && !candidate.budgets?.length) },
        { key: 'earmarks', label: 'Zweckbindung', count: candidate.earmarks?.length, active: visible.has('earmarks'), disabled: !editable || (!bindings.length && !candidate.earmarks?.length) },
        { key: 'tags', label: 'Tag', count: candidate.tags?.length, active: visible.has('tags'), disabled: !editable },
        ...(commentsEnabled ? [{ key: 'note', label: 'Kommentar', active: visible.has('note'), disabled: !editable }] : [])
      ]} onToggle={key => toggle(key as Section)}>
        {(['budgets', 'earmarks'] as const).map(kind => {
          if (!visible.has(kind)) return null
          const label = kind === 'budgets' ? 'Budget' : 'Zweckbindung'
          const options = kind === 'budgets' ? budgets : bindings
          const values = candidate[kind] || []
          const total = values.reduce((sum, item) => sum + item.amount, 0)
          const incomplete = values.some(item => !item.id || !Number.isFinite(item.amount) || item.amount <= 0)
          return <div key={kind} className="compact-booking-optional-section" aria-label={`${label}-Zuordnungen`}>
            <div className="compact-booking-section-title"><strong>{label}</strong><button type="button" disabled={!editable} onClick={() => removeSection(kind)} aria-label={`${label}-Feld entfernen`}>×</button></div>
            {values.map((allocation, index) => <div className="compact-booking-assignment-row" key={index}>
              <SelectDropdown ariaLabel={`${label} ${index + 1}`} placeholder={`${label} wählen`} disabled={!editable} invalid={!allocation.id}
                value={allocation.id ? String(allocation.id) : ''}
                options={[
                  ...(!options.some(option => option.id === allocation.id) && allocation.id ? [{ value: String(allocation.id), label: `#${allocation.id}` }] : []),
                  ...options.map(option => ({ value: String(option.id), label: option.name, disabled: values.some((value, i) => i !== index && value.id === option.id) }))
                ]}
                onChange={value => onChange({ [kind]: values.map((item, i) => i === index ? { ...item, id: Number(value) } : item) })} />
              <span className="adorn-wrap"><input className="input" aria-label={`${label}betrag ${index + 1}`} type="number" min="0.01" step="0.01" value={allocation.amount || ''} onChange={event => onChange({ [kind]: values.map((item, i) => i === index ? { ...item, amount: Number(event.target.value) } : item) })} /><span className="adorn-suffix">€</span></span>
              <button type="button" className="compact-booking-remove-row" aria-label={`${label} ${index + 1} entfernen`} onClick={() => onChange({ [kind]: values.filter((_, i) => i !== index) })}>×</button>
            </div>)}
            <button type="button" className="compact-booking-add-row" onClick={() => addAllocation(kind)} disabled={!editable || incomplete || !options.some(option => !values.some(value => value.id === option.id)) || total >= candidate.grossAmount}>+ {label}zeile</button>
            {incomplete && <span className="compact-booking-error">Bitte {label} und einen gültigen Betrag in jeder Zeile ergänzen.</span>}
            {total > candidate.grossAmount + 0.001 && <span className="compact-booking-error">Die Zuordnungssumme übersteigt den Buchungsbetrag.</span>}
          </div>
        })}
        {visible.has('tags') && <div className="compact-booking-optional-section">
          <div className="compact-booking-section-title"><strong>Tags</strong><button type="button" disabled={!editable} onClick={() => removeSection('tags')} aria-label="Tag-Feld entfernen">×</button></div>
          <TagsEditor value={candidate.tags || []} onChange={tags => onChange({ tags })} tagDefs={tagDefs} disabled={!editable} />
        </div>}
        {commentsEnabled && visible.has('note') && <div className="compact-booking-optional-section">
          <div className="compact-booking-section-title"><strong>Kommentar</strong><button type="button" disabled={!editable} onClick={() => removeSection('note')} aria-label="Kommentar-Feld entfernen">×</button></div>
          <textarea className="input" aria-label="Kommentar" rows={3} value={candidate.note || ''} onChange={event => onChange({ note: event.target.value })} />
        </div>}
      </BookingOptionalArea>
    </fieldset>
  </section>
}
