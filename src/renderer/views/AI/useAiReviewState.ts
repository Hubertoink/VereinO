import { useState } from 'react'
import type {
  AiBankLinkState,
  AiBankReviewState,
  AiBudgetActionState,
  AiChatSnapshot,
  AiContributionLinkState,
  AiContributionPaymentState,
  AiEarmarkActionState,
  AiMemberImportState,
  AiMemberUpdateState,
  AiPartyActionState,
  AiPlannerQuestionState,
  AiRecurringBookingState,
  AiTagActionState,
  AiVoucherTagActionState
} from './aiViewTypes'
import type { AiInvoiceActionState } from './AgentInvoiceActionCard'
import type { AiVoucherReverseState } from './AgentVoucherReverseCard'
import type { AiVoucherRebookState } from './AgentVoucherRebookCard'
import type { AiVoucherUpdateState } from './AgentVoucherUpdateCard'
import type { TAiAgentTraceEvent } from '../../../../electron/main/ipc/schemas'

type Input = {
  initialChat: AiChatSnapshot
  sanitizeMemberState: (state?: AiMemberImportState | null) => AiMemberImportState | null
}

/** Owns every review draft that is persisted as part of the AI chat. */
export function useAiReviewState({ initialChat, sanitizeMemberState }: Input) {
  const [bankReview, setBankReview] = useState<AiBankReviewState | null>(
    initialChat.bankReview || null
  )
  const [pendingMembers, setPendingMembers] = useState<AiMemberImportState | null>(() =>
    sanitizeMemberState(initialChat.pendingMembers)
  )
  const [pendingMemberUpdates, setPendingMemberUpdates] = useState<AiMemberUpdateState | null>(
    initialChat.pendingMemberUpdates || null
  )
  const [pendingContributionPayment, setPendingContributionPayment] =
    useState<AiContributionPaymentState | null>(initialChat.pendingContributionPayment || null)
  const [pendingRecurringBooking, setPendingRecurringBooking] =
    useState<AiRecurringBookingState | null>(initialChat.pendingRecurringBooking || null)
  const [pendingContributionLinks, setPendingContributionLinks] =
    useState<AiContributionLinkState | null>(initialChat.pendingContributionLinks || null)
  const [pendingTagActions, setPendingTagActions] = useState<AiTagActionState | null>(
    initialChat.pendingTagActions || null
  )
  const [pendingPartyActions, setPendingPartyActions] = useState<AiPartyActionState | null>(
    initialChat.pendingPartyActions || null
  )
  const [pendingVoucherTagActions, setPendingVoucherTagActions] =
    useState<AiVoucherTagActionState | null>(initialChat.pendingVoucherTagActions || null)
  const [pendingVoucherUpdates, setPendingVoucherUpdates] = useState<AiVoucherUpdateState | null>(
    initialChat.pendingVoucherUpdates || null
  )
  const [pendingVoucherReverse, setPendingVoucherReverse] = useState<AiVoucherReverseState | null>(
    initialChat.pendingVoucherReverse || null
  )
  const [pendingVoucherRebook, setPendingVoucherRebook] = useState<AiVoucherRebookState | null>(
    initialChat.pendingVoucherRebook || null
  )
  const [pendingBankLinks, setPendingBankLinks] = useState<AiBankLinkState | null>(
    initialChat.pendingBankLinks || null
  )
  const [pendingInvoiceActions, setPendingInvoiceActions] = useState<AiInvoiceActionState | null>(
    initialChat.pendingInvoiceActions || null
  )
  const [pendingBudgetActions, setPendingBudgetActions] = useState<AiBudgetActionState | null>(
    initialChat.pendingBudgetActions || null
  )
  const [pendingEarmarkActions, setPendingEarmarkActions] = useState<AiEarmarkActionState | null>(
    initialChat.pendingEarmarkActions || null
  )
  const [pendingPlannerQuestion, setPendingPlannerQuestion] =
    useState<AiPlannerQuestionState | null>(initialChat.pendingPlannerQuestion || null)
  const [agentTrace, setAgentTrace] = useState<TAiAgentTraceEvent[]>(initialChat.agentTrace || [])

  const restore = (snapshot: AiChatSnapshot) => {
    setBankReview(snapshot.bankReview || null)
    setPendingMembers(sanitizeMemberState(snapshot.pendingMembers))
    setPendingMemberUpdates(snapshot.pendingMemberUpdates || null)
    setPendingContributionPayment(snapshot.pendingContributionPayment || null)
    setPendingRecurringBooking(snapshot.pendingRecurringBooking || null)
    setPendingContributionLinks(snapshot.pendingContributionLinks || null)
    setPendingTagActions(snapshot.pendingTagActions || null)
    setPendingPartyActions(snapshot.pendingPartyActions || null)
    setPendingVoucherTagActions(snapshot.pendingVoucherTagActions || null)
    setPendingVoucherUpdates(snapshot.pendingVoucherUpdates || null)
    setPendingVoucherReverse(snapshot.pendingVoucherReverse || null)
    setPendingVoucherRebook(snapshot.pendingVoucherRebook || null)
    setPendingBankLinks(snapshot.pendingBankLinks || null)
    setPendingInvoiceActions(snapshot.pendingInvoiceActions || null)
    setPendingBudgetActions(snapshot.pendingBudgetActions || null)
    setPendingEarmarkActions(snapshot.pendingEarmarkActions || null)
    setPendingPlannerQuestion(snapshot.pendingPlannerQuestion || null)
    setAgentTrace(snapshot.agentTrace || [])
  }

  const reset = () => restore({})

  return {
    bankReview,
    setBankReview,
    pendingMembers,
    setPendingMembers,
    pendingMemberUpdates,
    setPendingMemberUpdates,
    pendingContributionPayment,
    setPendingContributionPayment,
    pendingRecurringBooking,
    setPendingRecurringBooking,
    pendingContributionLinks,
    setPendingContributionLinks,
    pendingTagActions,
    setPendingTagActions,
    pendingPartyActions,
    setPendingPartyActions,
    pendingVoucherTagActions,
    setPendingVoucherTagActions,
    pendingVoucherUpdates,
    setPendingVoucherUpdates,
    pendingVoucherReverse,
    setPendingVoucherReverse,
    pendingVoucherRebook,
    setPendingVoucherRebook,
    pendingBankLinks,
    setPendingBankLinks,
    pendingInvoiceActions,
    setPendingInvoiceActions,
    pendingBudgetActions,
    setPendingBudgetActions,
    pendingEarmarkActions,
    setPendingEarmarkActions,
    pendingPlannerQuestion,
    setPendingPlannerQuestion,
    agentTrace,
    setAgentTrace,
    restore,
    reset
  }
}
