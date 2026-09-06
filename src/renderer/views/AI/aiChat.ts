const AI_CHAT_STORAGE_KEY = 'vereino.ai.chat.v2'

export type AiMessage = {
  id: string
  role: 'user' | 'assistant'
  title?: string
  body: string
  displayBody?: string
  isStreaming?: boolean
  meta?: string
  jobId?: number
  reviewable?: boolean
  filePath?: string
  bookingDraft?: {
    agentDraftId?: string
    title?: string
    qa: Record<string, unknown>
    files?: unknown[]
    status?: 'OPEN' | 'SAVED'
    voucherId?: number | null
    voucherNo?: string | null
  }
}

function storageKey(organizationId: string) {
  return `${AI_CHAT_STORAGE_KEY}.${encodeURIComponent(organizationId)}`
}

export function readAiChatSnapshot<T extends object>(organizationId?: string | null): Partial<T> {
  if (typeof window === 'undefined' || !organizationId) return {}
  try {
    const raw = window.localStorage.getItem(storageKey(organizationId))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function writeAiChatSnapshot<T extends { messages?: AiMessage[] }>(
  snapshot: T,
  organizationId?: string | null
) {
  if (typeof window === 'undefined' || !organizationId) return
  try {
    const messages = (snapshot.messages || []).map(({ displayBody, isStreaming, ...message }) => message)
    window.localStorage.setItem(storageKey(organizationId), JSON.stringify({ ...snapshot, messages }))
  } catch {
    // Der Chat bleibt auch ohne verfügbaren Local Storage nutzbar.
  }
}

export function clearAiChatSnapshot(organizationId?: string | null) {
  if (typeof window === 'undefined' || !organizationId) return
  try {
    window.localStorage.removeItem(storageKey(organizationId))
  } catch {
    // Das Leeren ist eine Komfortfunktion und darf den Chat nicht blockieren.
  }
}
