import React, { useEffect, useRef, useState, type RefObject } from 'react'
import type { BankSourceField as Field } from '../../hooks/useBankDraftSourceHighlight'
import { createPortal } from 'react-dom'
import type { BankDraftSource } from '../../types/bankDraftSource'
import './bankDraftSource.css'


function date(value?: string | null) {
  if (!value) return '–'
  const parts = value.slice(0, 10).split('-')
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : value
}

export default function BankDraftSourcePanel({ source, anchorRef, active }: {
  source?: BankDraftSource
  anchorRef: RefObject<HTMLElement>
  active: Field | null
}) {
  const [dock, setDock] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  const panelRef = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const anchor = anchorRef.current
    if (!source || !anchor) return
    const update = () => {
      const rect = anchor.getBoundingClientRect()
      const top = Math.max(12, rect.top)
      const next = rect.left >= 348 ? { left: rect.left - 336, top, maxHeight: Math.max(120, window.innerHeight - top - 12) } : null
      setDock((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(anchor)
    const mutation = new MutationObserver(update)
    mutation.observe(anchor, { attributes: true, attributeFilter: ['style'] })
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      observer.disconnect()
      mutation.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchorRef, source])

  useEffect(() => {
    const panel = panelRef.current
    const highlighted = panel?.querySelector<HTMLElement>('.is-highlighted')
    if (!panel?.open || !highlighted) return
    const bounds = panel.getBoundingClientRect()
    const row = highlighted.getBoundingClientRect()
    const heading = panel.querySelector('summary')?.offsetHeight || 0
    if (row.bottom > bounds.bottom) panel.scrollTop += row.bottom - bounds.bottom + 10
    else if (row.top < bounds.top + heading) panel.scrollTop -= bounds.top + heading - row.top + 10
  }, [active, dock])

  if (!source) return null
  const currency = /^[A-Z]{3}$/.test(source.currency) ? source.currency : 'EUR'
  const amount = new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(source.amount)
  const rows: Array<{ key: string; label: string; value?: string | null; fields: Field[] }> = [
    { key: 'date', label: 'Datum', value: date(source.bookingDate), fields: ['date'] },
    ...(source.valueDate ? [{ key: 'valueDate', label: 'Wertstellung', value: date(source.valueDate), fields: ['date'] as Field[] }] : []),
    { key: 'party', label: 'Gegenpartei', value: source.counterparty, fields: ['description', 'party'] },
    { key: 'account', label: 'Zahlkonto', value: source.paymentAccountName, fields: ['account'] },
    { key: 'purpose', label: 'Verwendungszweck', value: source.purpose, fields: ['description'] },
    ...(source.counterpartyIban ? [{ key: 'iban', label: 'IBAN der Gegenpartei', value: source.counterpartyIban, fields: ['party'] as Field[] }] : []),
    ...(source.bankReference ? [{ key: 'reference', label: 'Bankreferenz', value: source.bankReference, fields: [] }] : [])
  ]
  const panel = (
    <details ref={panelRef} open className={`bank-draft-source${dock ? ' bank-draft-source--docked' : ' bank-draft-source--inline'}`} style={dock || undefined}>
      <summary><strong>Quelle: importierter Bankbeleg</strong><span>Originaldaten vergleichen</span></summary>
      <div className="bank-draft-source__body">
        <p className={active === 'direction' ? 'is-highlighted' : undefined} data-bank-source="direction">{source.direction === 'OUT' ? 'Ausgang vom Konto' : 'Eingang auf dem Konto'}</p>
        <dl>{rows.map((row) => <div key={row.key} data-bank-source={row.key} className={active && row.fields.includes(active) ? 'is-highlighted' : undefined}>
          <dt>{row.label}</dt><dd>{row.value || '–'}</dd>
        </div>)}</dl>
        <div data-bank-source="amount" className={`bank-draft-source__amount${active === 'amount' ? ' is-highlighted' : ''}`}><span>Betrag</span><strong>{amount}</strong></div>
        {source.sourceFileName && <p className="bank-draft-source__filename" title={source.sourceFileName}>{source.sourceFileName}</p>}
        <small>Feld im Formular berühren oder fokussieren, um die passenden Originaldaten hervorzuheben.</small>
      </div>
    </details>
  )
  return dock ? createPortal(panel, anchorRef.current?.closest('.modal-overlay') || document.body) : panel
}
