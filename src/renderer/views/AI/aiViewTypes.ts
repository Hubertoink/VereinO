import type { AgentMasterDataChange } from './AgentMasterDataChangeCard'
import type { AiInvoiceActionState } from './AgentInvoiceActionCard'
import type { AiVoucherReverseState } from './AgentVoucherReverseCard'
import type { AiVoucherRebookState } from './AgentVoucherRebookCard'
import type { AiVoucherUpdateState } from './AgentVoucherUpdateCard'
import type { AiMessage } from './aiChat'
import type {
  TAiActionPlan,
  TAiAgentTraceEvent,
  TAiBankImportReviewOutput,
  TAiBookingCandidate,
  TBudgetUpsertInput,
  TBindingUpsertInput,
  TPartyUpsertInput,
  TMemberCreateInput,
  TMemberUpdateInput,
  TMembersListOutput,
  TPaymentsListDueOutput,
  TTagsListOutput,
  TVouchersListOutput
} from '../../../../electron/main/ipc/schemas'

export type Notify = (
  type: 'success' | 'error' | 'info',
  text: string,
  duration?: number,
  action?: { label: string; onClick: () => void }
) => void

export type Props = {
  notify: Notify
  onBooked?: () => void
  onBusyChange?: (busy: boolean) => void
}

export type AiMentionOption = {
  id: string
  label: string
  insert: string
  scope: 'Bereich' | 'Tag' | 'Kategorie' | 'Zweckbindung' | 'Zahlungskonto' | 'Sphäre'
  description: string
  plannerHint: string
}

export type AiChatSnapshot = {
  messages?: AiMessage[]
  agentSessionId?: string | null
  selectedJobId?: number | null
  selectedCandidate?: number
  bankReview?: AiBankReviewState | null
  pendingMembers?: AiMemberImportState | null
  pendingMemberUpdates?: AiMemberUpdateState | null
  pendingContributionPayment?: AiContributionPaymentState | null
  pendingRecurringBooking?: AiRecurringBookingState | null
  pendingContributionLinks?: AiContributionLinkState | null
  pendingTagActions?: AiTagActionState | null
  pendingPartyActions?: AiPartyActionState | null
  pendingVoucherTagActions?: AiVoucherTagActionState | null
  pendingVoucherUpdates?: AiVoucherUpdateState | null
  pendingVoucherReverse?: AiVoucherReverseState | null
  pendingVoucherRebook?: AiVoucherRebookState | null
  pendingBankLinks?: AiBankLinkState | null
  pendingInvoiceActions?: AiInvoiceActionState | null
  pendingBudgetActions?: AiBudgetActionState | null
  pendingEarmarkActions?: AiEarmarkActionState | null
  pendingPlannerQuestion?: AiPlannerQuestionState | null
  agentTrace?: TAiAgentTraceEvent[]
}

export type AiBankReviewSuggestion = TAiBankImportReviewOutput['suggestions'][number] & {
  resolved?: 'LINKED' | 'CREATED' | 'CHECKED'
  resolvedVoucherId?: number | null
  resolvedVoucherNo?: string | null
}

export type AiBankReviewState = Omit<TAiBankImportReviewOutput, 'suggestions'> & {
  suggestions: AiBankReviewSuggestion[]
  allSuggestions?: AiBankReviewSuggestion[]
  sourceTotal?: number
  filterSummary?: string | null
}

export type AiBankLinkChange = {
  id: string
  targetKind?: 'VOUCHER' | 'RECURRING'
  bankTransactionId: number
  bankBookingDate?: string | null
  bankDirection?: 'IN' | 'OUT' | string | null
  bankAmount: number
  bankCounterparty?: string | null
  bankPurpose?: string | null
  bankReference?: string | null
  paymentAccountName?: string | null
  voucherId?: number | null
  voucherNo?: string | null
  voucherDate?: string | null
  voucherType?: 'IN' | 'OUT' | string | null
  voucherDescription?: string | null
  voucherGrossAmount: number
  recurringBookingId?: number | null
  recurringBookingName?: string | null
  occurrenceId?: number | null
  scheduledDate?: string | null
  selected: boolean
  applied?: boolean
  error?: string | null
}

