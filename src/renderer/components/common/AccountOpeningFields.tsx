import { useId } from 'react'
import type { OpeningDraft } from '../../utils/accountOpening'

export default function AccountOpeningFields({ value, onChange, readOnly = false }: { readOnly?: boolean; value: OpeningDraft; onChange: (value: OpeningDraft) => void }) {
  const id = useId()
  return <div className="dialog-form-grid">
    <div className="field"><label htmlFor={id}>Anfangsbestand (€)</label><input id={id} className="input" readOnly={readOnly} inputMode="decimal" placeholder="0,00" value={value.amount} onChange={e => onChange({ ...value, amount: e.target.value })} /></div>
    <div className="field"><label htmlFor={id + '-date'}>Stichtag</label><input id={id + '-date'} className="input" readOnly={readOnly} type="date" value={value.date} onChange={e => onChange({ ...value, date: e.target.value })} /></div>
  </div>
}
