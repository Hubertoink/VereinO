import { aiBookingComment } from '../../../shared/aiBookingPolicy'

export function selectAiDraftBookingType<T extends { type?: string }>(qa: T): T & { bookingTypeSelected: boolean } {
  return {
    ...qa,
    bookingTypeSelected: qa.type === 'IN' || qa.type === 'OUT' || qa.type === 'TRANSFER' || qa.type === 'INTERNAL'
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