export type AiBankLinkState = {
  changes: AiBankLinkChange[]
  reason?: string | null
  warnings?: string[]
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

export type AiMemberDraft = {
  name: string
  birthDate?: string | null
  joinDate: string
  boardRole?: TMemberCreateInput['boardRole']
  contributionAmount?: number | null
  contributionInterval?: TMemberCreateInput['contribution_interval']
  nextDueDate?: string | null
  createdId?: number | null
  createdMemberNo?: string | null
}

export type AiMemberImportState = {
  members: AiMemberDraft[]
  sourcePrompt: string
  status: 'DRAFT' | 'CREATED'
}

export type MemberRow = TMembersListOutput['rows'][number]
export type AiMemberUpdateField = Exclude<keyof TMemberUpdateInput, 'id' | 'tags'>

export type AiMemberUpdateChange = {
  id: string
  memberId: number
  memberName: string
  field: AiMemberUpdateField
  label: string
  oldValue: TMemberUpdateInput[AiMemberUpdateField] | null | undefined
  newValue: TMemberUpdateInput[AiMemberUpdateField] | null | undefined
  oldDisplay: string
  newDisplay: string
  selected: boolean
  applied?: boolean
}

export type AiMemberUpdateState = {
  changes: AiMemberUpdateChange[]
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

export type PaymentDueRow = TPaymentsListDueOutput['rows'][number]

export type AiContributionPaymentState = {
  memberId: number
  memberName: string
  periodKey: string
  interval: TMemberCreateInput['contribution_interval']
  dueAmount: number
  amount: number
  date: string
  description: string
  paymentMethod: TAiBookingCandidate['paymentMethod']
  paymentAccountId?: number | null
  paymentAccountName?: string | null
  tags: string[]
  warnings: string[]
  sourcePrompt: string
  status: 'DRAFT' | 'CREATED'
  voucherId?: number | null
  voucherNo?: string | null
}

export type AiRecurringBookingOccurrence = {
  occurrenceId: number
  scheduledDate: string
  amount: number
  grossAmount?: number
  booked?: boolean
  voucherNo?: string | null
  error?: string | null
}

export type AiRecurringBookingState = {
  recurringBookingId: number
  recurringBookingName: string
  type: 'IN' | 'OUT'
  amountMode: 'NET' | 'GROSS'
  amount: number
  vatRate: number
  paymentAccountId?: number | null
  paymentAccountName?: string | null
  bookingDate?: string | null
  occurrences: AiRecurringBookingOccurrence[]
  totalAmount: number
  reason?: string | null
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

export type AiContributionLinkChange = {
  id: string
  memberId: number
  memberName: string
  periodKey: string
  interval: TMemberCreateInput['contribution_interval']
  amount: number
  voucherId: number
  voucherNo?: string | null
  voucherDate?: string | null
  voucherDescription?: string | null
  voucherGrossAmount?: number | null
  datePaid: string
  selected: boolean
  applied?: boolean
  warnings: string[]
}

export type AiContributionLinkState = {
  changes: AiContributionLinkChange[]
  reason?: string | null
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

export type TagRow = TTagsListOutput['rows'][number]

export type AiTagActionChange = {
  id: string
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  tagId?: number
  name: string
  oldDisplay: string
  newDisplay: string
  color?: string | null
  selected: boolean
  applied?: boolean
}

export type AiTagActionState = {
  changes: AiTagActionChange[]
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

export type AiPartyActionChange = AgentMasterDataChange & {
  partyId?: number | null
  payload?: TPartyUpsertInput | null
}

export type AiPartyActionState = {
  changes: AiPartyActionChange[]
  reason?: string | null
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

export type AiBudgetActionChange = AgentMasterDataChange & {
  budgetId?: number | null
  payload?: TBudgetUpsertInput | null
}

export type AiBudgetActionState = {
  changes: AiBudgetActionChange[]
  reason?: string | null
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

export type AiEarmarkActionChange = AgentMasterDataChange & {
  earmarkId?: number | null
  payload?: TBindingUpsertInput | null
}

export type AiEarmarkActionState = {
  changes: AiEarmarkActionChange[]
  reason?: string | null
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

export type VoucherRow = TVouchersListOutput['rows'][number]

export type AiVoucherTagActionChange = {
  id: string
  voucherId: number
  voucherNo: string
  date: string
  description?: string | null
  oldTags: string[]
  newTags: string[]
  addedTags: string[]
  selected: boolean
  applied?: boolean
}

export type AiVoucherTagActionState = {
  changes: AiVoucherTagActionChange[]
  sourceTag: string
  addedTags: string[]
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

export type AiPlannerQuestionOption = {
  id: 'CREATE_TAGS_AND_BOOK_ALL' | 'BOOK_ALL_WITHOUT_NEW_TAGS' | 'CREATE_TAGS_ONLY' | 'CANCEL'
  label: string
  description: string
}

export type AiPlannerQuestionState = {
  id: string
  kind: 'BOOKING_REVIEW_MISSING_TAGS'
  question: string
  body: string
  options: AiPlannerQuestionOption[]
  sourcePrompt: string
  plan: TAiActionPlan
  missingTags: string[]
  status: 'OPEN' | 'RESOLVED'
}
