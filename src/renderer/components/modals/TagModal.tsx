import React, { useEffect, useId, useState } from 'react'
import { IconTag } from '@tabler/icons-react'
import MasterDataDialog, { FieldLabel } from '../common/MasterDataDialog'
import ColorField from '../common/ColorField'

export type TagValue = { id?: number; name: string; color?: string | null }

export default function TagModal({ value, onClose, onSaved, notify }: { value: TagValue; onClose: () => void; onSaved: () => void; notify?: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void }) {
  const [v, setV] = useState(value)
  const [busy, setBusy] = useState(false)
  const nameId = useId()
  useEffect(() => { setV(value) }, [value])
  async function save() {
    if (!v.name.trim() || busy) return
    setBusy(true)
    try {
      await window.api?.tags?.upsert?.({ ...v, name: v.name.trim() })
      window.dispatchEvent(new Event('tags-changed'))
      onSaved()
    } catch (error: any) {
      const message = error?.message || String(error)
      if (notify) notify('error', message)
      else alert(message)
    } finally { setBusy(false) }
  }
  return <MasterDataDialog compact title={v.id ? 'Tag bearbeiten' : 'Neuer Tag'} subtitle="Kennzeichne Buchungen mit einem passenden Schlagwort." icon={<IconTag size={22} />} onClose={onClose} onSave={save} busy={busy} canSave={!!v.name.trim()}>
    <div className="field"><FieldLabel htmlFor={nameId} icon={<IconTag size={15} />} required>Name</FieldLabel><input id={nameId} className="input" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} placeholder="z. B. Sommerfest oder Getränke" required autoFocus /></div>
    <div className="dialog-form-section"><ColorField value={v.color} onChange={color => setV({ ...v, color })} /></div>
  </MasterDataDialog>
}
