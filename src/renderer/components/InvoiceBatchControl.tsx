import { useCallback, useEffect, useRef, useState } from 'react'
import type { TAiInvoiceBatchListOutput } from '../../../electron/main/ipc/schemas'
import { bufferToBase64Safe } from '../utils/fileEncoding'

type BatchItem = TAiInvoiceBatchListOutput['rows'][number]

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Wartet auf KI-Key',
  QUEUED: 'Wartet',
  PROCESSING: 'KI liest …',
  NEEDS_REVIEW: 'Bereit zur Prüfung',
  FAILED: 'Fehlgeschlagen'
}

export default function InvoiceBatchControl({
  onNewInvoice,
  onReview,
  notify
}: {
  onNewInvoice: () => void
  onReview: (id: number) => void
  notify: (type: 'success' | 'error' | 'info' | 'warn', text: string) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [queue, setQueue] = useState<TAiInvoiceBatchListOutput | null>(null)
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)

  const reload = useCallback(async () => {
    try { setQueue(await window.api.ai.invoiceBatch.list()) } catch { /* startup/recovery */ }
  }, [])

  useEffect(() => {
    void reload()
    const off = window.api.ai.invoiceBatch.onChanged((change) => {
      if (change?.packetSplit) {
        const { fileName, invoiceCount, uncertainCount, duplicateCount } = change.packetSplit
        notify(
          uncertainCount > 0 || duplicateCount > 0 ? 'warn' : 'success',
          `${fileName} wurde in ${invoiceCount} Rechnungen aufgeteilt.${uncertainCount > 0 ? ` Bei ${uncertainCount} Gruppierung${uncertainCount === 1 ? '' : 'en'} bitte die Seitengrenze prüfen.` : ''}${duplicateCount > 0 ? ` ${duplicateCount} mögliche${duplicateCount === 1 ? 's' : ''} Duplikat${duplicateCount === 1 ? '' : 'e'} wurde${duplicateCount === 1 ? '' : 'n'} angehalten.` : ''}`
        )
      }
      const duplicates = change?.duplicatesAdded || []
      if (duplicates.length > 0) {
        const names = duplicates.slice(0, 2).map((item) => item.fileName).join(', ')
        const more = duplicates.length > 2 ? ` und ${duplicates.length - 2} weitere` : ''
        notify('warn', `${duplicates.length} PDF${duplicates.length === 1 ? '' : 's'} aus dem Submit-Ordner als Duplikat angehalten: ${names}${more}.`)
      }
      void reload()
    })
    const interval = window.setInterval(() => void reload(), 15000)
    return () => { off(); window.clearInterval(interval) }
  }, [notify, reload])

  const importFiles = async (files: File[]) => {
    const pdfs = files.filter((file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name))
    if (!pdfs.length) {
      notify('info', 'Bitte mindestens eine PDF-Datei auswählen.')
      return
    }
    setUploading(true)
    try {
      const payload = await Promise.all(pdfs.map(async (file) => ({
        fileName: file.name,
        dataBase64: bufferToBase64Safe(await file.arrayBuffer())
      })))
      const result = await window.api.ai.invoiceBatch.import({ files: payload })
      const duplicates = result.duplicates || []
      const duplicateNames = new Set(duplicates.map((item) => item.fileName))
      const reused = (result.reused || []).filter((fileName) => !duplicateNames.has(fileName))
      const regularCount = Math.max(0, result.imported.length - duplicates.length - reused.length)
      if (regularCount > 0) {
        notify('success', `${regularCount} PDF${regularCount === 1 ? '' : 's'} zur KI-Prüfung eingereiht.`)
      }
      if (duplicates.length > 0) {
        const names = duplicates.slice(0, 2).map((item) => item.fileName).join(', ')
        const more = duplicates.length > 2 ? ` und ${duplicates.length - 2} weitere` : ''
        notify(
          'warn',
          `${duplicates.length} PDF${duplicates.length === 1 ? '' : 's'} als bereits gespeicherter Beleg erkannt und angehalten: ${names}${more}. Im KI-Flyout rot markiert.`
        )
      }
      if (reused.length > 0) {
        notify(
          'info',
          `${reused.length} PDF${reused.length === 1 ? ' ist' : 's sind'} bereits im Batch und wurde${reused.length === 1 ? '' : 'n'} nicht erneut kopiert.`
        )
      }
      setOpen(true)
      await reload()
    } catch (error: any) {
      notify('error', error?.message || String(error))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const rows = queue?.rows || []
  const readyCount = rows.filter((item) => item.status === 'NEEDS_REVIEW').length
  const duplicateCount = rows.filter((item) => item.isDuplicate).length
  const busyCount = rows.filter((item) => !item.isDuplicate && ['DRAFT', 'QUEUED', 'PROCESSING'].includes(item.status)).length

  return (
    <div
      className={`invoice-batch-control${dragging ? ' invoice-batch-control--dragging' : ''}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        void importFiles(Array.from(event.dataTransfer.files))
      }}
    >
      <div className="invoice-split-fab" role="group" aria-label="Rechnungen erfassen">
        <button className="invoice-split-fab__new" onClick={onNewInvoice} title="Einzelne Rechnung erfassen">
          <span aria-hidden="true">+</span><span className="invoice-split-fab__label">Rechnung</span>
        </button>
        <button
          className="invoice-split-fab__batch"
          onClick={() => setOpen((value) => !value)}
          title="Mehrere PDF-Rechnungen vorbereiten"
          aria-expanded={open}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M7 2h7l4 4v16H7z"/><path d="M14 2v5h5M10 13h5M12.5 10.5v5"/>
          </svg>
          {rows.length > 0 && <span className="invoice-split-fab__badge">{rows.length}</span>}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(event) => void importFiles(Array.from(event.target.files || []))} />

      {open && (
        <section className="invoice-batch-flyout" aria-label="KI-Rechnungsentwürfe">
          <header>
            <div><strong>KI-Rechnungsentwürfe</strong><small>{readyCount ? `${readyCount} bereit` : duplicateCount ? `${duplicateCount} mögliche${duplicateCount === 1 ? 's' : ''} Duplikat${duplicateCount === 1 ? '' : 'e'}` : busyCount ? `${busyCount} in Vorbereitung` : 'Keine offenen Entwürfe'}</small></div>
            <button className="btn ghost" onClick={() => setOpen(false)} aria-label="Flyout schließen">✕</button>
          </header>
          {!queue?.aiAvailable && !queue?.doclingAvailable && (
            <p className="invoice-batch-flyout__notice">Für die Hintergrundanalyse muss ein KI-API-Key oder die lokale Docling-Verarbeitung aktiv sein.</p>
          )}
          {!queue?.aiAvailable && queue?.doclingAvailable && (
            <p className="invoice-batch-flyout__notice">Lokaler Docling-Modus: Grunddaten werden offline vorbereitet; Zuordnung und Scanpaket-Grenzen bitte vollständig prüfen.</p>
          )}
          <div className="invoice-batch-flyout__list">
            {rows.map((item: BatchItem) => (
              <article key={item.id} className={`invoice-batch-item invoice-batch-item--${item.status.toLowerCase()}${item.isDuplicate ? ' invoice-batch-item--duplicate' : ''}`}>
                <span className={`invoice-batch-item__state${['QUEUED', 'PROCESSING'].includes(item.status) ? ' is-spinning' : ''}`} aria-hidden="true" />
                <button className="invoice-batch-item__main" disabled={item.status !== 'NEEDS_REVIEW'} onClick={() => onReview(item.id)}>
                  <strong title={item.fileName}>{item.fileName}</strong>
                  <small title={item.error || undefined}>{item.isDuplicate ? `Mögliches Duplikat${item.duplicateVoucherNo ? ` von ${item.duplicateVoucherNo}` : ''}` : item.status === 'FAILED' && item.error ? item.error : STATUS_LABELS[item.status] || item.status}</small>
                  {item.packet && (
                    <span
                      className={`invoice-batch-item__packet${item.packet.confidence < 0.75 ? ' is-uncertain' : ''}`}
                      title={item.packet.warnings.join(' · ') || `Seitengruppierung: ${Math.round(item.packet.confidence * 100)} % sicher`}
                    >
                      Scanpaket {item.packet.index}/{item.packet.total} · {item.packet.pageNumbers.length === 1
                        ? `Seite ${item.packet.pageNumbers[0]}`
                        : `Seiten ${item.packet.pageNumbers[0]}–${item.packet.pageNumbers[item.packet.pageNumbers.length - 1]}`}
                      {item.packet.confidence < 0.75 ? ' · Grenze prüfen' : ''}
                    </span>
                  )}
                </button>
                {item.isDuplicate && (
                  <button
                    className="btn ghost invoice-batch-item__manual-run"
                    title="Trotzdem mit KI auslesen"
                    aria-label={`${item.fileName} trotzdem mit KI auslesen`}
                    onClick={async () => { await window.api.ai.invoiceBatch.retry({ id: item.id }); await reload() }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m12 3-1.2 5.8L5 10l5.8 1.2L12 17l1.2-5.8L19 10l-5.8-1.2L12 3Z"/><path d="m18 16 3 3-3 3"/></svg>
                  </button>
                )}
                {item.status === 'FAILED' && (
                  <button className="btn ghost invoice-batch-item__retry" onClick={async () => { await window.api.ai.invoiceBatch.retry({ id: item.id }); await reload() }}>↻</button>
                )}
                {item.status !== 'PROCESSING' && (
                  <button className="btn ghost invoice-batch-item__discard" title="PDF verwerfen" aria-label={`${item.fileName} verwerfen`} onClick={async () => { await window.api.ai.invoiceBatch.discard({ id: item.id }); await reload() }}>×</button>
                )}
              </article>
            ))}
            {!rows.length && <div className="invoice-batch-flyout__empty">Lege PDFs im Submit-Ordner ab oder wähle sie hier aus.</div>}
          </div>
          <footer>
            <button className="btn ghost invoice-batch-flyout__folder-action" onClick={() => void window.api.ai.invoiceBatch.openFolder()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <path d="M3 8.5V6a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v.5" />
              </svg>
              <span>Submit-Ordner</span>
            </button>
            <button className="btn invoice-batch-flyout__batch-action" disabled={uploading} onClick={() => inputRef.current?.click()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M7 2h7l4 4v16H7z" /><path d="M14 2v5h5M10 14h5M12.5 11.5v5" />
              </svg>
              <span>{uploading ? 'Wird hinzugefügt …' : 'Batch-PDFs'}</span>
            </button>
          </footer>
        </section>
      )}
    </div>
  )
}
