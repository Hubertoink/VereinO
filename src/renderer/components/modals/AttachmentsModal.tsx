import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Vite will copy the worker file and return a URL string
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Safe ArrayBuffer -> base64 converter (chunked to avoid call stack overflow)
function bufferToBase64Safe(buf: ArrayBuffer) {
    const bytes = new Uint8Array(buf)
    const chunk = 0x8000
    let binary = ''
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any)
    }
    return btoa(binary)
}

function base64ToUint8Array(base64: string) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}

// Icon components for toolbar
const IconClose = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
)
const IconExternalLink = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
    </svg>
)
const IconDownload = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
)
const IconPlus = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
)
const IconChevronLeft = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
    </svg>
)
const IconChevronRight = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
    </svg>
)
const IconTrash = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
)
const IconFile = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
    </svg>
)
const IconImage = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
    </svg>
)

export default function AttachmentsModal({ voucher, onClose }: { voucher: { voucherId: number; voucherNo: string; date: string; description: string }; onClose: () => void }) {
    const [files, setFiles] = useState<Array<{ id: number; fileName: string; mimeType?: string | null }>>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string>('')
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<null | { id: number; fileName: string }>(null)
    const [preview, setPreview] = useState<null | { kind: 'image'; url: string } | { kind: 'pdf'; data: Uint8Array }>(null)
    const [pdfError, setPdfError] = useState<string>('')
    const [pdfMeta, setPdfMeta] = useState<null | { page: number; numPages: number }>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const previewAreaRef = useRef<HTMLDivElement | null>(null)
    const pdfDocRef = useRef<any>(null)
    const [previewAreaWidth, setPreviewAreaWidth] = useState<number>(0)

    useEffect(() => {
        let alive = true
        setLoading(true); setError('')
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
        }
    }, [voucher.voucherId])

    async function refreshPreview(id: number | null) {
        setPreview(null)
        setPdfError('')
        setPdfMeta(null)
        pdfDocRef.current = null
        if (id == null) return
        const f = files.find(x => x.id === id)
        if (!f) return
        const name = f.fileName || ''
        const mt = (f.mimeType || '').toLowerCase()
        const isImg = mt.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(name)
        const isPdf = mt === 'application/pdf' || /\.(pdf)$/i.test(name)
        if (!isImg && !isPdf) return
        try {
            const res = await (window as any).api?.attachments.read?.({ fileId: id })
            if (!res) return
            if (isImg) {
                setPreview({ kind: 'image', url: `data:${res.mimeType || 'image/*'};base64,${res.dataBase64}` })
                return
            }
            if (isPdf) {
                setPreview({ kind: 'pdf', data: base64ToUint8Array(res.dataBase64) })
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
            setPreviewAreaWidth(el.clientWidth)
        })
        ro.observe(el)
        setPreviewAreaWidth(el.clientWidth)
        return () => ro.disconnect()
    }, [])

    useEffect(() => {
        let cancelled = false

        async function loadPdfDocument() {
            if (!preview || preview.kind !== 'pdf') return
            setPdfError('')

            // Lazy-load pdfjs only when needed
            const pdfjs = await import('pdfjs-dist/legacy/build/pdf')
            ;(pdfjs as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl

            const loadingTask = pdfjs.getDocument({ data: preview.data })
            const doc = await loadingTask.promise
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
            const scale = Math.max(0.5, Math.min(1, fitScale))

            const outputScale = window.devicePixelRatio || 1
            const viewport = page.getViewport({ scale })
            const ctx = canvas.getContext('2d')
            if (!ctx) return

            canvas.width = Math.floor(viewport.width * outputScale)
            canvas.height = Math.floor(viewport.height * outputScale)
            canvas.style.width = `${Math.floor(viewport.width)}px`
            canvas.style.height = `${Math.floor(viewport.height)}px`

            ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0)

            await page.render({ canvasContext: ctx, viewport }).promise
        }

        // Clear canvas when not showing a PDF
        if (!preview || preview.kind !== 'pdf') {
            const c = pdfCanvasRef.current
            if (c) {
                const ctx = c.getContext('2d')
                if (ctx) ctx.clearRect(0, 0, c.width, c.height)
            }
            return
        }

        // Load doc once per selection
        if (!pdfDocRef.current) {
            loadPdfDocument().catch((e: any) => {
                if (cancelled) return
                setPdfError('PDF Vorschau nicht möglich: ' + (e?.message || String(e)))
            })
            return () => { cancelled = true }
        }

        renderPdfPage().catch((e: any) => {
            if (cancelled) return
            setPdfError('PDF Vorschau nicht möglich: ' + (e?.message || String(e)))
        })

        return () => {
            cancelled = true
        }
    }, [preview, pdfMeta?.page, previewAreaWidth])

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
                const buf = await f.arrayBuffer()
                const dataBase64 = bufferToBase64Safe(buf)
                await (window as any).api?.attachments.add?.({ voucherId: voucher.voucherId, fileName: f.name, dataBase64, mimeType: f.type || undefined })
            }
            const res = await (window as any).api?.attachments.list?.({ voucherId: voucher.voucherId })
            setFiles(res?.files || [])
            setSelectedId((res?.files || [])[0]?.id ?? null)
        } catch (e: any) {
            alert('Upload fehlgeschlagen: ' + (e?.message || String(e)))
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    async function handleDownload() {
        if (!selected) return
        try {
            const r = await (window as any).api?.attachments.saveAs?.({ fileId: selected.id })
            if (r) alert('Gespeichert: ' + r.filePath)
        } catch (e: any) {
            const m = e?.message || String(e)
            if (/Abbruch/i.test(m)) return
            alert('Speichern fehlgeschlagen: ' + m)
        }
    }

    async function handleDelete() {
        if (!confirmDelete) return
        try {
            await (window as any).api?.attachments.delete?.({ fileId: confirmDelete.id })
            const res = await (window as any).api?.attachments.list?.({ voucherId: voucher.voucherId })
            setFiles(res?.files || [])
            setSelectedId((res?.files || [])[0]?.id ?? null)
            setPreview(null)
            setPdfMeta(null)
            pdfDocRef.current = null
            setConfirmDelete(null)
        } catch (e: any) {
            alert('Löschen fehlgeschlagen: ' + (e?.message || String(e)))
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

    return createPortal(
        <div className="modal-overlay attachments-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
            <div className="modal attachments-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <header className="attachments-modal__header">
                    <div className="attachments-modal__title">
                        <h2>Belege zu #{voucher.voucherNo}</h2>
                        <span className="attachments-modal__subtitle">{voucher.date} · {voucher.description || '—'}</span>
                    </div>
                    <button className="attachments-modal__close" onClick={onClose} aria-label="Schließen">
                        <IconClose />
                    </button>
                </header>

                {error && <div className="attachments-modal__error">{error}</div>}
                
                {loading ? (
                    <div className="attachments-modal__loading">Lade Belege…</div>
                ) : (
                    <div className="attachments-modal__content">
                        {/* File list sidebar */}
                        <aside className="attachments-modal__sidebar">
                            <div className="attachments-modal__sidebar-header">
                                <span className="attachments-modal__file-count">{files.length} Datei{files.length !== 1 ? 'en' : ''}</span>
                                <button 
                                    className="attachments-modal__icon-btn" 
                                    onClick={() => fileInputRef.current?.click?.()} 
                                    title="Datei(en) hinzufügen"
                                >
                                    <IconPlus />
                                </button>
                            </div>
                            <input 
                                ref={fileInputRef} 
                                type="file" 
                                multiple 
                                hidden 
                                accept=".png,.jpg,.jpeg,.pdf,.doc,.docx" 
                                onChange={(e) => handleAddFiles(e.target.files)} 
                            />
                            <div className="attachments-modal__file-list">
                                {files.length === 0 && (
                                    <div className="attachments-modal__empty">
                                        <span>Keine Dateien</span>
                                        <button className="btn btn-sm" onClick={() => fileInputRef.current?.click?.()}>
                                            Datei hinzufügen
                                        </button>
                                    </div>
                                )}
                                {files.map(f => (
                                    <button 
                                        key={f.id} 
                                        className={`attachments-modal__file-item ${selectedId === f.id ? 'active' : ''}`}
                                        onClick={() => setSelectedId(f.id)}
                                    >
                                        <span className="attachments-modal__file-icon">
                                            {isImageFile(f) ? <IconImage /> : <IconFile />}
                                        </span>
                                        <span className="attachments-modal__file-name">{f.fileName}</span>
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
                                            <span className="attachments-modal__toolbar-name">{selected.fileName}</span>
                                            {preview?.kind === 'pdf' && pdfMeta && (
                                                <div className="attachments-modal__pdf-controls" aria-label="PDF Seitensteuerung">
                                                    <button
                                                        className="attachments-modal__icon-btn"
                                                        onClick={goPrevPdfPage}
                                                        title="Vorherige Seite"
                                                        disabled={pdfMeta.page <= 1}
                                                    >
                                                        <IconChevronLeft />
                                                    </button>
                                                    <span className="attachments-modal__pdf-page">Seite {pdfMeta.page} / {pdfMeta.numPages}</span>
                                                    <button
                                                        className="attachments-modal__icon-btn"
                                                        onClick={goNextPdfPage}
                                                        title="Nächste Seite"
                                                        disabled={pdfMeta.page >= pdfMeta.numPages}
                                                    >
                                                        <IconChevronRight />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="attachments-modal__toolbar-actions">
                                            <button 
                                                className="attachments-modal__icon-btn" 
                                                onClick={() => (window as any).api?.attachments.open?.({ fileId: selected.id })}
                                                title="Extern öffnen"
                                            >
                                                <IconExternalLink />
                                            </button>
                                            <button 
                                                className="attachments-modal__icon-btn" 
                                                onClick={handleDownload}
                                                title="Herunterladen"
                                            >
                                                <IconDownload />
                                            </button>
                                            <button 
                                                className="attachments-modal__icon-btn attachments-modal__icon-btn--danger" 
                                                onClick={() => setConfirmDelete({ id: selected.id, fileName: selected.fileName })}
                                                title="Löschen"
                                            >
                                                <IconTrash />
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
                                                    <IconFile />
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
                                                <IconFile />
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
                                    <IconFile />
                                    <span>Wähle eine Datei aus der Liste</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

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
