import { useEffect, useRef, useState } from 'react'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf')

/** Isolierte Vorschau, damit die Buchungsprüfung keine PDF-Lebenszyklen verwalten muss. */
export function PdfReviewPreview({
  fileName,
  dataBase64,
  initialPage = 1
}: {
  fileName: string
  dataBase64: string
  initialPage?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const pdfJsRef = useRef<PdfJsModule | null>(null)
  const renderTaskRef = useRef<any>(null)
  const [document, setDocument] = useState<any>(null)
  const [page, setPage] = useState(Math.max(1, initialPage))
  const [pageCount, setPageCount] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let loadedDocument: any = null
    setDocument(null)
    setPageCount(0)
    setError('')
    setPage(Math.max(1, initialPage))
    setZoom(1)
    const load = async () => {
      try {
        const pdfjs = pdfJsRef.current || (await import('pdfjs-dist/legacy/build/pdf'))
        ;(pdfjs as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl
        pdfJsRef.current = pdfjs
        const bytes = Uint8Array.from(window.atob(dataBase64), (character) => character.charCodeAt(0))
        loadedDocument = await pdfjs.getDocument({ data: bytes }).promise
        if (cancelled) {
          await loadedDocument.destroy()
          return
        }
        setDocument(loadedDocument)
        setPageCount(loadedDocument.numPages || 1)
        setPage(Math.min(Math.max(1, initialPage), loadedDocument.numPages || 1))
      } catch (loadError: any) {
        if (!cancelled) setError(loadError?.message || 'PDF konnte nicht angezeigt werden.')
      }
    }
    void load()
    return () => {
      cancelled = true
      try {
        renderTaskRef.current?.cancel?.()
      } catch {}
      void loadedDocument?.destroy?.()
    }
  }, [dataBase64, initialPage])

  useEffect(() => {
    if (!document || !canvasRef.current) return
    let cancelled = false
    const render = async () => {
      try {
        try {
          renderTaskRef.current?.cancel?.()
        } catch {}
        const pdfPage = await document.getPage(page)
        if (cancelled || !canvasRef.current) return
        const naturalViewport = pdfPage.getViewport({ scale: 1 })
        const availableWidth = Math.max(280, (viewportRef.current?.clientWidth || 560) - 28)
        const fittedScale = Math.min(1.45, Math.max(0.66, availableWidth / naturalViewport.width))
        const viewport = pdfPage.getViewport({ scale: fittedScale * zoom })
        const outputScale = Math.min(window.devicePixelRatio || 1, 2)
        const canvas = canvasRef.current
        const context = canvas.getContext('2d')
        if (!context) throw new Error('PDF-Fläche konnte nicht vorbereitet werden.')
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        const task = pdfPage.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
        })
        renderTaskRef.current = task
        await task.promise
      } catch (renderError: any) {
        if (!cancelled && renderError?.name !== 'RenderingCancelledException') {
          setError(renderError?.message || 'PDF-Seite konnte nicht angezeigt werden.')
        }
      }
    }
    void render()
    return () => {
      cancelled = true
      try {
        renderTaskRef.current?.cancel?.()
      } catch {}
    }
  }, [document, page, zoom])

  if (error) return <div className="ai-pdf-preview__error">PDF-Vorschau nicht möglich: {error}</div>

  return (
    <div className="ai-pdf-preview">
      <div className="ai-pdf-preview__bar">
        <span title={fileName}>{fileName}</span>
        <div className="ai-pdf-preview__controls" aria-label="PDF-Steuerung">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} aria-label="Vorherige Seite">‹</button>
          <span>Seite {page}{pageCount ? ` / ${pageCount}` : ''}</span>
          <button type="button" onClick={() => setPage((current) => Math.min(pageCount || current, current + 1))} disabled={!pageCount || page >= pageCount} aria-label="Nächste Seite">›</button>
          <button type="button" onClick={() => setZoom((current) => Math.max(0.7, current - 0.15))} disabled={zoom <= 0.7} aria-label="PDF verkleinern">−</button>
          <button type="button" onClick={() => setZoom((current) => Math.min(2, current + 0.15))} disabled={zoom >= 2} aria-label="PDF vergrößern">+</button>
        </div>
      </div>
      <div ref={viewportRef} className="ai-pdf-preview__viewport" onWheel={(event) => {
        if (!event.ctrlKey) return
        event.preventDefault()
        const change = event.deltaY < 0 ? 0.1 : -0.1
        setZoom((current) => Math.min(2, Math.max(0.7, Number((current + change).toFixed(2)))))
      }} title="Mit Strg + Mausrad zoomen">
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
