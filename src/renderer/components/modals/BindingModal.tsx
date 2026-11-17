import ModalHeader from '../ModalHeader'
import ColorField from '../common/ColorField'
import { useEffect, useRef, useState } from 'react';
import { IconTrash, IconBookmark } from '@tabler/icons-react'
import AppIcon from '../common/AppIcon'
import DatePickerButton from '../common/DatePickerButton'
import BookingPopupFrame from './BookingPopupFrame'

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
  enforceTimeRange?: number
}

export default function BindingModal({ value, onClose, onSaved }: { value: BindingModalValue; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(value)
  const [requiredTouched, setRequiredTouched] = useState(false)
  const [askDelete, setAskDelete] = useState(false)
  const startDateRef = useRef<HTMLInputElement | null>(null)
  const endDateRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => { setV(value); setRequiredTouched(false); setAskDelete(false) }, [value])

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
      budget: v.budget ?? null,
      enforceTimeRange: v.enforceTimeRange ? true : false
    })
    onSaved()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || document.querySelector('.master-data-dialog')) return
      if (askDelete) { if (e.key === 'Escape') { setAskDelete(false); e.preventDefault() }; return }
      if (e.key === 'Escape') { onClose(); e.preventDefault(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { save(); e.preventDefault(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [v, askDelete])

  return (
    <BookingPopupFrame
      title={v.id ? 'Zweckbindung bearbeiten' : 'Zweckbindung anlegen'}
      subtitle="Lege fest, wofür zweckgebundene Mittel verwendet werden dürfen."
      icon={<IconBookmark size={22} />}
      onClose={onClose}
      variant="compact"
      anchorAlign="end"
      className="master-data-popup binding-floating-modal"
    >
      <div className="binding-modal-content">
        <div className="row">
          <div className="field">
            <label htmlFor="binding-code">Code <span className="req-asterisk" aria-hidden="true">*</span></label>
            <input
              id="binding-code"
              className={`input ${requiredTouched && !v.code.trim() ? 'input-error' : ''}`}
              value={v.code}
              onChange={(e) => setV({ ...v, code: e.target.value })}
              placeholder="z.B. ZW01"
            />
            {requiredTouched && !v.code.trim() && (
              <div className="helper" style={{ color: 'var(--danger)' }}>Bitte Code angeben</div>
            )}
          </div>
          <div className="field">
            <label htmlFor="binding-name">Name <span className="req-asterisk" aria-hidden="true">*</span></label>
            <input
              id="binding-name"
              className={`input ${requiredTouched && !v.name.trim() ? 'input-error' : ''}`}
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
              placeholder="z.B. Sommerfest 2025"
            />
            {requiredTouched && !v.name.trim() && (
              <div className="helper" style={{ color: 'var(--danger)' }}>Bitte Namen angeben</div>
            )}
          </div>
          <div className="field field-full-width">
            <label htmlFor="binding-description">Beschreibung</label>
            <input id="binding-description" className="input" value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="Optional" />
          </div>
          <div className="date-range-container">
            <div className="field">
              <label htmlFor="binding-start-date">Von</label>
              <span className="booking-date-input-wrap">
                <input id="binding-start-date" ref={startDateRef} className="input" type="date" value={v.startDate ?? ''} onChange={(e) => setV({ ...v, startDate: e.target.value || null })} />
                <DatePickerButton inputRef={startDateRef} ariaLabel="Kalender zur Auswahl des Beginns öffnen" />
              </span>
            </div>
            <div className="field">
              <label htmlFor="binding-end-date">Bis</label>
              <span className="booking-date-input-wrap">
                <input id="binding-end-date" ref={endDateRef} className="input" type="date" value={v.endDate ?? ''} onChange={(e) => setV({ ...v, endDate: e.target.value || null })} />
                <DatePickerButton inputRef={endDateRef} ariaLabel="Kalender zur Auswahl des Endes öffnen" />
              </span>
            </div>
          </div>
          {(v.startDate || v.endDate) && (
            <div className="field field-full-width">
              <label htmlFor="binding-enforce-range" className="budget-enforce-range-label">
                <input 
                  id="binding-enforce-range" 
                  type="checkbox" 
                  checked={!!v.enforceTimeRange} 
                  onChange={(e) => setV({ ...v, enforceTimeRange: e.target.checked ? 1 : 0 })} 
                  className="budget-enforce-range-checkbox"
                />
                <span>Zeitraum verbindlich machen</span>
              </label>
              <div className="helper">Wenn aktiv: Buchungen dürfen diese Zweckbindung nur im Zeitraum Von/Bis nutzen.</div>
            </div>
          )}
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
          <div className="field field-full-width"><ColorField value={v.color} onChange={color => setV({ ...v, color })} /></div>
        </div>
        <div className="modal-footer">
          <div className="helper m-0">Ctrl+S = Speichern · Esc = Abbrechen</div>
          <div className="modal-actions">
            {!!v.id && (
              <button className="btn danger modal-delete-btn btn-with-icon" onClick={() => setAskDelete(true)}><AppIcon icon={IconTrash} size="control" />Löschen</button>
            )}
            <button className="btn" onClick={onClose}>Abbrechen</button>
            <button className="btn primary" onClick={() => save()}>Speichern</button>
          </div>
        </div>
      {askDelete && v.id && (
        <div className="modal-overlay" onClick={() => setAskDelete(false)} role="dialog" aria-modal="true">
          <div className="modal modal-inset-header delete-modal" onClick={(e) => e.stopPropagation()}>
            <ModalHeader
              className="delete-modal-header"
              title="Zweckbindung löschen"
              onClose={() => setAskDelete(false)}
              closeLabel="Schließen"
              closeOnEscape={false}
            />
            <div>Möchtest du die Zweckbindung <strong>{v.code}</strong> – {v.name} wirklich löschen?</div>
            <div className="helper">Hinweis: Die Zuordnung bestehender Buchungen bleibt erhalten; es wird nur die Zweckbindung entfernt.</div>
            <div className="delete-modal-actions">
              <button className="btn" onClick={() => setAskDelete(false)}>Abbrechen</button>
              <button className="btn danger" onClick={async () => { await (window as any).api?.bindings.delete?.({ id: v.id as number }); setAskDelete(false); onSaved(); onClose() }}>Ja, löschen</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </BookingPopupFrame>
  )
}
