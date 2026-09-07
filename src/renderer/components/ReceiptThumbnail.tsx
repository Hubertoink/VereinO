import React, { useEffect, useRef, useState } from 'react'
import { IconFileDescription } from '@tabler/icons-react'
import { base64ToUint8Array } from '../utils/fileEncoding'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

type Preview = { image: string | null; label: string }
// Scoped to the mounted receipts view, so switching databases cannot reuse file IDs.
export type ReceiptPreviewCache = Map<number, Promise<Preview>>
let active = 0
const queue: Array<() => void> = []
async function limited<T>(work: () => Promise<T>): Promise<T> {
    await new Promise<void>(resolve => {
        const start = () => { active++; resolve() }
        if (active < 2) start()
        else queue.push(start)
    })
    try { return await work() } finally { active--; queue.shift()?.() }
}

async function generate(voucherId: number): Promise<Preview> {
    const { files } = await window.api.attachments.list({ voucherId })
    const file = files.find(f => /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(f.fileName) || f.mimeType === 'application/pdf' || f.mimeType?.startsWith('image/')) || files[0]
    if (!file) return { image: null, label: 'Kein Anhang' }
    const pdf = file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.fileName)
    const picture = file.mimeType?.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.fileName)
    if (!pdf && !picture) return { image: null, label: file.fileName }
    const result = await window.api.attachments.read({ fileId: file.id })
    const bytes = result.dataBytes instanceof Uint8Array ? result.dataBytes : base64ToUint8Array(result.dataBase64 || '')
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    if (pdf) {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf')
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
        const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false })
        try {
            const doc = await task.promise
            const page = await doc.getPage(1)
            const original = page.getViewport({ scale: 1 })
            const viewport = page.getViewport({ scale: Math.min(360 / original.width, 240 / original.height) })
            canvas.width = Math.max(1, Math.ceil(viewport.width))
            canvas.height = Math.max(1, Math.ceil(viewport.height))
            await page.render({ canvasContext: context, canvas, viewport }).promise
        } finally { await task.destroy() }
    } else {
        const blob = new Blob([new Uint8Array(bytes)], { type: result.mimeType || 'application/octet-stream' })
        const bitmap = await createImageBitmap(blob)
        try {
            const scale = Math.min(1, 360 / bitmap.width, 240 / bitmap.height)
            canvas.width = Math.max(1, Math.round(bitmap.width * scale))
            canvas.height = Math.max(1, Math.round(bitmap.height * scale))
            context.fillStyle = '#fff'
            context.fillRect(0, 0, canvas.width, canvas.height)
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        } finally { bitmap.close() }
    }
    const image = canvas.toDataURL('image/webp', 0.78)
    canvas.width = canvas.height = 0
    return { image, label: file.fileName }
}

export default function ReceiptThumbnail({ voucherId, cache, revision }: { voucherId: number; cache: ReceiptPreviewCache; revision: number }) {
    const host = useRef<HTMLDivElement>(null)
    const [preview, setPreview] = useState<Preview | null>(null)
    useEffect(() => {
        let alive = true
        setPreview(null)
        const observer = new IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) return
            observer.disconnect()
            let pending = cache.get(voucherId)
            if (!pending) {
                pending = limited(async () => alive ? generate(voucherId) : { image: null, label: 'Vorschau nicht geladen' })
                cache.set(voucherId, pending)
                // Keep only small previews for the last few pages.
                if (cache.size > 100) cache.delete(cache.keys().next().value!)
                const current = pending
                void pending.then(() => { if (!alive && cache.get(voucherId) === current) cache.delete(voucherId) }, () => { if (cache.get(voucherId) === current) cache.delete(voucherId) })
            }
            void pending.then(value => { if (alive) setPreview(value) }, () => { if (alive) setPreview({ image: null, label: 'Vorschau nicht verfügbar' }) })
        }, { rootMargin: '160px' })
        if (host.current) observer.observe(host.current)
        return () => { alive = false; observer.disconnect() }
    }, [voucherId, cache, revision])
    return <div ref={host} className="receipt-thumbnail">
        {preview?.image ? <img src={preview.image} alt={`Vorschau: ${preview.label}`} width={360} height={240} /> : <div className="receipt-thumbnail__fallback"><IconFileDescription size={38} stroke={1.3} /><span>{preview?.label || 'Vorschau wird geladen …'}</span></div>}
    </div>
}
