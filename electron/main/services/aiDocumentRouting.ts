import { joinPdfTextItems } from '../../../src/renderer/utils/localInvoiceExtraction'

export function isPdfInputFile(file: {
  fileName: string
  mimeType?: string | null
  dataBase64?: string
}) {
  const mimeType = String(file.mimeType || '').toLowerCase()
  return mimeType === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf')
}

export async function readEmbeddedPdfText(dataBase64: string, pagesAlreadyRead = 0): Promise<string> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loading = getDocument({ data: Uint8Array.from(Buffer.from(dataBase64, 'base64')), isEvalSupported: false })
  try {
    const pdf = await loading.promise
    const pages: string[] = []
    for (let pageNo = pagesAlreadyRead + 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo)
      const content = await page.getTextContent()
      const text = joinPdfTextItems(content.items.filter(item => 'str' in item))
      if (text) pages.push('Seite ' + pageNo + '\n' + text)
      page.cleanup()
    }
    return pages.join('\n\n')
  } finally {
    await loading.destroy()
  }
}
