import React, { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconInfoCircle } from '@tabler/icons-react'
import ModalHeader from '../ModalHeader'

export function FieldLabel({ htmlFor, icon, required, children }: {
  htmlFor?: string; icon?: ReactNode; required?: boolean; children: ReactNode
}) {
  return <label htmlFor={htmlFor} className="dialog-field-label">
    {icon && <span aria-hidden="true">{icon}</span>}{children}
    {required && <span className="req-asterisk" aria-hidden="true">*</span>}
  </label>
}

export default function MasterDataDialog({ title, subtitle, icon, children, onClose, onSave, busy = false, canSave = true, compact = false, footerHint, saveLabel = 'Speichern' }: {
  title: string; subtitle?: string; icon?: ReactNode; children: ReactNode
  onClose: () => void; onSave: () => void | Promise<void>; busy?: boolean; canSave?: boolean
  compact?: boolean; footerHint?: ReactNode; saveLabel?: string
}) {
  const titleId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const previousFocus = useRef(document.activeElement as HTMLElement | null)
  useEffect(() => {
    const previous = previousFocus.current
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId}
      onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget && !busy) onClose() }}
      onKeyDown={event => {
        event.stopPropagation()
        if (!formRef.current?.contains(event.target as Node)) return
        if (event.key === 'Escape') { event.preventDefault(); if (!busy) onClose() }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault(); if (canSave && !busy) formRef.current.requestSubmit()
        }
        if (event.key === 'Tab') {
          const controls = Array.from(formRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(el => el.getClientRects().length > 0)
          const first = controls[0], last = controls[controls.length - 1]
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
      }}>
      <form ref={formRef} className={`modal master-data-dialog${compact ? ' master-data-dialog--compact' : ''}`}
        onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (canSave && !busy) void onSave() }}>
        <ModalHeader title={title} titleId={titleId} subtitle={subtitle} icon={icon} onClose={onClose} closeDisabled={busy} closeOnEscape={false} />
        <div className="master-data-dialog__body">{children}</div>
        <footer className="master-data-dialog__footer">
          <div className="master-data-dialog__hint"><IconInfoCircle size={15} aria-hidden="true" />{footerHint || <span>Alle Felder mit <span className="req-asterisk">*</span> sind Pflichtfelder.</span>}</div>
          <div className="master-data-dialog__actions">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>Abbrechen</button>
            <button type="submit" className="btn primary" disabled={!canSave || busy}>{busy ? 'Speichert…' : saveLabel}</button>
          </div>
        </footer>
      </form>
    </div>, document.body
  )
}
