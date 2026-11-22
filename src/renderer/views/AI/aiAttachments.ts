import type { AiProviderId } from '../../../../shared/aiProviders'
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

export function attachmentAccept(provider: AiProviderId) {
  return provider === 'anthropic' ? '.pdf,.xlsx,.csv,.tsv,image/png,image/jpeg' : '.pdf,.xlsx,.xls,.csv,.tsv,image/png,image/jpeg'
}

export function isAiAttachmentFile(file: File, provider?: AiProviderId) {
  if (provider === 'anthropic' && /\.xls$/i.test(file.name)) return false
  const mimeType = String(file.type || '').toLowerCase()
  const name = String(file.name || '').toLowerCase()
  if (mimeType === 'application/pdf') return true
  if (mimeType === 'image/png' || mimeType === 'image/jpeg') return true
  return /\.(pdf|xlsx|xls|csv|tsv|png|jpe?g)$/i.test(name)
}
