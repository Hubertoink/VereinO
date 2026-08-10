import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { filePayloadToBuffer } from './filePayload'
import type { FileDataPayload } from '../../../shared/filePayload'

const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const OCR_LANGUAGES = 'deu+eng'
type OcrWord = { text: string; x: number; y: number; width: number; height: number }
type OcrWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>

let workerPromise: Promise<OcrWorker> | null = null
let recognitionQueue = Promise.resolve()

function tessdataPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'ocr', 'tessdata')
    : path.join(process.cwd(), 'assets', 'ocr', 'tessdata')
}

export async function getOcrStatus() {
  const directory = tessdataPath()
  const [deu, eng] = await Promise.all([
    fs.access(path.join(directory, 'deu.traineddata.gz')).then(() => true).catch(() => false),
    fs.access(path.join(directory, 'eng.traineddata.gz')).then(() => true).catch(() => false)
  ])
  return {
    available: deu && eng,
    languages: ['Deutsch', 'Englisch'],
    error: deu && eng ? null : 'Die mitgelieferten OCR-Sprachdaten wurden nicht gefunden.'
  }
}

function decodeHocrText(value: string) {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim()
}

function wordsFromHocr(hocr: string | null | undefined): OcrWord[] {
  if (!hocr) return []
  const words: OcrWord[] = []
  const spans = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi
  for (const match of hocr.matchAll(spans)) {
    const attributes = match[1] || ''
    if (!/\bocrx_word\b/i.test(attributes)) continue
    const title = attributes.match(/\btitle=['"]([^'"]*)['"]/i)?.[1] || ''
    const box = title.match(/\bbbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i)
    const text = decodeHocrText(match[2] || '')
    if (!box || !text) continue
    const [x1, y1, x2, y2] = box.slice(1).map(Number)
    if (x2 <= x1 || y2 <= y1) continue
    words.push({ text, x: x1, y: y1, width: x2 - x1, height: y2 - y1 })
  }
  return words
}

async function getWorker() {
  if (!workerPromise) {
    const { createWorker } = await import('tesseract.js')
    workerPromise = createWorker(OCR_LANGUAGES, 1, {
      langPath: tessdataPath(),
      gzip: true,
      cacheMethod: 'none',
      logger: () => {}
    })
    workerPromise.catch(() => {
      // Ein fehlgeschlagener Start darf nicht alle folgenden OCR-Aufrufe blockieren.
      workerPromise = null
    })
  }
  return workerPromise
}

export async function extractWithTesseract(images: FileDataPayload[]) {
  if (!images.length || images.length > 3) {
    throw new Error('Die lokale OCR verarbeitet ein bis drei Seiten pro Durchlauf.')
  }
  const status = await getOcrStatus()
  if (!status.available) throw new Error(status.error || 'Lokale OCR ist nicht verfügbar.')

  const buffers = images.map((image) => filePayloadToBuffer(image))
  if (buffers.some((buffer) => !buffer.length || buffer.length > MAX_IMAGE_BYTES)) {
    throw new Error('Eine OCR-Seite ist leer oder größer als 12 MB.')
  }

  const run = async () => {
    const { PSM } = await import('tesseract.js')
    const worker = await getWorker()
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
    const pages: Array<{ text: string; confidence: number; words: OcrWord[] }> = []
    for (const buffer of buffers) {
      const result = await worker.recognize(buffer, {}, { text: true, hocr: true })
      pages.push({
        text: String(result.data.text || '').trim(),
        confidence: Number(result.data.confidence || 0),
        words: wordsFromHocr(result.data.hocr)
      })
    }
    const recognized = pages.filter((page) => page.text)
    return {
      text: recognized.map((page) => page.text).join('\n\n').slice(0, 250_000),
      pages,
      confidence: recognized.length
        ? Math.round(recognized.reduce((sum, page) => sum + page.confidence, 0) / recognized.length)
        : 0
    }
  }
  const queuedRun = recognitionQueue.then(run, run)
  recognitionQueue = queuedRun.then(() => undefined, () => undefined)
  return queuedRun
}

app.on('before-quit', () => {
  void workerPromise?.then((worker) => worker.terminate()).catch(() => {})
})
