import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconSparkles } from '@tabler/icons-react'
import ModalHeader from '../../components/ModalHeader'

export default function BankAiRecheckModal({ count, page, onClose, onConfirm }: {
  count: number; page: number; onClose: () => void; onConfirm: () => void
}) {
  const cancel = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    cancel.current?.focus()
    return () => previous?.focus()
  }, [])
  return createPortal(<div className="modal-overlay bank-import-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal bank-ai-recheck-modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="bank-ai-recheck-title" aria-describedby="bank-ai-recheck-description"
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        const buttons = Array.from(dialog.current?.querySelectorAll('button') || [])
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}>
      <ModalHeader title="Erneut mit KI prüfen?" titleId="bank-ai-recheck-title" icon={<IconSparkles size={22} />} onClose={onClose} />
      <div id="bank-ai-recheck-description">
        <p>Alle {count} offenen Bankbelege im aktuellen Filter auf Seite {page} wurden bereits mit KI geprüft.</p>
        <p>Eine erneute Prüfung verbraucht zusätzliche KI-Tokens und ersetzt die bisherigen Vorschläge. Möchtest du sie trotzdem starten?</p>
      </div>
      <footer className="bank-modal-footer"><button ref={cancel} className="btn" onClick={onClose}>Abbrechen</button><button className="btn primary" onClick={onConfirm}>Erneut prüfen</button></footer>
    </div>
  </div>, document.body)
}
