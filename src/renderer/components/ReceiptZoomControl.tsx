import React, { useState } from 'react'
import { IconMinus, IconPlus } from '@tabler/icons-react'
import CompactPopover from './CompactPopover'

export default function ReceiptZoomControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [anchor, setAnchor] = useState<{ x: number; y: number; trigger: HTMLElement } | null>(null)
  const percent = Math.round(value * 100)
  const change = (next: number) => onChange(Math.max(25, Math.min(400, next)) / 100)
  return <>
    <button type="button" className="btn ghost" title="Zoom einstellen · Strg + Mausrad" aria-label="PDF Zoom einstellen" aria-expanded={!!anchor} aria-haspopup="dialog"
      onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setAnchor(anchor ? null : { x: rect.left, y: rect.bottom + 6, trigger: event.currentTarget }) }}>{percent} %</button>
    {anchor && <CompactPopover label="Zoom" className="receipt-zoom" anchor={anchor} onClose={() => setAnchor(null)}>
      <div className="receipt-zoom__controls">
        <button type="button" className="btn ghost" aria-label="Verkleinern" disabled={percent <= 25} onClick={() => change(percent - 10)}><IconMinus size={17} aria-hidden="true" /></button>
        <input type="range" min={25} max={400} step={1} value={percent} aria-label="Zoomstufe" aria-valuetext={`${percent} Prozent`} onChange={event => change(Number(event.target.value))} />
        <button type="button" className="btn ghost" aria-label="Vergrößern" disabled={percent >= 400} onClick={() => change(percent + 10)}><IconPlus size={17} aria-hidden="true" /></button>
      </div>
      <div className="receipt-zoom__footer"><output>{percent} %</output><button type="button" className="btn ghost" onClick={() => onChange(1)}>Zurücksetzen</button></div>
    </CompactPopover>}
  </>
}
