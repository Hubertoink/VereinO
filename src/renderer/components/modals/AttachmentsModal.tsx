import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconX as IconClose, IconExternalLink, IconDownload, IconPlus, IconChevronLeft, IconChevronRight, IconTrash, IconFile, IconPhoto as IconImage, IconReceipt2, IconCalendar, IconWallet, IconCategory, IconTag, IconArrowDown, IconArrowUp, IconArrowsExchange, IconPaperclip } from '@tabler/icons-react'
import { useToast } from '../../context/useToast'
import { addDataChangedListener, notifyDataChanged } from '../../utils/refresh'
import { base64ToUint8Array, encodeFileForUpload } from '../../utils/fileEncoding'
import type { RendererApi } from '../../../types/api'

type BookingDetails = Awaited<ReturnType<RendererApi['vouchers']['list']>>['rows'][number]
const amountFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', signDisplay: 'exceptZero' })
const bookingTypeLabels = { IN: 'Einnahme', OUT: 'Ausgabe', TRANSFER: 'Transfer', INTERNAL: 'Interne Umbuchung' }
const dateFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
const sphereLabels = { IDEELL: 'Ideell', ZWECK: 'Zweckbetrieb', VERMOEGEN: 'Vermögensverwaltung', WGB: 'Wirtschaftlicher Geschäftsbetrieb' }

// Vite will copy the worker file and return a URL string
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

type PreviewState =
    | null
    | { kind: 'image'; url: string }
    | { kind: 'pdf'; data: Uint8Array; fileId: number }

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf')

