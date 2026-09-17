import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
const execute = promisify(execFile)
/** Rasterize all pages or reject; never silently omit pages from an invoice. */
export async function invoicePdfImages(data: Buffer): Promise<Buffer[]> {
 const pdf = await PDFDocument.load(data, { ignoreEncryption: false, updateMetadata: false })
 if (pdf.getPageCount() > 12) throw Object.assign(new Error('KI-PDF-Analyse unterstützt bis zu 12 Seiten. Bitte den Beleg aufteilen.'), { statusCode: 400 })
 const directory = await mkdtemp(join(tmpdir(), 'vereino-ai-pdf-'))
 try {
  const file = join(directory, 'document.pdf')
  await writeFile(file, data, { mode: 0o600 })
  try { await execute('pdftoppm', ['-jpeg', '-scale-to', '1600', '-r', '120', file, join(directory, 'page')], { timeout: 30000, maxBuffer: 65536 }) }
  catch { throw Object.assign(new Error('PDF-Seiten konnten nicht für die KI aufbereitet werden.'), { statusCode: 422 }) }
  const names = (await readdir(directory)).filter(name => /^page-\d+\.jpg$/.test(name)).sort((a,b) => a.localeCompare(b, 'en', { numeric: true }))
  if (names.length !== pdf.getPageCount()) throw Object.assign(new Error('Die PDF konnte nicht vollständig gelesen werden.'), { statusCode: 422 })
  const pages = await Promise.all(names.map(name => readFile(join(directory, name))))
  if (pages.reduce((sum,page) => sum+page.length,0) > 15*1024*1024) throw Object.assign(new Error('Die gerenderte PDF ist für die KI-Analyse zu groß.'), { statusCode: 413 })
  return pages
 } finally { await rm(directory, { recursive: true, force: true }) }
}
