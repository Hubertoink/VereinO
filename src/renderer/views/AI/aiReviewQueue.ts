import type { AgentReviewQueueItem } from './AgentReviewQueue'
import type { AiChatSnapshot } from './aiViewTypes'
import type {
  TAiJobsGetOutput,
  TAiBookingAnalysisResult
} from '../../../../electron/main/ipc/schemas'
import { isCandidateApproved } from './aiBooking'

type ReviewQueueState = Pick<
  AiChatSnapshot,
  | 'bankReview'
  | 'pendingBankLinks'
  | 'pendingBudgetActions'
  | 'pendingContributionPayment'
  | 'pendingRecurringBooking'
  | 'pendingContributionLinks'
  | 'pendingEarmarkActions'
  | 'pendingInvoiceActions'
  | 'pendingMembers'
  | 'pendingMemberUpdates'
  | 'pendingPartyActions'
  | 'pendingPlannerQuestion'
  | 'pendingTagActions'
  | 'pendingVoucherRebook'
  | 'pendingVoucherReverse'
  | 'pendingVoucherTagActions'
  | 'pendingVoucherUpdates'
> & {
  selectedJob?: TAiJobsGetOutput | null
  analysis?: TAiBookingAnalysisResult | null
}

export function buildAiReviewQueue({
  analysis,
  bankReview,
  pendingBankLinks,
  pendingBudgetActions,
  pendingContributionPayment,
  pendingRecurringBooking,
  pendingContributionLinks,
  pendingEarmarkActions,
  pendingInvoiceActions,
  pendingMembers,
  pendingMemberUpdates,
  pendingPartyActions,
  pendingPlannerQuestion,
  pendingTagActions,
  pendingVoucherRebook,
  pendingVoucherReverse,
  pendingVoucherTagActions,
  pendingVoucherUpdates,
  selectedJob
}: ReviewQueueState): AgentReviewQueueItem[] {
  const items: AgentReviewQueueItem[] = []
  if (pendingPlannerQuestion?.status === 'OPEN') {
    items.push({
      id: 'planner-question',
      title: pendingPlannerQuestion.question,
      summary: pendingPlannerQuestion.body,
      status: 'WAITING',
      count: pendingPlannerQuestion.options.length,
      anchorId: 'ai-review-planner-question'
    })
  }
  if (pendingMembers) {
    items.push({
      id: 'member-create',
      title: 'Mitgliederanlage',
      summary:
        pendingMembers.status === 'CREATED'
          ? 'Mitglieder wurden angelegt.'
          : 'Neue Mitglieder warten auf Freigabe.',
      status: pendingMembers.status === 'CREATED' ? 'DONE' : 'OPEN',
      count: pendingMembers.members.length,
      anchorId: 'ai-review-members'
    })
  }
  if (pendingMemberUpdates) {
    items.push({
      id: 'member-update',
      title: 'Mitgliederänderungen',
      summary:
        pendingMemberUpdates.status === 'APPLIED'
          ? 'Änderungen wurden übernommen.'
          : 'Mitgliedsdaten warten auf Review.',
      status: pendingMemberUpdates.status === 'APPLIED' ? 'DONE' : 'OPEN',
      count: pendingMemberUpdates.changes.length,
      anchorId: 'ai-review-member-updates'
    })
  }
  if (pendingContributionPayment) {
    items.push({
      id: 'contribution-payment',
      title: 'Beitragsbuchung',
      summary: pendingContributionPayment.description,
      status: pendingContributionPayment.status === 'CREATED' ? 'DONE' : 'OPEN',
      count: 1,
      anchorId: 'ai-review-contribution-payment'
    })
  }
  if (pendingRecurringBooking) {
    const openOccurrences = pendingRecurringBooking.occurrences.filter(
      (occurrence) => !occurrence.booked
    )
    items.push({
      id: 'recurring-booking',
      title: 'Dauerbuchungen',
      summary:
        pendingRecurringBooking.status === 'APPLIED'
          ? 'Fällige Ausführungen wurden gebucht.'
          : 'Fällige Ausführungen warten auf eine Sammelbestätigung.',
      status: pendingRecurringBooking.status === 'APPLIED' ? 'DONE' : 'OPEN',
      count: openOccurrences.length || pendingRecurringBooking.occurrences.length,
      anchorId: 'ai-review-recurring-booking'
    })
  }
  if (pendingContributionLinks) {
    const openLinks = pendingContributionLinks.changes.filter(
      (change) => change.selected && !change.applied
    ).length
    items.push({
      id: 'contribution-links',
      title: 'Beitrags-Verknüpfungen',
      summary:
        pendingContributionLinks.status === 'APPLIED'
          ? 'Beitragszeiträume wurden verknüpft.'
          : 'Vorhandene Buchungen warten auf Verknüpfung.',
      status: pendingContributionLinks.status === 'APPLIED' ? 'DONE' : 'OPEN',
      count: openLinks || pendingContributionLinks.changes.length,
      anchorId: 'ai-review-contribution-links'
    })
  }
  if (pendingTagActions) {
    items.push({
      id: 'tag-actions',
      title: 'Tag-Änderungen',
      summary:
        pendingTagActions.status === 'APPLIED'
          ? 'Tag-Änderungen wurden übernommen.'
          : 'Tags warten auf Freigabe.',
      status: pendingTagActions.status === 'APPLIED' ? 'DONE' : 'OPEN',
      count: pendingTagActions.changes.length,
      anchorId: 'ai-review-tag-actions'
    })
  }
  if (pendingPartyActions) {
    items.push({
      id: 'party-actions',
      title: 'Geschäftspartner',
      summary:
        pendingPartyActions.status === 'APPLIED'
          ? 'Geschäftspartner-Änderungen wurden übernommen.'
          : pendingPartyActions.reason || 'Geschäftspartner warten auf Freigabe.',
      status: pendingPartyActions.status === 'APPLIED' ? 'DONE' : 'OPEN',
      count: pendingPartyActions.changes.length,
      anchorId: 'ai-review-party-actions'
    })
  }
  if (pendingVoucherTagActions) {
    items.push({
      id: 'voucher-tag-actions',
      title: 'Buchungs-Tags',
      summary: `Ergänzen: ${pendingVoucherTagActions.addedTags.join(', ')}`,
      status: pendingVoucherTagActions.status === 'APPLIED' ? 'DONE' : 'OPEN',
      count: pendingVoucherTagActions.changes.length,
      anchorId: 'ai-review-voucher-tags'
    })
  }
  if (pendingVoucherUpdates) {
    items.push({
      id: 'voucher-updates',
      title: 'Agent-Buchungsreview',
      summary: pendingVoucherUpdates.reason || 'Buchungsmetadaten warten auf Review.',
      status: pendingVoucherUpdates.status === 'APPLIED' ? 'DONE' : 'OPEN',
      count: pendingVoucherUpdates.changes.length,
      anchorId: 'ai-review-voucher-updates'
    })
  }
  if (pendingVoucherReverse) {
    items.push({
      id: 'voucher-reverse',
      title: 'Storno-Review',
      summary: pendingVoucherReverse.reason || 'Buchungen warten auf Storno-Freigabe.',
      status: pendingVoucherReverse.status === 'APPLIED' ? 'DONE' : 'OPEN',
      count: pendingVoucherReverse.vouchers.length,
      anchorId: 'ai-review-voucher-reverse'
    })
  }
  if (pendingVoucherRebook) {
    items.push({
      id: 'voucher-rebook',
      title: 'Storno & Ersatzbuchung',
      summary:
        pendingVoucherRebook.reason ||
        `${pendingVoucherRebook.original.voucherNo || `#${pendingVoucherRebook.original.id}`} wird korrigiert neu angelegt.`,
      status: pendingVoucherRebook.status === 'APPLIED' ? 'DONE' : 'OPEN',
      count: 1,
      anchorId: 'ai-review-voucher-rebook'
    })
  }
  if (pendingBankLinks) {
    const openLinks = pendingBankLinks.changes.filter(
      (change) => change.selected && !change.applied
    ).length
    items.push({
      id: 'bank-links',
      title: 'Bankbelege verknüpfen',
      summary:
        pendingBankLinks.status === 'APPLIED'
          ? 'Bankbelege wurden verknüpft.'
          : pendingBankLinks.reason || 'Bankbelege warten auf Verknüpfung mit Buchungen.',
      status: pendingBankLinks.status === 'APPLIED' ? 'DONE' : 'OPEN',
      count: openLinks || pendingBankLinks.changes.length,
      anchorId: 'ai-review-bank-links'
    })
  }
  if (pendingInvoiceActions) {
    items.push({
      id: 'invoice-actions',
      title: 'Forderungen & Verbindlichkeiten',
      summary: pendingInvoiceActions.reason || 'Offene Posten warten auf Freigabe.',
      status: pendingInvoiceActions.status === 'APPLIED' ? 'DONE' : 'OPEN',
      count: pendingInvoiceActions.changes.length,
      anchorId: 'ai-review-invoice-actions'
    })
  }
  if (pendingBudgetActions) {
    items.push({
      id: 'budget-actions',
      title: 'Budget-Stammdaten',
      summary: pendingBudgetActions.reason || 'Budgets warten auf Freigabe.',
      status: pendingBudgetActions.status === 'APPLIED' ? 'DONE' : 'OPEN',
      count: pendingBudgetActions.changes.length,
      anchorId: 'ai-review-budget-actions'
    })
  }
  if (pendingEarmarkActions) {
    items.push({
      id: 'earmark-actions',
      title: 'Zweckbindungen',
      summary: pendingEarmarkActions.reason || 'Zweckbindungen warten auf Freigabe.',
      status: pendingEarmarkActions.status === 'APPLIED' ? 'DONE' : 'OPEN',
      count: pendingEarmarkActions.changes.length,
      anchorId: 'ai-review-earmark-actions'
    })
  }
  if (bankReview) {
    const openBankReviews = bankReview.suggestions.filter(
      (suggestion) => !suggestion.resolved
    ).length
    items.push({
      id: 'bank-review',
      title: 'Bankimport-Vorschläge',
      summary: bankReview.filterSummary || 'Banktransaktionen warten auf Prüfung.',
      status: openBankReviews ? 'OPEN' : 'DONE',
      count: openBankReviews || bankReview.suggestions.length,
      anchorId: 'ai-review-bank'
    })
  }
  if (selectedJob && analysis) {
    const openCandidates = analysis.candidates.filter(
      (item) => !isCandidateApproved(item, selectedJob)
    ).length
    items.push({
      id: `booking-review-${selectedJob.id}`,
      title: selectedJob.title || `Buchungsvorschlag #${selectedJob.id}`,
      summary: openCandidates
        ? 'Buchungsvorschläge warten auf Review.'
        : 'Alle Vorschläge wurden verarbeitet.',
      status: openCandidates ? 'OPEN' : 'DONE',
      count: openCandidates || analysis.candidates.length,
      anchorId: 'ai-review-booking'
    })
  }
  return items
}