export default function AttachmentsModal({
    voucher,
    onClose,
    onChanged,
}: {
    voucher: { voucherId: number; voucherNo: string; date: string; description: string }
    onClose: () => void
    onChanged?: () => void
}) {
    const { notify } = useToast()
    const [booking, setBooking] = useState<BookingDetails | null>(null)
    const [bookingError, setBookingError] = useState(false)
    useEffect(() => {
        let request = 0
        let alive = true
        setBooking(null)
        setBookingError(false)
        const loadBooking = async () => {
            const current = ++request
            try {
                const result = await window.api.vouchers.list({ voucherIds: [voucher.voucherId], limit: 1 })
                if (!alive || current !== request) return
                setBooking(result.rows[0] ?? null)
                setBookingError(!result.rows.length)
            } catch {
                if (alive && current === request) {
                    setBooking(null)
                    setBookingError(true)
                }
            }
        }
        void loadBooking()
        const unsubscribe = addDataChangedListener(['vouchers'], () => { void loadBooking() })
        return () => { alive = false; unsubscribe() }
    }, [voucher.voucherId])

    const paymentLabel = booking?.type === 'TRANSFER'
        ? `${booking.transferFromAccountName || (booking.transferFrom === 'BAR' ? 'Bar' : 'Bank')} → ${booking.transferToAccountName || (booking.transferTo === 'BAR' ? 'Bar' : 'Bank')}`
        : booking?.type === 'INTERNAL' ? 'Intern'
        : booking?.paymentAccountName || (booking?.paymentMethod === 'BAR' ? 'Bar' : booking?.paymentMethod === 'BANK' ? 'Bank' : '—')
    const [files, setFiles] = useState<Array<{ id: number; fileName: string; mimeType?: string | null }>>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string>('')
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<null | { id: number; fileName: string }>(null)
    const [preview, setPreview] = useState<PreviewState>(null)
    const [pdfZoom, setPdfZoom] = useState(1)
    const [pdfError, setPdfError] = useState<string>('')
    const [pdfMeta, setPdfMeta] = useState<null | { page: number; numPages: number }>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const backdropPointerDownRef = useRef(false)
    const modalRef = useRef<HTMLDivElement | null>(null)
    const resizeDragRef = useRef<null | { pointerId: number; x: number; y: number; width: number; height: number }>(null)
    const resizeGestureRef = useRef(false)
    const [modalSize, setModalSize] = useState<{ width: number; height: number } | null>(null)
    const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const previewAreaRef = useRef<HTMLDivElement | null>(null)
    const pdfDocRef = useRef<any>(null)
    const pdfDocCacheRef = useRef(new Map<number, Promise<any>>())
    const previewCacheRef = useRef(new Map<number, Exclude<PreviewState, null>>())
    const pdfJsRef = useRef<PdfJsModule | null>(null)
    const renderTaskRef = useRef<any>(null)
    const resizeFrameRef = useRef<number | null>(null)
    const currentPreviewRequestRef = useRef(0)
    const [previewAreaWidth, setPreviewAreaWidth] = useState<number>(0)

    useEffect(() => { setPdfZoom(1) }, [selectedId])

    useEffect(() => {
        const area = previewAreaRef.current
        if (!area || preview?.kind !== 'pdf') return
        const zoomWithWheel = (event: WheelEvent) => {
            if (!event.ctrlKey || event.deltaY === 0) return
            event.preventDefault()
            event.stopPropagation()
            const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? area.clientHeight : 1)
            setPdfZoom(current => Math.max(0.25, Math.min(4, current * Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.002))))
        }
        area.addEventListener('wheel', zoomWithWheel, { passive: false })
        return () => area.removeEventListener('wheel', zoomWithWheel)
    }, [preview])

    const revokePreview = (value: PreviewState) => {
        if (value?.kind === 'image' && value.url.startsWith('blob:')) URL.revokeObjectURL(value.url)
    }

    useEffect(() => {
        let alive = true
        setLoading(true); setError('')
        for (const value of previewCacheRef.current.values()) revokePreview(value)
        previewCacheRef.current.clear()
        pdfDocCacheRef.current.clear()
        pdfDocRef.current = null
        ;(window as any).api?.attachments.list?.({ voucherId: voucher.voucherId })
            .then((res: any) => {
                if (!alive) return
                const rows = res?.files || []
                setFiles(rows)
                setSelectedId(rows[0]?.id ?? null)
            })
            .catch((e: any) => setError(e?.message || String(e)))
            .finally(() => { if (alive) setLoading(false) })
        const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => {
            alive = false
            window.removeEventListener('keydown', onKey)
            for (const value of previewCacheRef.current.values()) revokePreview(value)
            previewCacheRef.current.clear()
        }
    }, [voucher.voucherId])

    async function refreshPreview(id: number | null) {
        const requestId = currentPreviewRequestRef.current + 1
        currentPreviewRequestRef.current = requestId
        setPreview(null)
        setPdfError('')
        setPdfMeta(null)
        pdfDocRef.current = null
        if (renderTaskRef.current) {
            try { renderTaskRef.current.cancel() } catch { }
            renderTaskRef.current = null
        }
        if (id == null) return
        const cachedPreview = previewCacheRef.current.get(id)
        if (cachedPreview) {
            setPreview(cachedPreview)
            return
        }
        const f = files.find(x => x.id === id)
        if (!f) return
        const name = f.fileName || ''
        const mt = (f.mimeType || '').toLowerCase()
        const isImg = mt.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(name)
        const isPdf = mt === 'application/pdf' || /\.(pdf)$/i.test(name)
        if (!isImg && !isPdf) return
        try {
            const res = await (window as any).api?.attachments.read?.({ fileId: id })
            if (!res || currentPreviewRequestRef.current !== requestId) return
            const bytes = res.dataBytes instanceof Uint8Array
                ? res.dataBytes
                : base64ToUint8Array(String(res.dataBase64 || ''))
            if (isImg) {
                const nextPreview: Exclude<PreviewState, null> = {
                    kind: 'image',
                    url: URL.createObjectURL(new Blob([bytes], { type: res.mimeType || 'image/*' }))
                }
                previewCacheRef.current.set(id, nextPreview)
                setPreview(nextPreview)
                return
            }
            if (isPdf) {
                const nextPreview: Exclude<PreviewState, null> = { kind: 'pdf', data: bytes, fileId: id }
                previewCacheRef.current.set(id, nextPreview)
                setPreview(nextPreview)
            }
        } catch (e: any) {
            setError('Vorschau nicht möglich: ' + (e?.message || String(e)))
        }
    }

    useEffect(() => { refreshPreview(selectedId) }, [selectedId, files])

    useEffect(() => {
        const el = previewAreaRef.current
        if (!el) return
        const ro = new ResizeObserver(() => {
            if (resizeFrameRef.current != null) cancelAnimationFrame(resizeFrameRef.current)
            resizeFrameRef.current = requestAnimationFrame(() => {
                setPreviewAreaWidth((current) => {
                    const next = el.clientWidth
                    return Math.abs(current - next) >= 8 ? next : current
                })
                resizeFrameRef.current = null
            })
        })
        ro.observe(el)
        setPreviewAreaWidth(el.clientWidth)
        return () => {
            ro.disconnect()
            if (resizeFrameRef.current != null) cancelAnimationFrame(resizeFrameRef.current)
        }
    }, [loading, selectedId])

    useEffect(() => {
        let cancelled = false

        async function ensurePdfJs() {
            if (pdfJsRef.current) return pdfJsRef.current
            const pdfjs = await import('pdfjs-dist/legacy/build/pdf')
            ;(pdfjs as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl
            pdfJsRef.current = pdfjs
            return pdfjs
        }

        async function loadPdfDocument() {
            if (!preview || preview.kind !== 'pdf') return
            setPdfError('')
            const pdfjs = await ensurePdfJs()
            let docPromise = pdfDocCacheRef.current.get(preview.fileId)
            if (!docPromise) {
                const nextDocPromise = pdfjs.getDocument({ data: preview.data }).promise
                pdfDocCacheRef.current.set(preview.fileId, nextDocPromise)
                docPromise = nextDocPromise
            }
            const doc = await docPromise
            if (cancelled) return
            pdfDocRef.current = doc
            setPdfMeta({ page: 1, numPages: doc.numPages || 1 })
        }

        async function renderPdfPage() {
            if (!preview || preview.kind !== 'pdf') return
            const canvas = pdfCanvasRef.current
            const doc = pdfDocRef.current
            if (!canvas || !doc || !pdfMeta) return

            const page = await doc.getPage(pdfMeta.page)
            if (cancelled) return

            const baseViewport = page.getViewport({ scale: 1 })
            const availWidth = Math.max(0, (previewAreaWidth || 0) - 40)
            const fitScale = availWidth > 0 ? Math.min(1, (availWidth / baseViewport.width) * 0.95) : 1
            const scale = Math.max(0.5, Math.min(1, fitScale)) * pdfZoom

            if (renderTaskRef.current) {
                try { renderTaskRef.current.cancel() } catch { }
                renderTaskRef.current = null
            }

            const outputScale = Math.min(window.devicePixelRatio || 1, 1.5)
            const viewport = page.getViewport({ scale })
            const ctx = canvas.getContext('2d')
            if (!ctx) return

            canvas.width = Math.floor(viewport.width * outputScale)
            canvas.height = Math.floor(viewport.height * outputScale)
            canvas.style.width = `${Math.floor(viewport.width)}px`
            canvas.style.height = `${Math.floor(viewport.height)}px`

            ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0)

            const renderTask = page.render({ canvasContext: ctx, viewport })
            renderTaskRef.current = renderTask
            await renderTask.promise
            if (renderTaskRef.current === renderTask) renderTaskRef.current = null
            try { page.cleanup() } catch { }
        }

        if (!preview || preview.kind !== 'pdf') {
            if (renderTaskRef.current) {
                try { renderTaskRef.current.cancel() } catch { }
                renderTaskRef.current = null
            }
            const c = pdfCanvasRef.current
            if (c) {
                const ctx = c.getContext('2d')
                if (ctx) ctx.clearRect(0, 0, c.width, c.height)
            }
            return
        }

        if (!pdfDocRef.current) {
            loadPdfDocument().catch((e: any) => {
                if (cancelled) return
                if (String(e?.name || '').includes('RenderingCancelled')) return
                setPdfError('PDF Vorschau nicht möglich: ' + (e?.message || String(e)))
            })
            return () => { cancelled = true }
        }

        renderPdfPage().catch((e: any) => {
            if (cancelled) return
            if (String(e?.name || '').includes('RenderingCancelled')) return
            setPdfError('PDF Vorschau nicht möglich: ' + (e?.message || String(e)))
        })

        return () => {
            cancelled = true
            if (renderTaskRef.current) {
                try { renderTaskRef.current.cancel() } catch { }
            }
        }
    }, [preview, pdfMeta?.page, previewAreaWidth, pdfZoom])

    const selected = files.find(f => f.id === selectedId) || null
    
    // Check if file is an image for icon display
    const isImageFile = (f: { fileName: string; mimeType?: string | null }) => {
        const mt = (f.mimeType || '').toLowerCase()
        return mt.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(f.fileName)
    }

    async function handleAddFiles(fileList: FileList | null) {
        if (!fileList || !fileList.length) return
        try {
            for (const f of Array.from(fileList)) {
                const encoded = await encodeFileForUpload(f)
                await (window as any).api?.attachments.add?.({
                    voucherId: voucher.voucherId,
                    fileName: encoded.name,
                    dataBytes: encoded.dataBytes,
                    mimeType: encoded.mime
                })
            }
            const res = await (window as any).api?.attachments.list?.({ voucherId: voucher.voucherId })
            setFiles(res?.files || [])
            setSelectedId((res?.files || [])[0]?.id ?? null)
            try { onChanged?.() } catch { }
            try { notifyDataChanged((window as any).api, undefined, ['vouchers']) } catch { }
        } catch (e: any) {
            notify('error', 'Upload fehlgeschlagen: ' + (e?.message || String(e)))
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    async function handleDownload() {
        if (!selected) return
        try {
            const r = await (window as any).api?.attachments.saveAs?.({ fileId: selected.id })
            if (r?.filePath) notify('success', 'Gespeichert: ' + r.filePath)
        } catch (e: any) {
            const m = e?.message || String(e)
            if (/Abbruch/i.test(m)) return
            notify('error', 'Speichern fehlgeschlagen: ' + m)
        }
    }

    async function handleDelete() {
        if (!confirmDelete) return
        try {
            await (window as any).api?.attachments.delete?.({ fileId: confirmDelete.id })
            revokePreview(previewCacheRef.current.get(confirmDelete.id) || null)
            previewCacheRef.current.delete(confirmDelete.id)
            pdfDocCacheRef.current.delete(confirmDelete.id)
            const res = await (window as any).api?.attachments.list?.({ voucherId: voucher.voucherId })
            setFiles(res?.files || [])
            setSelectedId((res?.files || [])[0]?.id ?? null)
            setPreview(null)
            setPdfMeta(null)
            pdfDocRef.current = null
            setConfirmDelete(null)
            try { onChanged?.() } catch { }
            try { notifyDataChanged((window as any).api, undefined, ['vouchers']) } catch { }
        } catch (e: any) {
            notify('error', 'Löschen fehlgeschlagen: ' + (e?.message || String(e)))
        }
    }

    function goPrevPdfPage() {
        if (!pdfMeta) return
        setPdfMeta({ ...pdfMeta, page: Math.max(1, pdfMeta.page - 1) })
    }

    function goNextPdfPage() {
        if (!pdfMeta) return
        setPdfMeta({ ...pdfMeta, page: Math.min(pdfMeta.numPages, pdfMeta.page + 1) })
    }

    function resizeModal(width: number, height: number) {
        const maxWidth = window.innerWidth - 32
        const maxHeight = window.innerHeight - 32
        setModalSize({
            width: Math.max(Math.min(640, maxWidth), Math.min(maxWidth, width)),
            height: Math.max(Math.min(400, maxHeight), Math.min(maxHeight, height))
        })
    }

    return createPortal(
        <div
            className="modal-overlay attachments-modal-overlay"
            onPointerDownCapture={(event) => {
                resizeGestureRef.current = false
                backdropPointerDownRef.current = event.target === event.currentTarget
            }}
            onPointerCancel={() => { backdropPointerDownRef.current = false }}
            onClick={(event) => {
                const startedOnBackdrop = backdropPointerDownRef.current
                backdropPointerDownRef.current = false
                if (!resizeGestureRef.current && startedOnBackdrop && event.target === event.currentTarget) onClose()
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="attachments-modal-title"
        >
            <div ref={modalRef} className="modal attachments-modal" style={modalSize ?? undefined} onClick={(e) => e.stopPropagation()}>
                <header className="attachments-modal__header">
                    <div className="attachments-modal__title">
                        <h2 id="attachments-modal-title"><IconPaperclip size={18} aria-hidden="true" />Belege</h2>
                        <button type="button" className="attachments-modal__voucher-link" title="Zur Buchung" onClick={() => {
                            onClose()
                            window.dispatchEvent(new CustomEvent('apply-voucher-jump', {
                                detail: { voucherId: voucher.voucherId, voucherNo: voucher.voucherNo, date: voucher.date }
                            }))
                        }}><IconReceipt2 size={14} aria-hidden="true" /><span>Buchung #{voucher.voucherNo}</span><IconChevronRight size={14} aria-hidden="true" /></button>
                    </div>
                    <button className="attachments-modal__close" onClick={onClose} aria-label="Schließen"><IconClose size={20} /></button>
                </header>
                <section className="attachments-modal__context" aria-label="Buchungsinformationen">
                    <div className="attachments-modal__summary">
                        <span className={`attachments-modal__direction attachments-modal__amount--${booking?.type.toLowerCase() || 'neutral'}`} aria-hidden="true">{booking?.type === 'IN' ? <IconArrowDown size={17} /> : booking?.type === 'OUT' ? <IconArrowUp size={17} /> : <IconArrowsExchange size={17} />}</span>
                        <div>
                            {booking ? <strong className={`attachments-modal__amount attachments-modal__amount--${booking.type.toLowerCase()}`}>{amountFormat.format(booking.type === 'OUT' ? -booking.grossAmount : booking.grossAmount)}</strong> : <span className="attachments-modal__subtitle" role="status">{bookingError ? 'Buchungsinformationen konnten nicht geladen werden.' : 'Lade Buchungsinformationen…'}</span>}
                            <p title={booking?.description || voucher.description || 'Ohne Beschreibung'}>{booking?.description || voucher.description || 'Ohne Beschreibung'}</p>
                        </div>
                    </div>
                    <dl className="attachments-modal__booking">
                        <div><dt><IconCalendar size={14} />Datum</dt><dd>{dateFormat.format(new Date(`${voucher.date.slice(0, 10)}T12:00:00`))}</dd></div>
                        {booking && <>
                            <div><dt><IconTag size={14} />Art</dt><dd>{bookingTypeLabels[booking.type]}</dd></div>
                            <div><dt><IconWallet size={14} />Konto</dt><dd>{paymentLabel}</dd></div>
                            <div><dt><IconCategory size={14} />{booking.primaryClassificationName ? 'Kategorie' : 'Sphäre'}</dt><dd>{booking.primaryClassificationName || sphereLabels[booking.sphere]}</dd></div>
                        </>}
                    </dl>
                </section>
                <input ref={fileInputRef} type="file" multiple hidden accept=".png,.jpg,.jpeg,.pdf,.doc,.docx" aria-label="Belege auswählen" onChange={(event) => handleAddFiles(event.target.files)} />

                {error && <div className="attachments-modal__error" role="alert">{error}</div>}
                
                {loading ? (
                    <div className="attachments-modal__loading" role="status">Lade Belege…</div>
                ) : (
                    <div className={`attachments-modal__content${files.length === 0 ? ' attachments-modal__content--empty' : ''}`}>
                        {files.length === 0 ? <div className="attachments-modal__empty">
                            <span className="attachments-modal__empty-icon"><IconReceipt2 size={30} stroke={1.5} aria-hidden="true" /></span>
                            <h3>Noch keine Belege</h3>
                            <p>Füge eine Rechnung oder Quittung zu dieser Buchung hinzu.</p>
                            <button className="btn primary attachments-modal__add" onClick={() => fileInputRef.current?.click()}><IconPlus size={17} />Beleg hinzufügen</button>
                            <small>PDF, JPG, PNG oder Word · mehrere Dateien möglich</small>
                        </div> : <>

                        {/* File list sidebar */}
                        <aside className="attachments-modal__sidebar" aria-label="Belegliste">
                            <div className="attachments-modal__sidebar-header">
                                <span className="attachments-modal__file-count">Belege <span>{files.length}</span></span>
                                <button 
                                    className="attachments-modal__icon-btn" 
                                    onClick={() => fileInputRef.current?.click?.()} 
                                    title="Beleg hinzufügen" aria-label="Beleg hinzufügen"
                                >
                                    <IconPlus size={17} aria-hidden="true" />
                                </button>
                            </div>
                            <div className="attachments-modal__file-list">
                                {files.map(f => (
                                    <button 
                                        key={f.id} 
                                        className={`attachments-modal__file-item ${selectedId === f.id ? 'active' : ''}`}
                                        aria-pressed={selectedId === f.id}
                                        title={f.fileName}
                                        onClick={() => setSelectedId(f.id)}
                                    >
                                        <span className="attachments-modal__file-icon">
                                            {isImageFile(f) ? <IconImage size={17} aria-hidden="true" /> : <IconFile size={17} aria-hidden="true" />}
                                        </span>
                                        <span className="attachments-modal__file-label"><span className="attachments-modal__file-name">{f.fileName}</span><small>{isImageFile(f) ? 'Bild' : /\.pdf$/i.test(f.fileName) ? 'PDF-Dokument' : /\.docx?$/i.test(f.fileName) ? 'Word-Dokument' : 'Datei'}</small></span>
                                    </button>
                                ))}
                            </div>
                        </aside>

                        {/* Preview area */}
                        <div className="attachments-modal__preview">
                            {selected ? (
                                <>
                                    {/* Toolbar for selected file */}
                                    <div className="attachments-modal__toolbar">
                                        <div className="attachments-modal__toolbar-left">
                                            <span className="attachments-modal__toolbar-name" title={selected.fileName}><span>Vorschau</span><strong>{selected.fileName}</strong></span>
                                            {preview?.kind === 'pdf' && pdfMeta && (
                                                <div className="attachments-modal__pdf-controls" aria-label="PDF Seitensteuerung">
                                                    <button
                                                        className="attachments-modal__icon-btn"
                                                        onClick={goPrevPdfPage}
                                                        title="Vorherige Seite" aria-label="Vorherige Seite"
                                                        disabled={pdfMeta.page <= 1}
                                                    >
                                                        <IconChevronLeft size={17} aria-hidden="true" />
                                                    </button>
                                                    <button type="button" className="btn ghost" title="Strg + Mausrad zum Zoomen · Klicken zum Zurücksetzen" aria-label="PDF Zoom zurücksetzen" onClick={() => setPdfZoom(1)}>{Math.round(pdfZoom * 100)} %</button>
                                                    <span className="attachments-modal__pdf-page">Seite {pdfMeta.page} / {pdfMeta.numPages}</span>
                                                    <button
                                                        className="attachments-modal__icon-btn"
                                                        onClick={goNextPdfPage}
                                                        title="Nächste Seite" aria-label="Nächste Seite"
                                                        disabled={pdfMeta.page >= pdfMeta.numPages}
                                                    >
                                                        <IconChevronRight size={17} aria-hidden="true" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="attachments-modal__toolbar-actions">
                                            <button 
                                                className="attachments-modal__icon-btn" 
                                                onClick={() => (window as any).api?.attachments.open?.({ fileId: selected.id })}
                                                title="Extern öffnen" aria-label="Extern öffnen"
                                            >
                                                <IconExternalLink size={17} aria-hidden="true" />
                                            </button>
                                            <button 
                                                className="attachments-modal__icon-btn" 
                                                onClick={handleDownload}
                                                title="Herunterladen" aria-label="Herunterladen"
                                            >
                                                <IconDownload size={17} aria-hidden="true" />
                                            </button>
                                            <button 
                                                className="attachments-modal__icon-btn attachments-modal__icon-btn--danger" 
                                                onClick={() => setConfirmDelete({ id: selected.id, fileName: selected.fileName })}
                                                title="Löschen" aria-label="Löschen"
                                            >
                                                <IconTrash size={17} aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>
                                    {/* Preview content */}
                                    <div className="attachments-modal__preview-area" ref={previewAreaRef}>
                                        {preview?.kind === 'image' ? (
                                            <img src={preview.url} alt={selected.fileName} className="attachments-modal__preview-img" />
                                        ) : preview?.kind === 'pdf' ? (
                                            pdfError ? (
                                                <div className="attachments-modal__no-preview">
                                                    <IconFile size={17} aria-hidden="true" />
                                                    <span>{pdfError}</span>
                                                    <div className="attachments-modal__no-preview-actions">
                                                        <button className="btn btn-sm" onClick={() => (window as any).api?.attachments.open?.({ fileId: selected.id })}>
                                                            Extern öffnen
                                                        </button>
                                                        <button className="btn btn-sm" onClick={handleDownload}>
                                                            Herunterladen
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <canvas ref={pdfCanvasRef} className="attachments-modal__preview-canvas" />
                                            )
                                        ) : (
                                            <div className="attachments-modal__no-preview">
                                                <IconFile size={17} aria-hidden="true" />
                                                <span>Keine Vorschau verfügbar</span>
                                                <div className="attachments-modal__no-preview-actions">
                                                    <button className="btn btn-sm" onClick={() => (window as any).api?.attachments.open?.({ fileId: selected.id })}>
                                                        Extern öffnen
                                                    </button>
                                                    <button className="btn btn-sm" onClick={handleDownload}>
                                                        Herunterladen
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="attachments-modal__no-selection">
                                    <IconFile size={32} />
                                    <span>Wähle einen Beleg aus der Liste.</span>
                                </div>
                            )}
                        </div>
                        </>}
                    </div>
                )}

                <button
                    type="button"
                    className="attachments-modal__resize-handle"
                    aria-label="Belegfenstergröße ändern"
                    title="Größe ändern: ziehen oder Pfeiltasten verwenden"
                    onPointerDown={(event) => {
                        if (event.button !== 0 || !modalRef.current) return
                        event.preventDefault()
                        event.stopPropagation()
                        const rect = modalRef.current.getBoundingClientRect()
                        resizeGestureRef.current = true
                        resizeDragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height }
                        event.currentTarget.setPointerCapture(event.pointerId)
                    }}
                    onPointerMove={(event) => {
                        const drag = resizeDragRef.current
                        if (!drag || drag.pointerId !== event.pointerId) return
                        resizeModal(drag.width + event.clientX - drag.x, drag.height + event.clientY - drag.y)
                    }}
                    onPointerUp={(event) => {
                        if (resizeDragRef.current?.pointerId !== event.pointerId) return
                        event.stopPropagation()
                        resizeDragRef.current = null
                        event.currentTarget.releasePointerCapture(event.pointerId)
                    }}
                    onLostPointerCapture={() => { resizeDragRef.current = null }}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation() }}
                    onKeyDown={(event) => {
                        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !modalRef.current) return
                        event.preventDefault()
                        event.stopPropagation()
                        const rect = modalRef.current.getBoundingClientRect()
                        const step = event.shiftKey ? 50 : 20
                        resizeModal(rect.width + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), rect.height + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0))
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M3 13 13 3M7 13l6-6M11 13l2-2" /></svg>
                </button>

                {/* Delete confirmation modal */}
                {confirmDelete && (
                    <div className="modal-overlay" onClick={() => setConfirmDelete(null)} role="dialog" aria-modal="true">
                        <div className="modal modal-grid" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
                            <div className="modal-header">
                                <h3 style={{ margin: 0 }}>Datei löschen</h3>
                                <button className="btn ghost" onClick={() => setConfirmDelete(null)} aria-label="Schließen">✕</button>
                            </div>
                            <p>
                                Möchtest du <strong>{confirmDelete.fileName}</strong> wirklich löschen?
                            </p>
                            <div className="helper">Dieser Vorgang kann nicht rückgängig gemacht werden.</div>
                            <div className="modal-actions-end">
                                <button className="btn" onClick={() => setConfirmDelete(null)}>Abbrechen</button>
                                <button className="btn danger" onClick={handleDelete}>Löschen</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    )
}
