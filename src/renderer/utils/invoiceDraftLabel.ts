const MAX_SUBJECT_WORDS = 5
const MAX_SUBJECT_CHARS = 42

export function compactInvoiceDraftSubject(value?: string | null) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''

  const words = normalized.split(' ')
  let subject = words.slice(0, MAX_SUBJECT_WORDS).join(' ')
  let shortened = words.length > MAX_SUBJECT_WORDS
  if (subject.length > MAX_SUBJECT_CHARS) {
    subject = subject.slice(0, MAX_SUBJECT_CHARS - 1).trimEnd()
    shortened = true
  }
  return `${subject}${shortened ? '…' : ''}`
}

export function invoiceDraftTabText(description?: string | null, detached = false) {
  const normalized = String(description || '').replace(/\s+/g, ' ').trim()
  const compact = compactInvoiceDraftSubject(normalized)
  const base = compact ? `Rechnung – ${compact}` : 'Rechnung erfassen'
  const full = normalized ? `Rechnung – ${normalized}` : 'Rechnung erfassen'
  return {
    label: base,
    title: `${full}${detached ? ' · abgedockt' : ''}`
  }
}
