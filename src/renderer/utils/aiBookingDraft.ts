import { aiBookingComment } from '../../../shared/aiBookingPolicy'

export function selectAiDraftBookingType<T extends { type?: string; bankReviewSource?: { direction: 'IN' | 'OUT' } }>(qa: T): T & { bookingTypeSelected: boolean } {
  const type = qa.bankReviewSource?.direction ?? qa.type
  return {
    ...qa,
    type,
    bookingTypeSelected: type === 'IN' || type === 'OUT' || type === 'TRANSFER' || type === 'INTERNAL'
  }
}

export async function currentAiDraftComment(note?: string | null) {
  try {
    const settings = await window.api.ai.settings.get()
    return aiBookingComment(settings.bookingCommentsEnabled, note)
  } catch {
    // A missing/unavailable setting must never opt a user in.
    return ''
  }
}
