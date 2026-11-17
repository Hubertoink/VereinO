import ModalHeader from '../ModalHeader'
import ColorField from '../common/ColorField'
import { useEffect, useRef, useState } from 'react';
import { IconTrash, IconChartBar } from '@tabler/icons-react'
import AppIcon from '../common/AppIcon'
import DatePickerButton from '../common/DatePickerButton'
import BookingPopupFrame from './BookingPopupFrame'

export type BudgetModalValue = {
  id?: number
  year: number
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  primaryClassificationValueId?: number | null
  amountPlanned: number
  name?: string | null
  categoryName?: string | null
  projectName?: string | null
  startDate?: string | null
  endDate?: string | null
  color?: string | null
  isArchived?: number
  categoryId?: number | null
  projectId?: number | null
  earmarkId?: number | null
  enforceTimeRange?: number
}

export default function BudgetModal({ value, onClose, onSaved }: { value: BudgetModalValue; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(value)
  const [nameError, setNameError] = useState<string>('')
  const [requiredTouched, setRequiredTouched] = useState(false)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const startDateRef = useRef<HTMLInputElement | null>(null)
  const endDateRef = useRef<HTMLInputElement | null>(null)
  const [askDelete, setAskDelete] = useState(false)
  useEffect(() => { 
    setV(value); setNameError(''); setRequiredTouched(false); setAskDelete(false)
  }, [value])

  async function save() {
    setRequiredTouched(true)
    const name = (v.name || '').trim()
    if (!name) { setNameError('Bitte Namen angeben'); nameRef.current?.focus(); return }
    await (window as any).api?.budgets.upsert?.({
      id: v.id as any,
      year: v.year,
      sphere: v.sphere,
      primaryClassificationValueId: v.primaryClassificationValueId ?? null,
      amountPlanned: v.amountPlanned,
      name: name || null,
      categoryName: (v.categoryName || '').trim() || null,
      projectName: (v.projectName || '').trim() || null,
      startDate: v.startDate || null,
      endDate: v.endDate || null,
      color: v.color || null,
      isArchived: !!v.isArchived,
      categoryId: v.categoryId || null,
      projectId: v.projectId || null,
      earmarkId: v.earmarkId || null,
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
      title={v.id ? 'Budget bearbeiten' : 'Budget anlegen'}
      subtitle="Plane einen Betrag für ein Projekt oder einen Zeitraum."
      icon={<IconChartBar size={22} />}
      onClose={onClose}
      variant="compact"
      anchorAlign="end"
      className="master-data-popup budget-floating-modal"
    >
      <div className="budget-modal-content">
        <div className="row">
          <div className="field">
            <label htmlFor="budget-year">Jahr <span className="req-asterisk" aria-hidden="true">*</span></label>
            <input id="budget-year" className="input" type="number" value={v.year} onChange={(e) => setV({ ...v, year: Number(e.target.value) })} placeholder="2025" />
          </div>
          <div className="field">
            <label htmlFor="budget-amount">Budget (€) <span className="req-asterisk" aria-hidden="true">*</span></label>
            <input id="budget-amount" className="input" type="number" step="0.01" value={v.amountPlanned} onChange={(e) => setV({ ...v, amountPlanned: Number(e.target.value) })} placeholder="0.00" />
          </div>
          <div className="field">
            <label htmlFor="budget-name">Name <span className="req-asterisk" aria-hidden="true">*</span></label>
            <input
              id="budget-name"
              ref={nameRef}
              className={`input ${nameError ? 'input-error' : ''}`}
              value={v.name ?? ''}
              onChange={(e) => { const nv = e.target.value; setV({ ...v, name: nv }); if (nameError && nv.trim()) setNameError('') }}
              placeholder="z. B. Jugendfreizeit"
              style={requiredTouched && !(v.name || '').trim() ? { borderColor: 'var(--danger)' } : undefined}
            />
            {requiredTouched && !(v.name || '').trim() && (
              <div className="helper" style={{ color: 'var(--danger)' }}>Bitte Namen angeben</div>
            )}
          </div>
          <div className="field">
            <label htmlFor="budget-category">Kategorie (optional)</label>
            <input id="budget-category" className="input" value={v.categoryName ?? ''} onChange={(e) => setV({ ...v, categoryName: e.target.value || null })} placeholder="z. B. Material" />
          </div>
          <div className="field">
            <label htmlFor="budget-project">Projekt</label>
            <input id="budget-project" className="input" value={v.projectName ?? ''} onChange={(e) => setV({ ...v, projectName: e.target.value || null })} placeholder="z. B. Projekt X" />
          </div>
          <div className="date-range-container">
            <div className="field">
              <label htmlFor="budget-start-date">Von</label>
              <span className="booking-date-input-wrap">
                <input id="budget-start-date" ref={startDateRef} className="input" type="date" value={v.startDate ?? ''} onChange={(e) => setV({ ...v, startDate: e.target.value || null })} />
                <DatePickerButton inputRef={startDateRef} ariaLabel="Kalender zur Auswahl des Budgetbeginns öffnen" />
              </span>
            </div>
            <div className="field">
              <label htmlFor="budget-end-date">Bis</label>
              <span className="booking-date-input-wrap">
                <input id="budget-end-date" ref={endDateRef} className="input" type="date" value={v.endDate ?? ''} onChange={(e) => setV({ ...v, endDate: e.target.value || null })} />
                <DatePickerButton inputRef={endDateRef} ariaLabel="Kalender zur Auswahl des Budgetendes öffnen" />
              </span>
            </div>
          </div>
          {(v.startDate || v.endDate) && (
            <div className="field field-full-width">
              <label htmlFor="budget-enforce-range" className="budget-enforce-range-label">
                <input 
                  id="budget-enforce-range" 
                  type="checkbox" 
                  checked={!!v.enforceTimeRange} 
                  onChange={(e) => setV({ ...v, enforceTimeRange: e.target.checked ? 1 : 0 })} 
                  className="budget-enforce-range-checkbox"
                />
                  <span>Zeitraum verbindlich machen</span>
              </label>
                <div className="helper">Wenn aktiv: Buchungen dürfen dieses Budget nur im Zeitraum nutzen. Ohne Von/Bis gilt automatisch das Budget-Jahr (01.01.–31.12.).</div>
            </div>
          )}
          <div className="field field-full-width"><ColorField value={v.color} onChange={color => setV({ ...v, color })} /></div>
        </div>
        <div className="modal-footer">
          <div className="helper">Ctrl+S = Speichern · Esc = Abbrechen</div>
          <div className="budget-actions-row">
            {!!v.id && (
              <button className="btn danger modal-delete-btn btn-with-icon" onClick={() => setAskDelete(true)}><AppIcon icon={IconTrash} size="control" />Löschen</button>
            )}
            <button className="btn" onClick={onClose}>Abbrechen</button>
            <button className="btn primary" onClick={save}>Speichern</button>
          </div>
        </div>
      {askDelete && v.id && (
        <div className="modal-overlay" onClick={() => setAskDelete(false)} role="dialog" aria-modal="true">
          <div className="modal modal-inset-header delete-modal" onClick={(e) => e.stopPropagation()}>
            <ModalHeader
              className="delete-modal-header"
              title="Budget löschen"
              onClose={() => setAskDelete(false)}
              closeLabel="Schließen"
              closeOnEscape={false}
            />
            <div>Möchtest du das Budget <strong>{(v.name || '').trim() || ('#' + v.id)}</strong> wirklich löschen?</div>
            <div className="helper">Dieser Vorgang kann nicht rückgängig gemacht werden.</div>
            <div className="delete-modal-actions">
              <button className="btn" onClick={() => setAskDelete(false)}>Abbrechen</button>
              <button className="btn danger" onClick={async () => { await (window as any).api?.budgets.delete?.({ id: v.id as number }); setAskDelete(false); onSaved(); onClose() }}>Ja, löschen</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </BookingPopupFrame>
  )
}
