import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { getAppDataDir, getDb } from '../db/database'
import {
  clearAiJobFiles,
  createAiJob,
  deleteAiJob,
  findAiJobByPrompt,
  getAiJob,
  listAiJobs,
  saveAiJobResult,
  setAiJobStatus
} from '../repositories/aiJobs'
import { buildAiInvoiceContext } from './aiContext'
import { analyzeInvoiceDocument, getAiSettings, segmentInvoicePacket } from './ai'
import { extractWithDocling, getDoclingStatus } from './docling'
import { filePayloadToBuffer } from './filePayload'
import { extractLocalInvoiceFields } from '../../../src/renderer/utils/localInvoiceExtraction'
import { pathExists, sha256Buffer, sha256File } from './asyncFile'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const POLL_MS = 4000
let timer: NodeJS.Timeout | null = null
let processing = false
let scanPromise: Promise<{ added: number; duplicates: Array<{ fileName: string; voucherNo?: string | null }> }> | null = null
const cancelledJobIds = new Set<number>()
const savedFileHashCache = new Map<string, { size: number; mtimeMs: number; sha256: string }>()
const DUPLICATE_ERROR_PREFIX = 'INVOICE_DUPLICATE:'
const DUPLICATE_OVERRIDE_ERROR = 'INVOICE_DUPLICATE_OVERRIDE'

type InvoiceDuplicate = { voucherId: number; voucherNo?: string | null }

function duplicateError(duplicate: InvoiceDuplicate) {
  return `${DUPLICATE_ERROR_PREFIX}${JSON.stringify(duplicate)}`
}

function duplicateFromError(error?: string | null): InvoiceDuplicate | null {
  if (!error?.startsWith(DUPLICATE_ERROR_PREFIX)) return null
  try {
    const parsed = JSON.parse(error.slice(DUPLICATE_ERROR_PREFIX.length))
    return Number(parsed?.voucherId) > 0
      ? { voucherId: Number(parsed.voucherId), voucherNo: parsed.voucherNo || null }
      : null
  } catch {
    return null
  }
}

async function hashSavedFile(filePath: string) {
  const stat = await fs.stat(filePath)
  const cached = savedFileHashCache.get(filePath)
  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return cached.sha256
  const sha256 = await sha256File(filePath)
  savedFileHashCache.set(filePath, { size: stat.size, mtimeMs: stat.mtimeMs, sha256 })
  return sha256
}

export async function findSavedVoucherDuplicate(data: Buffer, dataSha256?: string): Promise<InvoiceDuplicate | null> {
  const sha256 = dataSha256 || await sha256Buffer(data)
  const rows = getDb().prepare(`
    SELECT vf.file_path as filePath, vf.voucher_id as voucherId, v.voucher_no as voucherNo
    FROM voucher_files vf
    JOIN vouchers v ON v.id = vf.voucher_id
    WHERE vf.size = ?
    ORDER BY vf.id DESC
  `).all(data.length) as Array<{ filePath: string; voucherId: number; voucherNo?: string | null }>
  for (const row of rows) {
    try {
      if (await pathExists(row.filePath) && await hashSavedFile(row.filePath) === sha256) {
        return { voucherId: Number(row.voucherId), voucherNo: row.voucherNo || null }
      }
    } catch {
      // Missing or temporarily unavailable attachments are not reliable duplicate evidence.
    }
  }
  return null
}

type InvoiceBatchSourceMeta = {
  path: string
  sha256?: string
  segment?: { index: number; total: number; pageNumbers: number[]; confidence: number; warnings: string[] }
}

function queuePrompt(filePath: string, sourceSha256: string, segment?: InvoiceBatchSourceMeta['segment']) {
  return `invoice-batch:${JSON.stringify({ path: path.resolve(filePath), sha256: sourceSha256, segment })}`
}

function sourceMetaFromPrompt(prompt?: string | null): InvoiceBatchSourceMeta | null {
  if (!prompt?.startsWith('invoice-batch:')) return null
  const value = prompt.slice('invoice-batch:'.length)
  try {
    const parsed = JSON.parse(value)
    return typeof parsed?.path === 'string' ? parsed : null
  } catch {
    return { path: value }
  }
}

function openJobsForSource(filePath: string) {
  return listAiJobs({ type: 'BOOKING_FROM_DOCUMENTS', limit: 200, includeInvoiceBatch: true }).rows
    .filter((job: any) => !['APPROVED', 'REJECTED'].includes(job.status))
    .filter((job: any) => sourceMetaFromPrompt(job.prompt)?.path === path.resolve(filePath))
}

