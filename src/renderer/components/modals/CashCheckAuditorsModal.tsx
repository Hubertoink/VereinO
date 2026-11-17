import MasterDataDialog, { FieldLabel } from '../common/MasterDataDialog'
import { IconUsers } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react';

export default function CashCheckAuditorsModal(props: {
  open: boolean
  initial1?: string | null
  initial2?: string | null
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
  onClose: () => void
  onConfirm: (v: { inspector1Name: string; inspector2Name: string }) => void
}) {
  const { open, initial1, initial2, notify, onClose, onConfirm } = props
  const [inspector1, setInspector1] = useState('')
  const [inspector2, setInspector2] = useState('')

  const canSubmit = useMemo(() => {
    return !!inspector1.trim() || !!inspector2.trim()
  }, [inspector1, inspector2])

  useEffect(() => {
    if (!open) return
    setInspector1((initial1 || '').trim())
    setInspector2((initial2 || '').trim())
  }, [open, initial1, initial2])

  if (!open) return null

  return <MasterDataDialog compact title="Kassenprüfer eintragen" subtitle="Für den PDF-Kassenprüferbericht wird mindestens ein Kassenprüfer benötigt." icon={<IconUsers size={22} />} onClose={onClose} canSave={canSubmit} footerHint="Mindestens einen Namen eintragen." onSave={() => {
    if (!canSubmit) { notify('error', 'Bitte mindestens einen Kassenprüfer angeben.'); return }
    onConfirm({ inspector1Name: inspector1.trim(), inspector2Name: inspector2.trim() })
  }}>
    <div className="dialog-form-grid">
      <div className="field"><FieldLabel htmlFor="cash-inspector-first">1. Kassenprüfer</FieldLabel><input id="cash-inspector-first" className="input" value={inspector1} onChange={e => setInspector1(e.target.value)} placeholder="Name" autoFocus /></div>
      <div className="field"><FieldLabel htmlFor="cash-inspector-second">2. Kassenprüfer</FieldLabel><input id="cash-inspector-second" className="input" value={inspector2} onChange={e => setInspector2(e.target.value)} placeholder="Name (optional)" /></div>
    </div>
  </MasterDataDialog>
}
