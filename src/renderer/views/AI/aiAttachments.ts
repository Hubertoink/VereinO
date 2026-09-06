export type AiAttachmentPreview = { key: string; name: string; url: string | null; badge: string }

export function filePreviewKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

export function attachmentBadge(file: File) {
  const name = file.name.toLowerCase()
  if (file.type.startsWith('image/')) return 'IMG'
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'XLS'
  if (name.endsWith('.csv')) return 'CSV'
  if (name.endsWith('.tsv')) return 'TSV'
  if (name.endsWith('.pdf')) return 'PDF'
  return 'DATEI'
}

export function isAiAttachmentFile(file: File) {
  const mimeType = String(file.type || '').toLowerCase()
  const name = String(file.name || '').toLowerCase()
  if (mimeType === 'application/pdf') return true
  if (mimeType === 'image/png' || mimeType === 'image/jpeg') return true
  return /\.(pdf|xlsx|xls|csv|tsv|png|jpe?g)$/i.test(name)
}
