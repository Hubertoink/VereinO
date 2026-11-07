import type { TAiAgentRunOutput } from '../../../electron/main/ipc/schemas'

type Handoff = { organizationId: string; question: string; result: TAiAgentRunOutput }
let pending: Handoff | undefined

/** Carry an already completed agent run into the existing review UI without rerunning it. */
export function openAgentReview(handoff: Handoff) {
  pending = handoff
  window.dispatchEvent(new CustomEvent('ai:continue-agent'))
}

export function takeAgentReview(organizationId: string): Handoff | undefined {
  const handoff = pending
  pending = undefined
  return handoff?.organizationId === organizationId ? handoff : undefined
}
