import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconInfoCircle, IconX } from '@tabler/icons-react'
import AppIcon from '../common/AppIcon'

const EMPTY_WARNINGS: string[] = []

export default function InvoiceAnalysisInfo({ message, warning, warnings = EMPTY_WARNINGS, timings }: { message: string; warning: boolean; warnings?: string[]; timings?: string }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      if (!trigger.current || !panel.current) return
      const anchor = trigger.current.getBoundingClientRect()
      const bounds = panel.current.getBoundingClientRect()
      setPosition({
        left: Math.max(12, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 12)),
        top: Math.max(12, Math.min(anchor.bottom + 8, window.innerHeight - bounds.height - 12))
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, message, warnings, timings])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape, true) }
  }, [open])

  return <>
    <button ref={trigger} type="button" className={`btn ghost local-invoice-scan__analysis-info${warning ? ' has-warnings' : ''}`}
      title={warning ? 'Auswertung mit Prüfhinweisen anzeigen' : 'Auswertung anzeigen'}
      aria-label={warning ? 'Auswertung mit Prüfhinweisen anzeigen' : 'Auswertung anzeigen'}
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((value) => !value)}>
      <AppIcon icon={IconInfoCircle} size="action" />
    </button>
    {open && createPortal(<div ref={panel} id={id} className="invoice-analysis-popover" role="region" aria-label="Details zur Auswertung" style={position}>
      <div className="invoice-analysis-popover__heading"><strong>Auswertung</strong><button type="button" className="btn ghost" aria-label="Auswertungsdetails schließen" onClick={() => { setOpen(false); trigger.current?.focus() }}><AppIcon icon={IconX} size="control" /></button></div>
      <div className="invoice-analysis-popover__summary">
        <p>{message}</p>
        {timings && <small>{timings}</small>}
      </div>
      {warnings.length > 0 && <section aria-label="Prüfhinweise">
        <div className="invoice-analysis-popover__warning">Hinweise zur Prüfung</div>
        <ul className="invoice-analysis-popover__list">
          {[...new Set(warnings)].map((item) => <li key={item}>{item.replace(/;?\s*partyId\s+(?:ist|wurde auf)\s+null(?:\s+gesetzt)?[.;]?/gi, '.').trim()}</li>)}
        </ul>
      </section>}
      {!warning && warnings.length === 0 && <p className="invoice-analysis-popover__ok">Keine Prüfhinweise.</p>}
    </div>, document.body)}
  </>
}
