import { useEffect, useId, useState } from 'react';
import { IconCategory, IconLetterCase, IconMoodSmile } from '@tabler/icons-react'
import MasterDataDialog, { FieldLabel } from '../common/MasterDataDialog'
import ColorField from '../common/ColorField'
import CategoryIcon from '../common/CategoryIcon'
import { CATEGORY_ICONS, categoryIconKey } from '../../utils/categoryIcons'


export type CategoryValue = { id?: number; name: string; color?: string | null; icon?: string | null }

export default function CategoryModal({ value, onClose, onSaved, notify }: {
  value: CategoryValue
  onClose: () => void
  onSaved: () => void
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
}) {
  const nameId = useId()
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const save = async () => {
    const name = draft.name.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      if (draft.id) await window.api.classifications.primary.update({ id: draft.id, name, color: draft.color || null, icon: draft.icon || null })
      else await window.api.classifications.primary.create({ name, color: draft.color || null, icon: draft.icon || null })
      onSaved()
    } catch (error: any) {
      notify('error', error?.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  return <MasterDataDialog compact title={draft.id ? 'Kategorie bearbeiten' : 'Neue Kategorie'} subtitle="Ordne Buchungen übersichtlich nach ihrem Zweck." icon={<IconCategory size={22} />} onClose={onClose} onSave={save} busy={busy} canSave={!!draft.name.trim()}>
    <div className="field"><FieldLabel htmlFor={nameId} icon={<IconLetterCase size={15} />} required>Name</FieldLabel><input id={nameId} className="input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="z. B. Material oder Mitgliedsbeiträge" required autoFocus /></div>
    <fieldset className="dialog-icon-field"><legend className="dialog-field-label"><IconMoodSmile size={15} aria-hidden="true" />Symbol</legend><div className="dialog-icon-options">
      <button type="button" className="btn" aria-pressed={!draft.icon} onClick={() => setDraft({ ...draft, icon: null })}>Kein Symbol</button>
      {CATEGORY_ICONS.map(({ key, label }) => <button key={key} type="button" className="btn" title={label} aria-label={`Symbol: ${label}`} aria-pressed={categoryIconKey(draft.icon) === key} onClick={() => setDraft({ ...draft, icon: key })}><CategoryIcon value={key} size={18} /></button>)}
    </div></fieldset>
    <div className="dialog-form-section"><ColorField value={draft.color} onChange={color => setDraft({ ...draft, color })} /></div>
  </MasterDataDialog>
}