function pageRangeLabel(pageNumbers: number[]) {
  if (pageNumbers.length === 1) return `Seite ${pageNumbers[0]}`
  return `Seiten ${pageNumbers[0]}–${pageNumbers[pageNumbers.length - 1]}`
}

export function getInvoiceSubmitDirectory() {
  const folder = path.join(getAppDataDir().root, 'Submit')
  fsSync.mkdirSync(folder, { recursive: true })
  return folder
}

type InvoiceBatchChange = {
  duplicatesAdded?: Array<{ fileName: string; voucherNo?: string | null }>
  packetSplit?: { fileName: string; invoiceCount: number; uncertainCount: number; duplicateCount: number }
}

function notifyQueueChanged(change?: InvoiceBatchChange) {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send('ai:invoice-batch-changed', change) } catch { /* window may close */ }
  }
}

async function safePdfFiles() {
  const folder = getInvoiceSubmitDirectory()
  try {
    return (await fs.readdir(folder, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.pdf$/i.test(entry.name))
      .map((entry) => path.join(folder, entry.name))
  } catch {
    return []
  }
}

async function uniqueDestination(fileName: string, dataSha256: string) {
  const folder = getInvoiceSubmitDirectory()
  const safeName = path.basename(fileName).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'Rechnung.pdf'
  const parsed = path.parse(/\.pdf$/i.test(safeName) ? safeName : `${safeName}.pdf`)
  let candidate = path.join(folder, `${parsed.name}${parsed.ext}`)
  let index = 2
  while (await pathExists(candidate)) {
    try {
      if (await sha256File(candidate) === dataSha256) {
        return { path: candidate, reused: true }
      }
    } catch {
      // If the existing file cannot be compared, preserve it and choose a new name.
    }
    candidate = path.join(folder, `${parsed.name} (${index})${parsed.ext}`)
    index += 1
  }
  return { path: candidate, reused: false }
}

async function runInvoiceSubmitDirectoryScan(options?: { announceDuplicates?: boolean }) {
  let added = 0
  let changed = 0
  const duplicates: Array<{ fileName: string; voucherNo?: string | null }> = []
  for (const filePath of await safePdfFiles()) {
    try {
      const stat = await fs.stat(filePath)
      if (!stat.isFile()) continue
      const data = await fs.readFile(filePath)
      const dataSha256 = await sha256Buffer(data)
      const prompt = queuePrompt(filePath, dataSha256)
      const existing = findAiJobByPrompt('BOOKING_FROM_DOCUMENTS', prompt)
      const sourceJobs = openJobsForSource(filePath)
      const duplicate = await findSavedVoucherDuplicate(data, dataSha256)
      if (existing) {
        const wasDuplicate = duplicateFromError(existing.error)
        const manuallyReleased = existing.error === DUPLICATE_OVERRIDE_ERROR
        if (!manuallyReleased && existing.status !== 'PROCESSING' && duplicate) {
          if (!wasDuplicate || existing.status !== 'DRAFT') {
            setAiJobStatus(existing.id, 'DRAFT', { error: duplicateError(duplicate) })
            duplicates.push({ fileName: path.basename(filePath), voucherNo: duplicate.voucherNo })
            changed += 1
          }
          continue
        }
        if (!duplicate && existing.status === 'DRAFT') {
          setAiJobStatus(existing.id, 'QUEUED', { error: null })
          changed += 1
        }
        continue
      }
      if (sourceJobs.length > 0) continue
      const job = createAiJob({
        type: 'BOOKING_FROM_DOCUMENTS',
        title: path.basename(filePath),
        prompt,
        files: [{ fileName: path.basename(filePath), mimeType: 'application/pdf', dataBase64: data.toString('base64') }]
      })
      if (duplicate) {
        setAiJobStatus(job.id, 'DRAFT', { error: duplicateError(duplicate) })
        duplicates.push({ fileName: path.basename(filePath), voucherNo: duplicate.voucherNo })
      } else if (stat.size > MAX_FILE_BYTES) {
        setAiJobStatus(job.id, 'FAILED', { error: 'Die KI-Analyse unterstützt PDFs bis 10 MB.' })
      } else {
        setAiJobStatus(job.id, 'QUEUED')
      }
      added += 1
      changed += 1
    } catch (error: any) {
      console.warn('[InvoiceBatch] Datei konnte nicht eingereiht werden:', filePath, error)
    }
  }
  if (changed) notifyQueueChanged(options?.announceDuplicates === false ? undefined : { duplicatesAdded: duplicates })
  void processInvoiceBatchQueue()
  return { added, duplicates }
}

export function scanInvoiceSubmitDirectory(options?: { announceDuplicates?: boolean }) {
  if (!scanPromise) {
    scanPromise = runInvoiceSubmitDirectoryScan(options).finally(() => { scanPromise = null })
  }
  return scanPromise
}

export async function importInvoiceBatchFiles(
  files: Array<{ fileName: string; dataBytes?: Uint8Array; dataBase64?: string }>
) {
  const imported: string[] = []
  const reused: string[] = []
  for (const file of files) {
    const data = filePayloadToBuffer(file)
    if (!data.length) continue
    const destination = await uniqueDestination(file.fileName, await sha256Buffer(data))
    if (!destination.reused) await fs.writeFile(destination.path, data)
    const importedName = path.basename(destination.path)
    imported.push(importedName)
    if (destination.reused) reused.push(importedName)
  }
  const queued = await scanInvoiceSubmitDirectory({ announceDuplicates: false })
  return { ok: true, imported, reused, duplicates: queued.duplicates }
}

export async function processInvoiceBatchQueue() {
  if (processing) return
  const initialAiAvailable = getAiSettings().hasApiKey
  const initialDoclingAvailable = (await getDoclingStatus()).enabled
  if (!initialAiAvailable && !initialDoclingAvailable) return
  processing = true
  try {
    while (getAiSettings().hasApiKey || (await getDoclingStatus()).enabled) {
      const next = listAiJobs({ type: 'BOOKING_FROM_DOCUMENTS', status: 'QUEUED', limit: 200, includeInvoiceBatch: true }).rows
        .find((job: any) => job.prompt?.startsWith('invoice-batch:'))
      if (!next) break
      setAiJobStatus(next.id, 'PROCESSING')
      notifyQueueChanged()
      try {
        if (cancelledJobIds.has(next.id)) continue
        const job = getAiJob(next.id)
        const file = job.files[0]
        if (!file?.dataBase64) throw new Error('PDF-Daten fehlen.')
        const source = sourceMetaFromPrompt(job.prompt)
        if (!source) throw new Error('Quelldaten des Scanpakets fehlen.')
        const aiAvailable = getAiSettings().hasApiKey
        if (!aiAvailable) {
          const local = await extractWithDocling({
            fileName: file.fileName,
            mimeType: file.mimeType,
            dataBase64: file.dataBase64
          })
          const fields = extractLocalInvoiceFields(local.text)
          if (cancelledJobIds.has(next.id)) continue
          const amount = (value: string) => {
            const parsed = value.trim() ? Number(value) : Number.NaN
            return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
          }
          saveAiJobResult(job.id, 'BOOKING_CANDIDATE', {
            supplier: fields.supplier || null,
            invoiceNumber: fields.invoiceNumber || null,
            invoiceDate: fields.invoiceDate || null,
            dueDate: fields.dueDate || null,
            grossAmount: amount(fields.grossAmount),
            netAmount: amount(fields.netAmount),
            taxAmount: amount(fields.taxAmount),
            vatRate: null,
            iban: fields.iban || null,
            description: fields.description || fields.supplier || path.parse(file.fileName).name,
            type: 'OUT',
            sphere: 'IDEELL',
            paymentMethod: null,
            paymentAccountId: null,
            budgets: [],
            earmarks: [],
            tags: [],
            confidence: 0.55,
            warnings: [
              'Lokal mit Docling ohne generative KI vorbereitet. Bitte Betrag, Richtung und steuerliche Zuordnung vollständig prüfen.',
              'Mehrere Rechnungen innerhalb derselben PDF können im reinen Offline-Modus nicht zuverlässig getrennt werden.'
            ],
            evidence: [`Docling ${local.version || ''}`.trim()]
          })
          setAiJobStatus(job.id, 'NEEDS_REVIEW', { model: `docling-${local.version || 'local'}` })
          notifyQueueChanged()
          continue
        }
        if (!source.segment) {
          const packet = await segmentInvoicePacket({
            fileName: file.fileName,
            mimeType: file.mimeType || 'application/pdf',
            dataBase64: file.dataBase64
          })
          if (cancelledJobIds.has(next.id)) continue
          if (packet.groups.length > 1) {
            const originalName = path.basename(source.path)
            let duplicateCount = 0
            for (const [index, group] of packet.groups.entries()) {
              const groupData = Buffer.from(group.dataBase64, 'base64')
              const segment = {
                index: index + 1,
                total: packet.groups.length,
                pageNumbers: group.pageNumbers,
                confidence: group.confidence,
                warnings: [...packet.warnings, ...group.warnings]
              }
              const title = `${originalName} · Rechnung ${index + 1} · ${pageRangeLabel(group.pageNumbers)}`
              const child = createAiJob({
                type: 'BOOKING_FROM_DOCUMENTS',
                title,
                prompt: queuePrompt(source.path, source.sha256 || await sha256Buffer(groupData), segment),
                files: [{ fileName: title.replace(/\.pdf(?= ·)/i, '') + '.pdf', mimeType: 'application/pdf', dataBase64: group.dataBase64 }]
              })
              const duplicate = await findSavedVoucherDuplicate(groupData)
              if (duplicate) duplicateCount += 1
              setAiJobStatus(child.id, duplicate ? 'DRAFT' : 'QUEUED', {
                error: duplicate ? duplicateError(duplicate) : null
              })
            }
            deleteAiJob(job.id)
            notifyQueueChanged({
              packetSplit: {
                fileName: originalName,
                invoiceCount: packet.groups.length,
                uncertainCount: packet.groups.filter((group) => group.confidence < 0.75 || group.warnings.length > 0).length,
                duplicateCount
              }
            })
            continue
          }
        }
        let localDocumentText = ''
        try {
          if ((await getDoclingStatus()).enabled) {
            localDocumentText = (await extractWithDocling({
              fileName: file.fileName,
              mimeType: file.mimeType,
              dataBase64: file.dataBase64
            })).text
          }
        } catch (error) {
          console.warn('[InvoiceBatch] Optionale Docling-Vorverarbeitung fehlgeschlagen:', error)
        }
        const analyzed = await analyzeInvoiceDocument({
          file: {
            fileName: file.fileName,
            mimeType: file.mimeType || 'application/pdf',
            dataBase64: file.dataBase64
          },
          context: buildAiInvoiceContext(),
          localDocumentText
        })
        // Discarding a processing item cannot necessarily abort the provider
        // request, but it must guarantee that a late response is never saved.
        if (cancelledJobIds.has(next.id)) continue
        if (source.segment) {
          const groupingWarnings = [...source.segment.warnings]
          if (source.segment.confidence < 0.75) {
            groupingWarnings.unshift(`Die Zuordnung der Seiten dieses Scanpakets ist nur zu ${Math.round(source.segment.confidence * 100)} % sicher. Bitte Seitengrenze prüfen.`)
          }
          analyzed.result.warnings = [...new Set([...groupingWarnings, ...analyzed.result.warnings])]
        }
        saveAiJobResult(job.id, 'BOOKING_CANDIDATE', analyzed.result)
        setAiJobStatus(job.id, 'NEEDS_REVIEW', { model: analyzed.model, usage: analyzed.usage })
      } catch (error: any) {
        if (cancelledJobIds.has(next.id)) continue
        setAiJobStatus(next.id, 'FAILED', { error: error?.message || String(error) })
      } finally {
        cancelledJobIds.delete(next.id)
      }
      notifyQueueChanged()
    }
  } finally {
    processing = false
  }
}

export async function listInvoiceBatchItems() {
  const rows = listAiJobs({ type: 'BOOKING_FROM_DOCUMENTS', limit: 200, includeInvoiceBatch: true }).rows
    .filter((job: any) => job.prompt?.startsWith('invoice-batch:'))
    .filter((job: any) => !['APPROVED', 'REJECTED'].includes(job.status))
    .map((job: any) => {
      const duplicate = duplicateFromError(job.error)
      const source = sourceMetaFromPrompt(job.prompt)
      return {
        id: job.id,
        fileName: job.title || `Rechnung ${job.id}`,
        status: job.status,
        error: duplicate ? null : job.error || null,
        createdAt: job.createdAt,
        result: job.result || null,
        isDuplicate: !!duplicate,
        duplicateVoucherId: duplicate?.voucherId ?? null,
        duplicateVoucherNo: duplicate?.voucherNo ?? null,
        packet: source?.segment ? {
          index: source.segment.index,
          total: source.segment.total,
          pageNumbers: source.segment.pageNumbers,
          confidence: source.segment.confidence,
          warnings: source.segment.warnings
        } : null
      }
    })
  return {
    rows,
    submitDirectory: getInvoiceSubmitDirectory(),
    aiAvailable: getAiSettings().hasApiKey,
    doclingAvailable: (await getDoclingStatus()).enabled
  }
}

export function getInvoiceBatchItem(id: number) {
  const job = getAiJob(id)
  if (job.type !== 'BOOKING_FROM_DOCUMENTS' || !job.prompt?.startsWith('invoice-batch:')) throw new Error('Batch-Rechnung nicht gefunden.')
  const duplicate = duplicateFromError(job.error)
  const source = sourceMetaFromPrompt(job.prompt)
  return {
    id: job.id,
    fileName: job.title || job.files[0]?.fileName || `Rechnung ${job.id}`,
    status: job.status,
    error: duplicate ? null : job.error || null,
    result: job.result || null,
    file: job.files[0] || null,
    isDuplicate: !!duplicate,
    duplicateVoucherId: duplicate?.voucherId ?? null,
    duplicateVoucherNo: duplicate?.voucherNo ?? null,
    packet: source?.segment ? {
      index: source.segment.index,
      total: source.segment.total,
      pageNumbers: source.segment.pageNumbers,
      confidence: source.segment.confidence,
      warnings: source.segment.warnings
    } : null
  }
}

export function retryInvoiceBatchItem(id: number) {
  const job = getAiJob(id)
  if (job.type !== 'BOOKING_FROM_DOCUMENTS' || !job.prompt?.startsWith('invoice-batch:')) throw new Error('Batch-Rechnung nicht gefunden.')
  setAiJobStatus(id, 'QUEUED', {
    error: duplicateFromError(job.error) ? DUPLICATE_OVERRIDE_ERROR : null
  })
  notifyQueueChanged()
  void processInvoiceBatchQueue()
  return { ok: true }
}

async function removeSourceFile(job: ReturnType<typeof getAiJob>) {
  const source = sourceMetaFromPrompt(job.prompt)
  if (!source) return
  const folder = path.resolve(getInvoiceSubmitDirectory())
  const resolved = path.resolve(source.path)
  if (path.dirname(resolved) !== folder) throw new Error('Ungültiger Submit-Dateipfad.')
  const siblingStillOpen = openJobsForSource(resolved).some((candidate: any) => candidate.id !== job.id)
  if (siblingStillOpen) return
  try {
    if (source.sha256 && await pathExists(resolved) && await sha256File(resolved) !== source.sha256) return
    await fs.unlink(resolved)
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }
}

export async function approveInvoiceBatchItem(id: number, voucherId: number) {
  const job = getAiJob(id)
  if (job.type !== 'BOOKING_FROM_DOCUMENTS' || !job.prompt?.startsWith('invoice-batch:')) throw new Error('Batch-Rechnung nicht gefunden.')
  setAiJobStatus(id, 'APPROVED', { voucherId })
  try {
    await removeSourceFile(job)
    clearAiJobFiles(id)
    return { ok: true }
  } finally {
    // Once a voucher exists, the item must leave the review queue even if the
    // operating system temporarily refuses to remove the source PDF.
    notifyQueueChanged()
  }
}

export async function discardInvoiceBatchItem(id: number) {
  const job = getAiJob(id)
  if (job.type !== 'BOOKING_FROM_DOCUMENTS' || !job.prompt?.startsWith('invoice-batch:')) throw new Error('Batch-Rechnung nicht gefunden.')
  if (job.status === 'PROCESSING') cancelledJobIds.add(id)
  await removeSourceFile(job)
  deleteAiJob(id)
  notifyQueueChanged()
  return { ok: true }
}

export async function openInvoiceSubmitDirectory() {
  const error = await shell.openPath(getInvoiceSubmitDirectory())
  return { ok: !error, error: error || undefined }
}

export function startInvoiceBatchQueue() {
  if (timer) return
  const interrupted = listAiJobs({ type: 'BOOKING_FROM_DOCUMENTS', status: 'PROCESSING', limit: 200, includeInvoiceBatch: true }).rows
  for (const job of interrupted) {
    if (job.prompt?.startsWith('invoice-batch:')) setAiJobStatus(job.id, 'QUEUED')
  }
  void scanInvoiceSubmitDirectory()
  timer = setInterval(() => { void scanInvoiceSubmitDirectory() }, POLL_MS)
  timer.unref?.()
}

export function stopInvoiceBatchQueue() {
  if (timer) clearInterval(timer)
  timer = null
}
