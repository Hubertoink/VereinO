import type { AiContributionPaymentState } from './aiViewTypes'

export async function bookReviewedContribution(draft: AiContributionPaymentState, organizationId: string) {
  const input = {
    organizationId, memberId: draft.memberId, periodKey: draft.periodKey,
    interval: draft.interval ?? ('YEARLY' as const), date: draft.date, description: draft.description,
    amount: draft.amount, paymentMethod: draft.paymentMethod || undefined,
    paymentAccountId: draft.paymentAccountId ?? null, tags: draft.tags
  }
  let requestId = draft.requestId
  if (!requestId) {
    // Restored drafts from earlier versions need the same key even after a restart.
    const bytes = new TextEncoder().encode(JSON.stringify(input))
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    requestId = 'legacy-' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  }
  return window.api.payments.bookContribution({ requestId, ...input })
}
