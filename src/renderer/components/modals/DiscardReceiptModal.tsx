import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconFileDescription } from '@tabler/icons-react'

export default function DiscardReceiptModal({
  fileName,
  onCancel,
  onDiscard
}: {
  fileName?: string
  onCancel: () => void
  onDiscard: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const discardRef = useRef<HTMLButtonElement>(null)
  const cancelCallback = useRef(onCancel)
  cancelCallback.current = onCancel
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const scanner = document.querySelector<HTMLElement>('.local-invoice-scan')
    if (scanner) scanner.inert = true
    cancelRef.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        cancelCallback.current()
      } else if (event.key === 'Tab') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (document.activeElement === cancelRef.current) discardRef.current?.focus()
        else cancelRef.current?.focus()
      }
    }
    window.addEventListener('keydown', keydown, true)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      if (scanner) scanner.inert = false
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return createPortal(
    <div className="modal-overlay receipt-discard-overlay" onClick={onCancel}>
      <section
        className="modal receipt-discard-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="receipt-discard-title"
        aria-describedby="receipt-discard-description"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="receipt-discard-modal__header">
          <IconFileDescription size={26} aria-hidden="true" />
          <h2 id="receipt-discard-title">Belegerfassung schließen?</h2>
        </header>
        <p id="receipt-discard-description">
          {fileName ? (
            <>
              <strong>{fileName}</strong> wurde noch nicht gespeichert.
            </>
          ) : (
            'Dieser Beleg wurde noch nicht gespeichert.'
          )}{' '}
          Beim Verwerfen gehen deine Eingaben verloren.
        </p>
        <div className="receipt-discard-modal__actions">
          <button ref={cancelRef} type="button" className="btn" onClick={onCancel}>
            Weiter erfassen
          </button>
          <button ref={discardRef} type="button" className="btn danger" onClick={onDiscard}>
            Verwerfen
          </button>
        </div>
      </section>
    </div>,
    document.body
  )
}
