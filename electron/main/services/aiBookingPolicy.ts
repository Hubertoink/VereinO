import { AI_BOOKING_COMMENTS_SETTING, aiBookingComment } from '../../../shared/aiBookingPolicy'
import { getSetting } from './settings'

export function aiBookingCommentsEnabled() {
  return getSetting(AI_BOOKING_COMMENTS_SETTING) === true
}

export function currentAiBookingComment(note?: string | null) {
  return aiBookingComment(aiBookingCommentsEnabled(), note)
}
