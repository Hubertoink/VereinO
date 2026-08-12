export function isPdfInputFile(file: {
  fileName: string
  mimeType?: string | null
  dataBase64?: string
}) {
  const mimeType = String(file.mimeType || '').toLowerCase()
  return mimeType === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf')
}
