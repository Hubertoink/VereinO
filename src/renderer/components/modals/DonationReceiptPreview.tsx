import React from 'react'

/** Render the export template at its A4 print width, scaled to the available pane. */
export default function DonationReceiptPreview({ html }: { html: string }) {
  const container = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(480)
  const [url, setUrl] = React.useState('')
  React.useEffect(() => {
    const next = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [html])
  React.useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  const scale = Math.min(width / 794, 1)
  return <aside className="donations-preview" aria-label="Vorschau der Spendenbescheinigung">
    <div className="donations-preview-heading"><h3>Vorschau</h3><span className="helper">Spendenbescheinigung · Anlage 3</span></div>
    <div className="donations-preview-scroll">
      <div ref={container} className="donations-preview-width">
        <div className="donations-preview-paper" style={{ height: 1123 * scale }}>
          <iframe title="Spendenbescheinigung – PDF-Vorlage" sandbox="" src={url || undefined}
            style={{ width: 794, height: 1123, transform: `scale(${scale})` }} />
        </div>
      </div>
      <p className="helper">Live-Vorschau der PDF-Vorlage. Seitenumbrüche können im Export abweichen.</p>
    </div>
  </aside>
}
