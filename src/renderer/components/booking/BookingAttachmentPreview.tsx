import { animateAttachmentReveal } from '../../utils/animateAttachmentReveal'
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from '@tabler/icons-react'
import './bookingAttachmentPreview.css'
import { isPdfAttachment as isPdf, canPreviewAttachment, type AttachmentPreviewRequest } from '../../utils/attachmentPreview'

const PdfPreview = lazy(() => import('../../views/AI/PdfReviewPreview').then(module => ({ default: module.PdfReviewPreview })))

export default function BookingAttachmentPreview({ files, editorRef, request }: { files: File[]; editorRef: RefObject<HTMLElement>; request?: AttachmentPreviewRequest }) {
  const available = files.filter(canPreviewAttachment)
  const [selected, setSelected] = useState<File | null>(null)
  const file = selected && available.includes(selected) ? selected : available[0]
  const [dismissed, setDismissed] = useState<File | null>(null)
  const [position, setPosition] = useState<CSSProperties | null>(null)
  const [source, setSource] = useState<{ file: File; url: string } | null>(null)
  const [error, setError] = useState('')
  const previewRef = useRef<HTMLElement>(null)
  const animatedRequest = useRef<AttachmentPreviewRequest>()
  const handledRequest = useRef<AttachmentPreviewRequest>()
  const [revealRequest, setRevealRequest] = useState<AttachmentPreviewRequest>()
  const [pendingReveal, setPendingReveal] = useState<File | null>(null)
  const cancelReveal = useRef<() => void>()
  const [readyFile, setReadyFile] = useState<File | null>(null)

  // A reopened draft already has files on mount. Wait until the parent form
  // has attached its ref before measuring and installing observers.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !file || dismissed === file) { setPosition(null); return }
    const measure = () => {
      const rect = editor.getBoundingClientRect()
      const sidebarRight = document.querySelector('.app-sidebar')?.getBoundingClientRect().right || 0
      const headerBottom = document.querySelector('.app-header')?.getBoundingClientRect().bottom || 0
      const top = Math.max(24, headerBottom + 12)
      const contentLeft = sidebarRight + 12
      const bankPanel = document.querySelector('.bank-draft-source')?.getBoundingClientRect()
      type Placement = { left: number; top: number; width: number; height: number }
      const fits = (placement: Placement) => placement.width >= 320 && placement.height >= 320
        && !(bankPanel && bankPanel.width > 0 && bankPanel.height > 0
          && placement.left < bankPanel.right && placement.left + placement.width > bankPanel.left
          && placement.top < bankPanel.bottom && placement.top + placement.height > bankPanel.top)
      const rightWidth = Math.min(900, window.innerWidth - rect.right - 24)
      const leftWidth = Math.min(900, rect.left - contentLeft - 12)
      const sides: Placement[] = [
        { left: rect.right + 12, top, width: rightWidth, height: window.innerHeight - top - 24 },
        { left: rect.left - leftWidth - 12, top, width: leftWidth, height: window.innerHeight - top - 24 }
      ]
      const beside = sides.sort((a, b) => b.width - a.width).find(fits)
      const aboveWidth = Math.min(900, window.innerWidth - contentLeft - 12)
      const above: Placement = {
        left: Math.max(contentLeft, Math.min(rect.left + (rect.width - aboveWidth) / 2, window.innerWidth - aboveWidth - 12)),
        top,
        width: aboveWidth,
        height: rect.top - top - 12
      }
      setPosition(beside || (fits(above) ? above : null))
    }
    measure()
    let frame = 0
    const scheduleMeasure = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(editor)
    const sidebar = document.querySelector('.app-sidebar')
    if (sidebar) observer.observe(sidebar)
    window.addEventListener('resize', scheduleMeasure)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', scheduleMeasure) }
  }, [editorRef, file, dismissed])

  const visible = !!position && !!file && dismissed !== file
  useLayoutEffect(() => {
    if (!request || request === handledRequest.current) return
    handledRequest.current = request
    // Repeated clicks leave the visible preview and any running reveal untouched.
    if (visible && file === request.file) return
    setSelected(request.file)
    setDismissed(null)
    setRevealRequest(request)
    setPendingReveal(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? null : request.file)
  }, [request, file, visible])
  useEffect(() => {
    setSource(null); setReadyFile(null); setError('')
    if (!visible || !file) return
    if (!isPdf(file)) {
      const url = URL.createObjectURL(file)
      setSource({ file, url })
      return () => URL.revokeObjectURL(url)
    }
    const reader = new FileReader()
    reader.onload = () => setSource({ file, url: String(reader.result).split(',')[1] })
    reader.onerror = () => setError('Die Vorschau konnte nicht geladen werden.')
    reader.readAsDataURL(file)
    return () => { reader.onload = null; reader.onerror = null; if (reader.readyState === FileReader.LOADING) reader.abort() }
  }, [file, visible])

  useLayoutEffect(() => {
    cancelReveal.current?.()
    const preview = previewRef.current
    if (!preview || !revealRequest || revealRequest === animatedRequest.current || readyFile !== revealRequest.file || source?.file !== revealRequest.file || file !== revealRequest.file) return
    animatedRequest.current = revealRequest
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setPendingReveal(null); return }
    const media = preview.querySelector<HTMLImageElement | HTMLCanvasElement>('img, canvas')
    if (media) cancelReveal.current = animateAttachmentReveal(media, revealRequest.origin)
    // The wave owns opacity now; reveal the real media only after its first paint is protected.
    setPendingReveal(null)
    return () => cancelReveal.current?.()
  }, [revealRequest, source, file, visible, readyFile])

  if (!visible || !file) return null
  return createPortal(<aside ref={previewRef} className="booking-attachment-preview" data-reveal-pending={pendingReveal === file || undefined} style={position!} aria-label="Belegvorschau">
    <header>
      {available.length > 1 ? <select className="booking-attachment-preview__name" aria-label="Anhang für Vorschau" value={available.indexOf(file)} onChange={event => { setError(''); setSelected(available[Number(event.target.value)]) }}>
        {available.map((attachment, index) => <option key={index} value={index}>{attachment.name}</option>)}
      </select> : <strong className="booking-attachment-preview__name" title={file.name}>{file.name}</strong>}
      <button type="button" className="btn ghost" aria-label="Belegvorschau schließen" onClick={() => setDismissed(file)}><IconX size={18} aria-hidden="true" /></button>
    </header>
    <div className="booking-attachment-preview__content">
      {error ? <p role="status">{error}</p> : source?.file === file ? isPdf(file)
        ? <Suspense fallback={null}><PdfPreview key={source.url} fileName={file.name} dataBase64={source.url} fit="page" onRendered={() => setReadyFile(file)} /></Suspense>
        : <img src={source.url} alt={`Beleg: ${file.name}`} onLoad={() => setReadyFile(file)} onError={() => setError('Dieses Bild kann nicht angezeigt werden.')} />
        : null}
    </div>
  </aside>, document.body)
}
