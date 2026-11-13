import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconAlertTriangle } from '@tabler/icons-react'
import ModalHeader from '../ModalHeader'

export type TagDeleteTarget = { id: number; name: string; usage?: number }

export default function TagDeleteModal({ tag, onClose, onConfirm }: {
  tag: TagDeleteTarget
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const titleId = useId()
  const descriptionId = useId()
  const modalRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const deletingRef = useRef(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])

  async function confirm() {
    if (deletingRef.current) return
    deletingRef.current = true
    setDeleting(true)
    try { await onConfirm() }
    finally { deletingRef.current = false; setDeleting(false) }
  }

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}
      onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget && !deleting) onClose() }}>
      <div ref={modalRef} className="modal compact-booking-flyout compact-booking-popup tag-delete-modal" onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const buttons = modalRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        if (!buttons?.length) { event.preventDefault(); return }
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }}>
        <ModalHeader title="Tag löschen" titleId={titleId} onClose={onClose} closeDisabled={deleting} />
        <div id={descriptionId} className="tag-delete-modal__body">
          <p>Möchtest du den Tag <strong>„{tag.name}“</strong> löschen?</p>
          <div className="tag-delete-modal__impact">
            <IconAlertTriangle size={20} aria-hidden="true" />
            <div>
              <strong>{tag.usage == null
                ? 'Verknüpfungen mit Buchungen werden entfernt'
                : tag.usage === 0 ? 'Keine Buchungen verknüpft'
                : `${tag.usage} ${tag.usage === 1 ? 'Buchung ist' : 'Buchungen sind'} mit diesem Tag verknüpft`}</strong>
              <p>{tag.usage === 0
                ? 'Der Tag wird aus der Tagverwaltung gelöscht.'
                : 'Der Tag wird aus der Tagverwaltung und aus allen damit verknüpften Buchungen entfernt.'}</p>
              <p>Die Buchungen selbst, ihre Beträge und alle anderen Tags bleiben erhalten.</p>
            </div>
          </div>
          <p className="helper">Das Löschen und das Entfernen der Verknüpfungen können nicht rückgängig gemacht werden.</p>
        </div>
        <footer className="tag-delete-modal__actions">
          <button ref={cancelRef} type="button" className="btn" disabled={deleting} onClick={onClose}>Abbrechen</button>
          <button type="button" className="btn danger" disabled={deleting} onClick={() => void confirm()}>{deleting ? 'Wird gelöscht…' : 'Tag löschen'}</button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
