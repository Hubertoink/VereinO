import React, { useCallback, useEffect, useMemo, useState } from 'react'
import './AIView.css'
import { dispatchDataChanged } from '../../utils/refresh'
import { AgentRuntimePanel } from './AgentRuntimePanel'
import { AiRulesCatalog } from './AiRulesCatalog'
import { AgentMasterDataChangeCard, type AgentMasterDataChange } from './AgentMasterDataChangeCard'
import { AgentReviewQueue, type AgentReviewQueueItem } from './AgentReviewQueue'
import {
  AgentInvoiceActionCard,
  type AiInvoiceActionChange,
  type AiInvoiceActionState
} from './AgentInvoiceActionCard'
import { AgentVoucherReverseCard, type AiVoucherReverseState } from './AgentVoucherReverseCard'
import { AgentVoucherRebookCard, type AiVoucherRebookState } from './AgentVoucherRebookCard'
import {
  AgentVoucherUpdateCard,
  type AiVoucherUpdateChange,
  type AiVoucherUpdateState
} from './AgentVoucherUpdateCard'
import { useAiAgentWorkflow } from './useAiAgentWorkflow'
import { useAiComposer } from './useAiComposer'
import { useAiMessages } from './useAiMessages'
import { useAiAvatar } from './useAiAvatar'
import { useAiDrawers } from './useAiDrawers'
import { buildAiReviewQueue } from './aiReviewQueue'
import { buildReportKpiData } from './aiReportData'
import { buildAiConversationPrompt } from './aiConversation'
import { useAiReviewState } from './useAiReviewState'
import { AiAssistantHeader } from './AiAssistantHeader'
import { prepareAiAgentDraft } from './aiAgentDrafts'
import { useAiAgentKnowledge } from './useAiAgentKnowledge'
import { buildAiMentionOptions } from './aiReferenceData'
import { useAiJobs } from './useAiJobs'
import { routeDefaultAiPrompt } from './aiPromptRouter'
import { AiComposer } from './AiComposer'
import { useAiSettings } from './useAiSettings'
import { useAiHistoryActions } from './useAiHistoryActions'
import { openReviewWorkflowIds } from './reviewWorkflowState'
import { CandidateEditor } from './CandidateEditor'
import type { AiVoucherMention } from './AiMarkdown'
import { AiSettingsDrawer } from './AiSettingsDrawer'
import { AiHistoryDrawer } from './AiHistoryDrawer'
import { AiMessageList } from './AiMessageList'
import { AiBankReviewCard } from './AiBankReviewCard'
import { AiBankLinkReviewCard } from './AiBankLinkReviewCard'
import { AiTagActionReviewCard, AiVoucherTagReviewCard } from './AiTagReviewCards'
import { AiPlannerQuestionCard } from './AiPlannerQuestionCard'
import {
  AiContributionLinkReviewCard,
  AiContributionPaymentReviewCard,
  AiMemberImportReviewCard,
  AiMemberUpdateReviewCard,
  AiRecurringBookingReviewCard
} from './AiMemberReviewCards'
import {
  clearAiChatSnapshot,
  readAiChatSnapshot,
  writeAiChatSnapshot,
  type AiMessage
} from './aiChat'
import type {
  AiBankLinkChange,
  AiBankLinkState,
  AiBankReviewState,
  AiBankReviewSuggestion,
  AiBudgetActionChange,
  AiBudgetActionState,
  AiChatSnapshot,
  AiContributionLinkChange,
  AiContributionLinkState,
  AiContributionPaymentState,
  AiEarmarkActionChange,
  AiEarmarkActionState,
  AiMemberDraft,
  AiMemberImportState,
  AiMemberUpdateChange,
  AiMemberUpdateField,
  AiMemberUpdateState,
  AiMentionOption,
  AiPartyActionChange,
  AiPartyActionState,
  AiPlannerQuestionOption,
  AiPlannerQuestionState,
  AiRecurringBookingOccurrence,
  AiRecurringBookingState,
  AiTagActionChange,
  AiTagActionState,
  AiVoucherTagActionChange,
  AiVoucherTagActionState,
  MemberRow,
  Notify,
  PaymentDueRow,
  Props,
  TagRow,
  VoucherRow
} from './aiViewTypes'
import {
  boardRoleLabel,
  boardRoleFromText,
  buildMemberUpdateDraft,
  displayMemberValue,
  findPaymentAccountHint,
  intervalLabel,
  memberStatusLabel,
  parseContributionHint,
  parseMemberContributionAmount,
  parseMemberDraftsFromText,
  sanitizeMemberState,
  sanitizeMemberDrafts,
  shouldApplyAccountHintToAll,
  wantsApplyPendingMemberUpdates,
  wantsContextualBookingLink,
  wantsContributionDueRead,
  wantsContributionPaymentAction,
  wantsCreatePendingMembers,
  wantsMemberCreation,
  wantsMemberRead,
  wantsMemberUpdate
} from './aiMemberDomain'
import {
  findPlanArg,
  findPlanChange,
  findPlanFilter,
  memberStateFromPlan,
  normalizePlanKey,
  parsePlanAmount,
  parsePlanDate,
  planItemValue,
  planValueList,
  planValueString
} from './aiPlanDomain'
import {
  cleanTagCandidateName,
  extractTagNamesFromText,
  extractVoucherTagAppendRequest,
  extractVoucherTagCorrection,
  isLikelyTagName,
  isVereinRelevantPrompt,
  parseReportExportRequest,
  resolveExistingTagName,
  routeTextType,
  shouldProcessFilesAsBookingDocuments,
  tagColorForName,
  tagPromptFromPlan,
  voucherTagPromptFromPlan,
  wantsApplyPendingTagActions,
  wantsApplyPendingVoucherActions,
  wantsBankImportReview,
  wantsModifyPendingReview,
  wantsReportExport,
  wantsTagAction,
  wantsTagRead,
  wantsVoucherTagAction
} from './aiPromptIntents'
import {
  bankReviewBody,
  extractBankSuggestionsFromAiText,
  filterBankReviewByAiText
} from './aiBankReview'
import { AI_PROVIDER_OPTIONS } from './aiSettings'
import { STATIC_AI_MENTIONS, buildMentionPlannerHint } from './aiMentions'
import {
  bookingAnalysis,
  candidateSourceLabel,
  firstOpenCandidateIndex,
  hasOpenBookingCandidates,
  isCandidateApproved,
  paymentMethodForAccount,
  type PaymentAccountOption
} from './aiBooking'
import {
  formatIsoDate,
  isoDate,
  normalizeLookup,
  parseGermanDate,
  statusLabel,
  typeLabel,
  warningClassName
} from './aiText'
import type {
  TAiActionPlan,
  TAiAgentAutoRulesListOutput,
  TAiAgentMemoryListOutput,
  TAiAgentRunOutput,
  TAiAgentTraceEvent,
  TAiBankImportReviewOutput,
  TAiBookingAnalysisResult,
  TAiBookingCandidate,
  TAiJobsGetOutput,
  TAiJobsListOutput,
  TAiSettingsGetOutput,
  TAiTextGenerateInput,
  TTagUpsertInput,
  TTagsListOutput,
  TBudgetUpsertInput,
  TBindingUpsertInput,
  TPartyUpsertInput,
  TMemberCreateInput,
  TMemberUpdateInput,
  TMembersListOutput,
  TPaymentsListDueOutput,
  TInvoiceCreateInput,
  TVoucherMetaUpdateInput,
  TVoucherCreateInput,
  TVouchersListOutput,
  TReportsExportInput
} from '../../../../electron/main/ipc/schemas'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const usd = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 4
})

const PROMPT_EXAMPLES = [
  'Lies diese Rechnung aus und erstelle einen Buchungsvorschlag.',
  'Schreibe eine Einladung an alle Mitglieder für das Sommerfest.',
  'Prüfe offene Bankimport-Belege und schlage Zuordnungen vor.',
  'Welche Tags und Kategorien haben wir angelegt?',
  'Exportiere einen Controllingbericht für das Jahr 2026 als PDF.',
  'Setze bei allen aktiven Mitgliedern den Beitrag auf 20 € monatlich.',
  'Prüfe diese Exceldatei und bereite einen Importvorschlag vor.'
]

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.readAsDataURL(file)
  })
}

function formatAiUsage(usage?: TAiJobsGetOutput['usage'] | null) {
  if (!usage) return ''
  const tokens = Number(usage.totalTokens || 0).toLocaleString('de-DE')
  const cost =
    usage.estimatedCostUsd == null ? 'Kosten n/a' : usd.format(Number(usage.estimatedCostUsd || 0))
  return `${tokens} Tokens · ${cost}`
}

export default function AiAssistantController({ notify, onBooked, onBusyChange }: Props) {
  const {
    historyButtonRef,
    agentContextButtonRef,
    settingsButtonRef,
    rulesButtonRef,
    historyDrawerRef,
    agentContextDrawerRef,
    settingsDrawerRef,
    rulesDrawerRef,
    showHistory,
    showAgentContext,
    showSettings,
    showRules,
    setShowHistory,
    setShowAgentContext,
    setShowSettings,
    setShowRules,
    dispatchDrawer
  } = useAiDrawers()
  const [initialChat] = useState<AiChatSnapshot>({})
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null)
  const [chatSnapshotReady, setChatSnapshotReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const {
    settings,
    setSettings,
    apiKey,
    connectionTest,
    providerModelOptions,
    loadSettings,
    saveSettings,
    testConnection,
    handleProviderChange,
    updateApiKey,
    invalidateConnection
  } = useAiSettings(notify, setBusy)
  const {
    jobs,
    selectedJob,
    setSelectedJob,
    selectedJobId,
    setSelectedJobId,
    selectedCandidate,
    setSelectedCandidate,
    loadJobs,
    selectJob
  } = useAiJobs(notify, initialChat.selectedJobId, initialChat.selectedCandidate || 0)
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccountOption[]>([])
  const [mentionOptions, setMentionOptions] = useState<AiMentionOption[]>(STATIC_AI_MENTIONS)
  const {
    fileInputRef,
    promptInputRef,
    files,
    setFiles,
    filePreviews,
    prompt,
    setPrompt,
    setPromptCursor,
    visibleMentions,
    isDraggingFiles,
    appendFiles,
    removeFile,
    syncPromptCursor,
    insertMention,
    handleComposerDragEnter,
    handleComposerDragOver,
    handleComposerDragLeave,
    handleComposerDrop
  } = useAiComposer(notify, mentionOptions)
  const { messages, setMessages, pushMessage } = useAiMessages(initialChat.messages)
  const {
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
    restore: restoreReviewState,
    reset: resetReviewState
  } = useAiReviewState({ initialChat, sanitizeMemberState })
  const { agentMemory, agentAutoRules, loadAgentKnowledge } = useAiAgentKnowledge()
  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  const hasOpenReviewWorkflow = () =>
    !!selectedJob ||
    !!bankReview ||
    openReviewWorkflowIds([
      { id: 'member-create', state: pendingMembers, terminalStatuses: ['CREATED'] },
      { id: 'member-update', state: pendingMemberUpdates, terminalStatuses: ['APPLIED'] },
      {
        id: 'contribution-payment',
        state: pendingContributionPayment,
        terminalStatuses: ['CREATED']
      },
      { id: 'recurring-booking', state: pendingRecurringBooking, terminalStatuses: ['APPLIED'] },
      { id: 'contribution-links', state: pendingContributionLinks, terminalStatuses: ['APPLIED'] },
      { id: 'tag-actions', state: pendingTagActions, terminalStatuses: ['APPLIED'] },
      { id: 'party-actions', state: pendingPartyActions, terminalStatuses: ['APPLIED'] },
      { id: 'voucher-tag-actions', state: pendingVoucherTagActions, terminalStatuses: ['APPLIED'] },
      { id: 'voucher-updates', state: pendingVoucherUpdates, terminalStatuses: ['APPLIED'] },
      { id: 'voucher-reverse', state: pendingVoucherReverse, terminalStatuses: ['APPLIED'] },
      { id: 'voucher-rebook', state: pendingVoucherRebook, terminalStatuses: ['APPLIED'] },
      { id: 'bank-links', state: pendingBankLinks, terminalStatuses: ['APPLIED'] },
      { id: 'invoice-actions', state: pendingInvoiceActions, terminalStatuses: ['APPLIED'] },
      { id: 'budget-actions', state: pendingBudgetActions, terminalStatuses: ['APPLIED'] },
      { id: 'earmark-actions', state: pendingEarmarkActions, terminalStatuses: ['APPLIED'] },
      { id: 'planner-question', state: pendingPlannerQuestion, terminalStatuses: ['RESOLVED'] }
    ]).length > 0

  const prepareAgentDraft = (draft: TAiAgentRunOutput['drafts'][number], userPrompt: string) =>
    prepareAiAgentDraft({
      draft,
      userPrompt,
      pushMessage,
      setPendingRecurringBooking,
      setPendingVoucherReverse,
      setPendingVoucherRebook,
      setPendingBankLinks,
      setPendingVoucherUpdates,
      setPendingMemberUpdates,
      setPendingContributionLinks,
      setPendingInvoiceActions,
      setPendingTagActions,
      setPendingPartyActions,
      setPendingBudgetActions,
      setPendingEarmarkActions
    })

  const updateAgentTrace = (trace: TAiAgentTraceEvent[]) => {
    setAgentTrace(trace)
    void loadAgentKnowledge()
  }

  const agentUiContext = useMemo(() => {
    const jobAnalysis = bookingAnalysis(selectedJob)
    const openBookingCandidates =
      selectedJob && jobAnalysis
        ? jobAnalysis.candidates
            .map((item, idx) => ({ item, idx }))
            .filter(({ item }) => !isCandidateApproved(item, selectedJob))
        : []
    return {
      openReviewSummary: {
        selectedJobId,
        selectedCandidate,
        bookingCandidates: openBookingCandidates.length,
        bankSuggestions:
          bankReview?.suggestions.filter((suggestion) => !suggestion.resolved).length || 0,
        memberCreate: pendingMembers
          ? { status: pendingMembers.status, count: pendingMembers.members.length }
          : null,
        memberUpdate: pendingMemberUpdates
          ? {
              status: pendingMemberUpdates.status,
              count: pendingMemberUpdates.changes.length,
              fields: Array.from(
                new Set(pendingMemberUpdates.changes.map((change) => change.field))
              ),
              sample: pendingMemberUpdates.changes.slice(0, 30).map((change) => ({
                memberId: change.memberId,
                memberName: change.memberName,
                field: change.field,
                oldDisplay: change.oldDisplay,
                newDisplay: change.newDisplay,
                selected: change.selected,
                applied: !!change.applied
              }))
            }
          : null,
        contributionPayment: pendingContributionPayment
          ? {
              status: pendingContributionPayment.status,
              memberName: pendingContributionPayment.memberName,
              amount: pendingContributionPayment.amount
            }
          : null,
        recurringBooking: pendingRecurringBooking
          ? {
              status: pendingRecurringBooking.status,
              name: pendingRecurringBooking.recurringBookingName,
              count: pendingRecurringBooking.occurrences.length,
              openCount: pendingRecurringBooking.occurrences.filter(
                (occurrence) => !occurrence.booked
              ).length,
              totalAmount: pendingRecurringBooking.totalAmount
            }
          : null,
        contributionLinks: pendingContributionLinks
          ? {
              status: pendingContributionLinks.status,
              count: pendingContributionLinks.changes.length,
              sample: pendingContributionLinks.changes.slice(0, 20).map((change) => ({
                memberId: change.memberId,
                memberName: change.memberName,
                periodKey: change.periodKey,
                voucherId: change.voucherId,
                voucherNo: change.voucherNo,
                selected: change.selected,
                applied: !!change.applied
              }))
            }
          : null,
        tagActions: pendingTagActions
          ? { status: pendingTagActions.status, count: pendingTagActions.changes.length }
          : null,
        partyActions: pendingPartyActions
          ? {
              status: pendingPartyActions.status,
              count: pendingPartyActions.changes.length,
              sample: pendingPartyActions.changes.slice(0, 30).map((change) => ({
                action: change.action,
                partyId: change.partyId,
                name: change.name,
                selected: change.selected,
                applied: !!change.applied
              }))
            }
          : null,
        voucherTagActions: pendingVoucherTagActions
          ? {
              status: pendingVoucherTagActions.status,
              count: pendingVoucherTagActions.changes.length
            }
          : null,
        voucherUpdates: pendingVoucherUpdates
          ? {
              status: pendingVoucherUpdates.status,
              count: pendingVoucherUpdates.changes.length,
              sample: pendingVoucherUpdates.changes.slice(0, 40).map((change) => ({
                voucherId: change.voucherId,
                voucherNo: change.voucherNo,
                date: change.date,
                description: change.description,
                grossAmount: change.grossAmount,
                oldBudgetId: change.oldBudgetId,
                oldBudgetLabel: change.oldBudgetLabel,
                newBudgetId: change.newBudgetId,
                newBudgetLabel: change.newBudgetLabel,
                newBudgets: change.newBudgets || [],
                oldTags: change.oldTags || [],
                newTags: change.newTags || [],
                selected: change.selected,
                applied: !!change.applied
              }))
            }
          : null,
        voucherReverse: pendingVoucherReverse
          ? { status: pendingVoucherReverse.status, count: pendingVoucherReverse.vouchers.length }
          : null,
        voucherRebook: pendingVoucherRebook
          ? {
              status: pendingVoucherRebook.status,
              original: pendingVoucherRebook.original.voucherNo || pendingVoucherRebook.original.id
            }
          : null,
        bankLinks: pendingBankLinks
          ? {
              status: pendingBankLinks.status,
              reason: pendingBankLinks.reason || null,
              count: pendingBankLinks.changes.length,
              sample: pendingBankLinks.changes.slice(0, 30).map((change) => ({
                bankTransactionId: change.bankTransactionId,
                bankCounterparty: change.bankCounterparty,
                bankPurpose: change.bankPurpose,
                bankAmount: change.bankAmount,
                voucherId: change.voucherId,
                voucherNo: change.voucherNo,
                voucherDescription: change.voucherDescription,
                targetKind: change.targetKind,
                recurringBookingId: change.recurringBookingId,
                recurringBookingName: change.recurringBookingName,
                occurrenceId: change.occurrenceId,
                scheduledDate: change.scheduledDate,
                selected: change.selected,
                applied: !!change.applied
              }))
            }
          : null,
        invoiceActions: pendingInvoiceActions
          ? {
              status: pendingInvoiceActions.status,
              reason: pendingInvoiceActions.reason || null,
              count: pendingInvoiceActions.changes.length,
              sample: pendingInvoiceActions.changes.slice(0, 20).map((change) => ({
                action: change.action,
                selected: change.selected,
                applied: !!change.applied,
                createdId: change.createdId ?? null,
                invoice: change.invoice
              }))
            }
          : null,
        budgetActions: pendingBudgetActions
          ? {
              status: pendingBudgetActions.status,
              count: pendingBudgetActions.changes.length,
              sample: pendingBudgetActions.changes.slice(0, 30).map((change) => ({
                action: change.action,
                budgetId: change.budgetId,
                name: budgetLabelFromChange(change),
                selected: change.selected,
                applied: !!change.applied
              }))
            }
          : null,
        earmarkActions: pendingEarmarkActions
          ? { status: pendingEarmarkActions.status, count: pendingEarmarkActions.changes.length }
          : null,
        plannerQuestion:
          pendingPlannerQuestion?.status === 'OPEN'
            ? {
                question: pendingPlannerQuestion.question,
                missingTags: pendingPlannerQuestion.missingTags
              }
            : null
      },
      activeBookingReview: openBookingCandidates.length
        ? {
            jobId: selectedJob?.id,
            title: selectedJob?.title,
            openCandidateCount: openBookingCandidates.length,
            candidates: openBookingCandidates.slice(0, 20).map(({ item, idx }) => ({
              index: idx,
              date: item.date,
              type: item.type,
              sphere: item.sphere,
              grossAmount: item.grossAmount,
              paymentAccountId: item.paymentAccountId,
              description: item.description,
              tags: item.tags || [],
              warnings: item.warnings || []
            }))
          }
        : null,
      recentMessages: messages.slice(-8).map((message) => ({
        role: message.role,
        title: message.title || null,
        meta: message.meta || null,
        body: message.body.slice(0, 12000)
      }))
    }
  }, [
    bankReview,
    messages,
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
    selectedCandidate,
    selectedJob,
    selectedJobId
  ])

  const {
    agentSessionId,
    resetAgentSession,
    restoreAgentSession,
    shouldUseAgentRuntime,
    runAgentRuntime
  } = useAiAgentWorkflow({
    initialSessionId: initialChat.agentSessionId || null,
    filesLength: files.length,
    hasOpenReviewWorkflow,
    selectedJobId,
    selectedCandidate,
    formatUsage: formatAiUsage,
    pushMessage,
    prepareAgentDraft,
    onTrace: updateAgentTrace,
    getUiContext: () => agentUiContext
  })

  const loadPaymentAccounts = useCallback(async () => {
    try {
      const result = await window.api.paymentAccounts.list({ activeOnly: true })
      setPaymentAccounts((result.rows || []) as PaymentAccountOption[])
    } catch (error: any) {
      notify('error', error?.message || String(error))
    }
  }, [notify])

  const loadMentionOptions = useCallback(async () => {
    try {
      const [tags, budgets, bindings, accounts] = await Promise.all([
        window.api.tags.list({ includeUsage: true }),
        window.api.budgets.list({ includeArchived: true }),
        window.api.bindings.list({ activeOnly: false }),
        window.api.paymentAccounts.list({ activeOnly: true })
      ])
      setMentionOptions(
        buildAiMentionOptions({
          tags: (tags.rows || []) as TagRow[],
          budgets: budgets.rows || [],
          bindings: bindings.rows || [],
          accounts: (accounts.rows || []) as PaymentAccountOption[]
        })
      )
    } catch {
      setMentionOptions(STATIC_AI_MENTIONS)
    }
  }, [])

  const { markHistoryJobDone, deleteHistoryJob } = useAiHistoryActions({
    selectedJobId,
    selectJob,
    loadJobs,
    notify,
    setBusy
  })

  useEffect(() => {
    let cancelled = false

    const restoreOrganizationChat = async (organizationId?: string | null) => {
      let resolvedOrganizationId = organizationId || null
      if (!resolvedOrganizationId) {
        try {
          const result = await window.api.organizations.active()
          resolvedOrganizationId = result.organization?.id || null
        } catch {
          resolvedOrganizationId = null
        }
      }
      if (cancelled || !resolvedOrganizationId) return

      const snapshot = readAiChatSnapshot<AiChatSnapshot>(resolvedOrganizationId)
      setChatSnapshotReady(false)
      setActiveOrganizationId(resolvedOrganizationId)
      setMessages(snapshot.messages || [])
      restoreAgentSession(snapshot.agentSessionId)
      setSelectedJob(null)
      setSelectedJobId(snapshot.selectedJobId || null)
      setSelectedCandidate(snapshot.selectedCandidate || 0)
      restoreReviewState(snapshot)
      setFiles([])
      setPrompt('')
      setShowHistory(false)
      setShowAgentContext(false)
      setShowSettings(false)
      setShowRules(false)
      setChatSnapshotReady(true)

      void loadSettings()
      void loadJobs()
      void loadPaymentAccounts()
      void loadMentionOptions()
      void loadAgentKnowledge()
    }

    void restoreOrganizationChat()
    const off = window.api.organizations.onSwitched((organization) => {
      void restoreOrganizationChat(organization.id)
    })
    return () => {
      cancelled = true
      off?.()
    }
  }, [
    loadAgentKnowledge,
    loadJobs,
    loadMentionOptions,
    loadPaymentAccounts,
    loadSettings,
    restoreAgentSession
  ])

  useEffect(() => {
    if (!selectedJobId || selectedJob?.id === selectedJobId) return
    let cancelled = false
    window.api.ai.jobs
      .get({ id: selectedJobId })
      .then((job) => {
        if (!cancelled) setSelectedJob(job)
      })
      .catch((error: any) => {
        if (!cancelled) notify('error', error?.message || String(error))
      })
    return () => {
      cancelled = true
    }
  }, [notify, selectedJob?.id, selectedJobId])

  useEffect(() => {
    if (
      !chatSnapshotReady ||
      !activeOrganizationId ||
      messages.some((message) => message.isStreaming)
    )
      return
    writeAiChatSnapshot(
      {
        messages,
        agentSessionId,
        selectedJobId,
        selectedCandidate,
        bankReview,
        pendingMembers,
        pendingMemberUpdates,
        pendingContributionPayment,
        pendingRecurringBooking,
        pendingContributionLinks,
        pendingTagActions,
        pendingPartyActions,
        pendingVoucherTagActions,
        pendingVoucherUpdates,
        pendingVoucherReverse,
        pendingVoucherRebook,
        pendingBankLinks,
        pendingInvoiceActions,
        pendingBudgetActions,
        pendingEarmarkActions,
        pendingPlannerQuestion,
        agentTrace
      },
      activeOrganizationId
    )
  }, [
    activeOrganizationId,
    agentSessionId,
    agentTrace,
    bankReview,
    messages,
    pendingBudgetActions,
    pendingBankLinks,
    pendingContributionPayment,
    pendingContributionLinks,
    pendingEarmarkActions,
    pendingInvoiceActions,
    pendingMembers,
    pendingMemberUpdates,
    pendingPartyActions,
    pendingPlannerQuestion,
    pendingRecurringBooking,
    pendingTagActions,
    pendingVoucherRebook,
    pendingVoucherReverse,
    pendingVoucherTagActions,
    pendingVoucherUpdates,
    selectedCandidate,
    selectedJobId,
    chatSnapshotReady
  ])

  const analysis = useMemo(() => bookingAnalysis(selectedJob), [selectedJob])
  const candidate = analysis?.candidates?.[selectedCandidate] || null
  const openBookingJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.type === 'BOOKING_FROM_DOCUMENTS' &&
          job.status !== 'REJECTED' &&
          hasOpenBookingCandidates(job)
      ),
    [jobs]
  )
  const completedBookingJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.type === 'BOOKING_FROM_DOCUMENTS' &&
          job.status === 'APPROVED' &&
          !hasOpenBookingCandidates(job)
      ),
    [jobs]
  )
  const agentReviewQueueItems = useMemo(
    () =>
      buildAiReviewQueue({
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
      }),
    [
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
    ]
  )
  const chatStarted =
    messages.length > 0 ||
    !!selectedJob ||
    !!bankReview ||
    !!pendingMembers ||
    !!pendingMemberUpdates ||
    !!pendingContributionPayment ||
    !!pendingRecurringBooking ||
    !!pendingContributionLinks ||
    !!pendingTagActions ||
    !!pendingPartyActions ||
    !!pendingVoucherTagActions ||
    !!pendingVoucherUpdates ||
    !!pendingVoucherReverse ||
    !!pendingVoucherRebook ||
    !!pendingBankLinks ||
    !!pendingInvoiceActions ||
    !!pendingBudgetActions ||
    !!pendingEarmarkActions ||
    !!pendingPlannerQuestion
  const hasPendingReview = hasOpenReviewWorkflow()
  const hasPlannerQuestionOpen = pendingPlannerQuestion?.status === 'OPEN'
  const isComposingPrompt =
    prompt.trim().length > 0 || files.length > 0 || visibleMentions.length > 0
  const avatarFrame = useAiAvatar({
    messages,
    busy,
    chatStarted,
    hasPendingReview,
    hasPlannerQuestionOpen,
    isComposingPrompt
  })

  const openAgentReviewQueueItem = (item: AgentReviewQueueItem) => {
    document.getElementById(item.anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const openMessageBookingDraft = (draft: NonNullable<AiMessage['bookingDraft']>) => {
    if (draft.status === 'SAVED') return
    window.dispatchEvent(
      new CustomEvent('ai:open-booking-draft', {
        detail: {
          qa: draft.qa,
          files: draft.files || [],
          agentDraftId: draft.agentDraftId
        }
      })
    )
  }

  useEffect(() => {
    const off = window.api?.quickAdd?.onSaved?.((payload: any) => {
      const agentDraftId = typeof payload?.agentDraftId === 'string' ? payload.agentDraftId : ''
      if (!agentDraftId) return
      const voucherNo = payload?.voucherNo ? String(payload.voucherNo) : null
      const voucherId = typeof payload?.id === 'number' ? payload.id : null
      setMessages((current) =>
        current.map((message) => {
          const bookingDraft = message.bookingDraft
          if (!bookingDraft || bookingDraft.agentDraftId !== agentDraftId) return message
          return {
            ...message,
            title: 'Buchungsentwurf erstellt',
            body: voucherNo
              ? `Der geöffnete Agent-Buchungsentwurf wurde als Buchung ${voucherNo} erstellt.`
              : 'Der geöffnete Agent-Buchungsentwurf wurde als Buchung erstellt.',
            displayBody: undefined,
            meta: 'Agent-Draft · erstellt',
            bookingDraft: {
              ...bookingDraft,
              status: 'SAVED',
              voucherId,
              voucherNo
            }
          }
        })
      )
    })
    return () => {
      if (typeof off === 'function') off()
    }
  }, [])

  const openVoucherMention = async (mention: AiVoucherMention) => {
    try {
      const result = mention.id
        ? await window.api.vouchers.list({ limit: 1, voucherIds: [mention.id] })
        : mention.voucherNo
          ? await window.api.vouchers.list({ limit: 1, q: mention.voucherNo })
          : null
      const row = result?.rows?.[0]
      if (row?.id) {
        const detached = await window.api.quickAdd.openDetached({
          mode: 'details',
          draftId: `ai-details-${row.id}-${Date.now()}`,
          voucherId: row.id,
          voucher: row
        })
        if (detached?.ok) return
      }
      window.dispatchEvent(
        new CustomEvent('apply-voucher-jump', {
          detail: {
            voucherId: mention.id,
            voucherNo: mention.voucherNo,
            date: mention.date,
            q: mention.voucherNo || (mention.id ? String(mention.id) : undefined)
          }
        })
      )
    } catch (error: any) {
      notify('error', error?.message || 'Buchung konnte nicht geöffnet werden.')
    }
  }

  const buildConversationPrompt = (userPrompt: string) =>
    buildAiConversationPrompt(userPrompt, messages, chatStarted, agentUiContext)

  const startNewChat = () => {
    setMessages([])
    resetAgentSession()
    selectJob(null)
    resetReviewState()
    setFiles([])
    setPrompt('')
    setShowHistory(false)
    setShowAgentContext(false)
    setShowSettings(false)
    clearAiChatSnapshot(activeOrganizationId)
  }

  const updateBankSuggestion = (transactionId: number, patch: Partial<AiBankReviewSuggestion>) => {
    setBankReview((current) =>
      current
        ? {
            ...current,
            suggestions: current.suggestions.map((suggestion) =>
              Number(suggestion.transactionId) === Number(transactionId)
                ? { ...suggestion, ...patch }
                : suggestion
            ),
            allSuggestions: current.allSuggestions?.map((suggestion) =>
              Number(suggestion.transactionId) === Number(transactionId)
                ? { ...suggestion, ...patch }
                : suggestion
            )
          }
        : current
    )
  }

  const decodeBase64ToBytes = (dataBase64: string) => {
    const binary = window.atob(dataBase64)
    const bytes = new Uint8Array(binary.length)
    for (let idx = 0; idx < binary.length; idx += 1) bytes[idx] = binary.charCodeAt(idx)
    return bytes
  }

  const openBookingDraftForCandidate = (
    job: TAiJobsGetOutput,
    reviewCandidate: TAiBookingCandidate,
    candidateIndex: number
  ) => {
    const paymentAccountName = reviewCandidate.paymentAccountId
      ? paymentAccounts.find((account) => account.id === reviewCandidate.paymentAccountId)?.name ||
        null
      : null
    const draftFiles = (job.files || [])
      .filter((file) => !!file.dataBase64)
      .map(
        (file) =>
          new File([decodeBase64ToBytes(file.dataBase64!)], file.fileName, {
            type: file.mimeType || 'application/octet-stream'
          })
      )
    window.dispatchEvent(
      new CustomEvent('ai:open-booking-draft', {
        detail: {
          qa: {
            date: reviewCandidate.date,
            type: reviewCandidate.type,
            sphere: reviewCandidate.sphere,
            mode: 'GROSS',
            grossAmount: reviewCandidate.grossAmount,
            vatRate: reviewCandidate.vatRate ?? 0,
            description: reviewCandidate.description,
            note: ['Aus KI-Buchungsvorschlag vorbereitet.', ...(reviewCandidate.warnings || [])]
              .filter(Boolean)
              .join('\n'),
            paymentMethod: reviewCandidate.paymentMethod ?? null,
            paymentAccountId: reviewCandidate.paymentAccountId ?? null,
            paymentAccountName,
            budgets: (reviewCandidate.budgets || []).map((budget) => ({
              budgetId: budget.id,
              amount: budget.amount
            })),
            earmarksAssigned: (reviewCandidate.earmarks || []).map((earmark) => ({
              earmarkId: earmark.id,
              amount: earmark.amount
            })),
            tags: reviewCandidate.tags || []
          },
          files: draftFiles
        }
      })
    )
    pushMessage({
      role: 'assistant',
      title: 'Buchungsentwurf geöffnet',
      body: `Vorschlag ${candidateIndex + 1} aus "${job.title || `Buchungsvorschlag #${job.id}`}" wurde als bearbeitbarer Buchungsentwurf geöffnet.`,
      meta: 'Review im Buchungsmodal'
    })
  }

  const openBookingDraftFromJobId = async (jobId: number) => {
    const job =
      selectedJob?.id === jobId ? selectedJob : await window.api.ai.jobs.get({ id: jobId })
    const jobAnalysis = bookingAnalysis(job)
    if (!jobAnalysis) {
      notify('error', 'Für diesen KI-Auftrag fehlt ein Buchungsvorschlag.')
      return
    }
    const draftIndex = firstOpenCandidateIndex(job)
    const draftCandidate = jobAnalysis.candidates[draftIndex]
    if (!draftCandidate || isCandidateApproved(draftCandidate, job)) {
      notify('info', 'Dieser KI-Buchungsvorschlag ist bereits gebucht.')
      return
    }
    selectJob(job, draftIndex)
    openBookingDraftForCandidate(job, draftCandidate, draftIndex)
  }

  const processDocuments = async (userPrompt: string) => {
    if (!files.length) throw new Error('Bitte mindestens eine Datei anhängen.')
    const encoded = await Promise.all(
      files.map(async (file) => ({
        fileName: file.name,
        mimeType: file.type || undefined,
        dataBase64: await fileToBase64(file)
      }))
    )
    const job = await window.api.ai.jobs.create({
      type: 'BOOKING_FROM_DOCUMENTS',
      title: userPrompt.trim() || (files.length === 1 ? files[0].name : `${files.length} Belege`),
      prompt: userPrompt || undefined,
      files: encoded
    })
    const processed = await window.api.ai.jobs.process({ id: job.id })
    setFiles([])
    await loadJobs()
    if (processed.status === 'FAILED') {
      selectJob(null)
      throw new Error(processed.error || 'KI-Verarbeitung fehlgeschlagen.')
    }
    selectJob(processed)
    const processedAnalysis = processed.result as TAiBookingAnalysisResult | undefined
    const sourceUnitCount = new Set(
      (processedAnalysis?.candidates || []).map(
        (item) => candidateSourceLabel(item) || `candidate-${item.description}`
      )
    ).size
    pushMessage({
      role: 'assistant',
      title: sourceUnitCount > 1 ? 'Stapel-Review vorbereitet' : 'Buchungsvorschlag vorbereitet',
      body:
        sourceUnitCount > 1
          ? 'Ich habe die Anhänge bzw. PDF-Seiten getrennt ausgewertet und einen Sammel-Review mit einzelnen Buchungsvorschlägen erstellt. Prüfe die Felder unten und buche erst danach.'
          : 'Ich habe aus den Anhängen einen Review-Vorschlag erstellt. Prüfe die Felder unten und buche erst danach.',
      meta: [
        `${processed.fileCount} Datei(en)`,
        sourceUnitCount > 1 ? `${sourceUnitCount} Quellen` : null,
        formatAiUsage(processed.usage)
      ]
        .filter(Boolean)
        .join(' · '),
      jobId: processed.id,
      reviewable: true
    })
  }

  const processFileTextTask = async (userPrompt: string) => {
    if (!files.length) throw new Error('Bitte mindestens eine Datei anhängen.')
    const encoded = await Promise.all(
      files.map(async (file) => ({
        fileName: file.name,
        mimeType: file.type || undefined,
        dataBase64: await fileToBase64(file)
      }))
    )
    const type = routeTextType(userPrompt || 'Analysiere die angehängten Dateien für VereinO.')
    const job = await window.api.ai.jobs.create({
      type: type === 'REPORT_TEXT' ? 'REPORT_TEXT' : 'MEMBER_TEXT',
      title: userPrompt.trim() || (files.length === 1 ? files[0].name : `${files.length} Dateien`),
      prompt:
        userPrompt ||
        'Analysiere die angehängten Dateien für VereinO und schlage die nächsten Schritte vor.',
      files: encoded
    })
    const processed = await window.api.ai.jobs.process({ id: job.id })
    setFiles([])
    await loadJobs()
    if (processed.status === 'FAILED') {
      throw new Error(processed.error || 'KI-Dateiauswertung fehlgeschlagen.')
    }
    const draft = processed.result as { title: string; body: string; notes?: string[] }
    pushMessage({
      role: 'assistant',
      title: draft.title,
      body: draft.body,
      meta: [`${processed.fileCount} Datei(en)`, formatAiUsage(processed.usage)]
        .filter(Boolean)
        .join(' · '),
      jobId: processed.id,
      reviewable: false
    })
  }

  const processBankImport = async (userPrompt = 'Offene Bankimport-Belege prüfen') => {
    const result = await window.api.ai.bankImports.reviewOpen({ limit: 20 })
    if (settings.hasApiKey) {
      const aiResult = await answerToolResultWithAi({
        userPrompt,
        title: 'Bankimport geprüft',
        toolName: 'ai.bankImports.reviewOpen',
        data: result,
        type: 'REPORT_TEXT'
      })
      setBankReview(
        filterBankReviewByAiText(
          result,
          userPrompt,
          `${aiResult?.draft?.title || ''}\n${aiResult?.draft?.body || ''}`
        )
      )
      return
    }
    setBankReview(result as AiBankReviewState)
    pushMessage({
      role: 'assistant',
      title: 'Bankimport geprüft',
      body: bankReviewBody(result),
      meta: `${result.suggestions.length} Vorschlag/Vorschläge`
    })
  }

  const processReportExport = async (userPrompt: string) => {
    const request = parseReportExportRequest(userPrompt)
    const result = await window.api.reports.export(request.payload)
    if (!result?.filePath) throw new Error('Report-Export wurde nicht erstellt.')
    if (settings.hasApiKey) {
      const reportData = await buildReportKpiData(
        request,
        result.filePath,
        loadTags,
        buildContributionDueData
      )
      await answerToolResultWithAi({
        userPrompt,
        title: 'Controllingbericht exportiert',
        toolName:
          'reports.export + reports.summary + reports.monthly + reports.cashBalance + vouchers.list + payments.status',
        data: reportData,
        type: 'REPORT_TEXT',
        filePath: result.filePath
      })
      notify('success', `Report exportiert: ${result.filePath}`, 6000, {
        label: 'Ordner öffnen',
        onClick: () => void window.api.shell.showItemInFolder(result.filePath)
      })
      return
    }
    pushMessage({
      role: 'assistant',
      title: 'Report exportiert',
      body: `${request.label} wurde erstellt.\n${result.filePath}`,
      meta: 'Lokaler VereinO-Export',
      filePath: result.filePath
    })
    notify('success', `Report exportiert: ${result.filePath}`, 6000, {
      label: 'Ordner öffnen',
      onClick: () => void window.api.shell.showItemInFolder(result.filePath)
    })
  }

  const prepareMemberCreation = async (userPrompt: string) => {
    const parsed = parseMemberDraftsFromText(userPrompt)
    if (!parsed) return false
    setPendingMembers(parsed)
    const missingContribution = parsed.members.some(
      (member) => !member.contributionAmount || !member.contributionInterval
    )
    pushMessage({
      role: 'assistant',
      title: 'Mitgliederanlage vorbereitet',
      body: `${parsed.members.length} Mitglied(er) wurden aus deiner Nachricht erkannt. Bitte prüfe die Vorschau unten${missingContribution ? ' und ergänze den Beitrag.' : '.'}`,
      meta: missingContribution ? 'Beitrag fehlt noch' : 'Bereit zum Anlegen'
    })
    return true
  }

  const applyMemberFollowup = async (userPrompt: string) => {
    if (!pendingMembers || pendingMembers.status === 'CREATED') return false
    const contribution = parseContributionHint(userPrompt)
    if (contribution.amount || contribution.interval) {
      const nextState: AiMemberImportState = {
        ...pendingMembers,
        members: sanitizeMemberDrafts(pendingMembers.members).map((member) => ({
          ...member,
          contributionAmount: contribution.amount ?? member.contributionAmount,
          contributionInterval: contribution.interval || member.contributionInterval
        }))
      }
      setPendingMembers(nextState)
      const firstMember = nextState.members[0]
      pushMessage({
        role: 'assistant',
        title: 'Beitrag übernommen',
        body: `Der Beitrag wurde für die vorbereiteten Mitglieder gesetzt: ${firstMember?.contributionAmount ? euro.format(firstMember.contributionAmount) : 'Betrag offen'}${firstMember?.contributionInterval === 'YEARLY' ? ' · jährlich' : firstMember?.contributionInterval ? ` · ${firstMember.contributionInterval}` : ''}.`
      })
      return true
    }
    if (wantsCreatePendingMembers(userPrompt)) {
      await createPendingMembers()
      return true
    }
    return false
  }

  const nextMemberNumbers = async (count: number) => {
    const result = await window.api.members.list({ limit: 200, sortBy: 'memberNo', sort: 'DESC' })
    const numeric = (result.rows || [])
      .map((member) => Number(String(member.memberNo || '').trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
    const start = numeric.length ? Math.max(...numeric) + 1 : 1
    return Array.from({ length: count }, (_, idx) => String(start + idx).padStart(4, '0'))
  }

  const createPendingMembers = async (stateOverride?: AiMemberImportState) => {
    const memberState = stateOverride || pendingMembers
    if (!memberState || memberState.status === 'CREATED') return
    const missing = memberState.members.filter(
      (member) =>
        !member.name ||
        !member.joinDate ||
        !member.contributionAmount ||
        !member.contributionInterval
    )
    if (missing.length) {
      pushMessage({
        role: 'assistant',
        title: 'Mitgliederanlage noch unvollständig',
        body: `Es fehlen noch Pflichtangaben bei ${missing.map((member) => member.name).join(', ')}. Bitte ergänze Beitrag und Eintrittsdatum.`
      })
      return
    }
    setBusy(true)
    try {
      const numbers = await nextMemberNumbers(memberState.members.length)
      const created = []
      for (let idx = 0; idx < memberState.members.length; idx += 1) {
        const member = memberState.members[idx]
        const payload: TMemberCreateInput = {
          memberNo: numbers[idx],
          name: member.name,
          status: 'ACTIVE',
          boardRole: member.boardRole || null,
          join_date: member.joinDate,
          contribution_amount: member.contributionAmount ?? null,
          contribution_interval: member.contributionInterval || null,
          next_due_date: member.nextDueDate || null,
          notes: member.birthDate ? `Geburtsdatum: ${formatIsoDate(member.birthDate)}` : null
        }
        const result = await window.api.members.create(payload)
        created.push({ ...member, createdId: result.id, createdMemberNo: numbers[idx] })
      }
      setPendingMembers({ ...memberState, status: 'CREATED', members: created })
      pushMessage({
        role: 'assistant',
        title: 'Mitglieder angelegt',
        body: `${created.length} Mitglied(er) wurden angelegt:\n${created.map((member) => `- ${member.createdMemberNo} · ${member.name}`).join('\n')}`,
        meta: 'VereinO-Daten geändert'
      })
      dispatchDataChanged(['members'])
      notify('success', `${created.length} Mitglieder angelegt.`)
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Mitgliederanlage fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  const loadAllMembers = async () => {
    const rows: MemberRow[] = []
    let offset = 0
    const limit = 200
    while (true) {
      const result = await window.api.members.list({
        limit,
        offset,
        status: 'ALL',
        sortBy: 'name',
        sort: 'ASC'
      })
      rows.push(...(result.rows || []))
      if ((result.rows || []).length < limit) break
      offset += limit
    }
    return rows
  }

  const loadDueRowsForMember = async (member: MemberRow) => {
    const intervals: Array<NonNullable<TMemberCreateInput['contribution_interval']>> =
      member.contribution_interval
        ? [member.contribution_interval]
        : ['MONTHLY', 'QUARTERLY', 'YEARLY']
    const rows: PaymentDueRow[] = []
    for (const interval of intervals) {
      const result = await window.api.payments.listDue({
        interval,
        memberId: member.id,
        includePaid: false
      })
      rows.push(...(result.rows || []))
    }
    return rows
  }

  const memberNameFromPlan = (plan: TAiActionPlan) => {
    return (
      planValueString(findPlanFilter(plan, ['memberName', 'member_name', 'name', 'mitglied'])) ||
      planValueString(findPlanArg(plan, ['memberName', 'member_name', 'name', 'mitglied'])) ||
      planValueString(
        plan.items[0]
          ? planItemValue(plan.items[0], ['memberName', 'member_name', 'name', 'mitglied'])
          : undefined
      )
    )
  }

  const amountFromPaymentPlan = (plan: TAiActionPlan, userPrompt: string) => {
    const planned =
      parsePlanAmount(findPlanChange(plan, ['amount', 'betrag', 'grossAmount', 'gross_amount'])) ??
      parsePlanAmount(findPlanArg(plan, ['amount', 'betrag', 'grossAmount', 'gross_amount']))
    if (planned != null) return planned
    return parseMemberContributionAmount(userPrompt)
  }

  const dateFromPaymentPlan = (plan: TAiActionPlan) => {
    return (
      parsePlanDate(findPlanChange(plan, ['date', 'datum', 'datePaid', 'date_paid'])) ||
      parsePlanDate(findPlanArg(plan, ['date', 'datum', 'datePaid', 'date_paid'])) ||
      new Date().toISOString().slice(0, 10)
    )
  }

  const answerToolResultWithAi = async (input: {
    userPrompt: string
    title: string
    toolName: string
    data: unknown
    type?: TAiTextGenerateInput['type']
    filePath?: string
  }) => {
    const promptForModel = [
      'Du bist VereinO KI. Der Nutzer hat eine VereinO-Aufgabe gestellt.',
      'Ein lokales VereinO-Tool wurde bereits ausgeführt. Nutze ausschließlich dieses Tool-Ergebnis und die Unterhaltung, um konkret zu antworten.',
      'Wenn das Tool-Ergebnis passende Aktionen oder vorhandene Treffer enthält, benenne sie klar und schlage den nächsten sicheren Schritt vor.',
      'Behaupte keine Änderungen, die noch nicht durchgeführt wurden. Schreibende Aktionen werden erst nach Review/Freigabe ausgeführt.',
      'Wenn ein Report exportiert wurde, nenne den Export klar und liefere zusätzlich die vom Nutzer gewünschten Kennzahlen, Erkenntnisse und offenen Annahmen aus den bereitgestellten Tool-Daten.',
      '',
      'Bisherige Unterhaltung:',
      planConversation()
        .map(
          (message) =>
            `${message.role === 'user' ? 'Nutzer' : 'VereinO KI'}${message.title ? ` (${message.title})` : ''}: ${message.body}`
        )
        .join('\n\n') || '-',
      '',
      `Tool: ${input.toolName}`,
      'Tool-Ergebnis:',
      JSON.stringify(input.data, null, 2),
      '',
      'Aktuelle Nutzernachricht:',
      input.userPrompt
    ].join('\n')
    const job = await window.api.ai.jobs.create({
      type: input.type === 'MEMBER_MESSAGE' ? 'MEMBER_TEXT' : 'REPORT_TEXT',
      title: input.title,
      prompt: promptForModel
    })
    const processed = await window.api.ai.jobs.process({ id: job.id })
    if (processed.status === 'FAILED')
      throw new Error(processed.error || 'KI-Antwort aus Tool-Ergebnis fehlgeschlagen.')
    await loadJobs()
    const draft = processed.result as { title: string; body: string }
    pushMessage({
      role: 'assistant',
      title: draft.title || input.title,
      body: draft.body,
      meta: ['KI-Antwort', input.toolName, formatAiUsage(processed.usage)]
        .filter(Boolean)
        .join(' · '),
      jobId: processed.id,
      reviewable: false,
      filePath: input.filePath
    })
    return { processed, draft }
  }

  const buildContributionDueData = async () => {
    const members = await loadAllMembers()
    const rows = await Promise.all(
      members
        .filter(
          (member) =>
            member.status !== 'LEFT' && member.contribution_amount && member.contribution_interval
        )
        .map(async (member) => {
          const status = await window.api.payments.status({ memberId: member.id })
          const overdue = Number(status.overdue || 0)
          const periodKey =
            status.firstOverdue ||
            (status.nextDue ? String(new Date(status.nextDue).getUTCFullYear()) : null)
          const suggestions = periodKey
            ? await window.api.payments.suggestVouchers({
                memberId: member.id,
                name: member.name,
                amount: Number(status.amount || member.contribution_amount || 0),
                periodKey
              })
            : { rows: [] }
          return {
            member: {
              id: member.id,
              memberNo: member.memberNo,
              name: member.name,
              status: member.status,
              contributionAmount: member.contribution_amount,
              contributionInterval: member.contribution_interval
            },
            status,
            overdue,
            amount: Number(status.amount || member.contribution_amount || 0),
            interval: status.interval || member.contribution_interval || 'YEARLY',
            firstOverdue: status.firstOverdue || null,
            nextDue: status.nextDue || member.next_due_date || null,
            existingVoucherSuggestions: suggestions.rows || []
          }
        })
    )
    const openRows = rows.filter((row) => row.status.hasPlan && row.overdue > 0)
    const total = openRows.reduce((sum, row) => sum + row.amount * row.overdue, 0)
    return {
      summary: {
        checkedMembers: rows.length,
        openMembers: openRows.length,
        openAmount: total
      },
      openContributions: openRows
    }
  }

  const processContributionDueRead = async (userPrompt = 'Offene Mitgliedsbeiträge prüfen') => {
    const data = await buildContributionDueData()
    if (settings.hasApiKey) {
      await answerToolResultWithAi({
        userPrompt,
        title: 'Offene Mitgliedsbeiträge',
        toolName: 'payments.status + payments.suggestVouchers',
        data,
        type: 'REPORT_TEXT'
      })
      return
    }
    const openRows = data.openContributions
    const total = data.summary.openAmount
    const body = openRows.length
      ? [
          `Es gibt ${openRows.length} Mitglied(er) mit fälligen/offenen Beiträgen.`,
          `Offener Betrag rechnerisch: ${euro.format(total)}`,
          '',
          ...openRows.map((row) =>
            [
              `- ${row.member.name}`,
              row.member.memberNo ? `#${row.member.memberNo}` : null,
              `${euro.format(row.amount)} ${intervalLabel(row.interval)}`,
              row.overdue > 1
                ? `${row.overdue} Zeiträume offen`
                : `Zeitraum ${row.firstOverdue || row.nextDue || '-'}`,
              row.nextDue ? `nächste Fälligkeit ${formatIsoDate(row.nextDue)}` : null
            ]
              .filter(Boolean)
              .join(' · ')
          )
        ].join('\n')
      : 'Aktuell sind nach den hinterlegten Beitragsplänen keine fälligen/offenen Mitgliedsbeiträge vorhanden.'
    pushMessage({
      role: 'assistant',
      title: 'Offene Mitgliedsbeiträge',
      body,
      meta: 'VereinO-Daten · Beitragsstatus'
    })
  }

  const findMemberForPaymentPlan = async (plan: TAiActionPlan, userPrompt: string) => {
    const members = await loadAllMembers()
    const plannedName = memberNameFromPlan(plan)
    const normalizedPrompt = normalizeLookup([plannedName, userPrompt].filter(Boolean).join(' '))
    const scored = members
      .map((member) => {
        const normalizedName = normalizeLookup(member.name)
        const nameParts = normalizedName.split(' ').filter((part) => part.length >= 3)
        let score = 0
        if (plannedName && normalizeLookup(plannedName) === normalizedName) score += 100
        if (normalizedName && normalizedPrompt.includes(normalizedName)) score += 80
        score += nameParts.filter((part) => normalizedPrompt.includes(part)).length * 15
        if (member.memberNo && normalizedPrompt.includes(normalizeLookup(member.memberNo)))
          score += 20
        return { member, score }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
    if (scored[0]) return scored[0].member

    const allDue = (
      await Promise.all(
        members.map(async (member) => ({
          member,
          due: await loadDueRowsForMember(member)
        }))
      )
    ).filter((item) => item.due.length)
    return allDue.length === 1 ? allDue[0].member : null
  }

  const prepareContributionPayment = async (userPrompt: string, plan: TAiActionPlan) => {
    const member = await findMemberForPaymentPlan(plan, userPrompt)
    if (!member) {
      pushMessage({
        role: 'assistant',
        title: 'Beitragszahlung nicht eindeutig',
        body: 'Ich konnte nicht eindeutig bestimmen, für welches Mitglied die Beitragszahlung gebucht werden soll. Nenne bitte Mitglied und Betrag.'
      })
      return true
    }

    const dueRows = await loadDueRowsForMember(member)
    const plannedPeriod =
      planValueString(findPlanFilter(plan, ['periodKey', 'period_key', 'zeitraum'])) ||
      planValueString(findPlanArg(plan, ['periodKey', 'period_key', 'zeitraum']))
    const due =
      (plannedPeriod ? dueRows.find((row) => row.periodKey === plannedPeriod) : null) || dueRows[0]
    if (!due) {
      pushMessage({
        role: 'assistant',
        title: 'Kein offener Beitrag',
        body: `Für ${member.name} ist aktuell kein offener Beitragszeitraum hinterlegt.`
      })
      return true
    }

    const amount = amountFromPaymentPlan(plan, userPrompt) ?? Number(due.amount || 0)
    const date = dateFromPaymentPlan(plan)
    const accountName =
      planValueString(
        findPlanChange(plan, [
          'paymentAccountName',
          'payment_account_name',
          'zahlungskonto',
          'konto'
        ])
      ) ||
      planValueString(
        findPlanArg(plan, ['paymentAccountName', 'payment_account_name', 'zahlungskonto', 'konto'])
      )
    const account = accountName
      ? findPaymentAccountHint(accountName, paymentAccounts)
      : findPaymentAccountHint(userPrompt, paymentAccounts)
    const paymentMethod = paymentMethodForAccount(account?.kind) || 'BANK'
    const tags = ['Mitgliedsbeitrag']
    const warnings = []
    if (Math.abs(amount - Number(due.amount || 0)) > 0.01) {
      warnings.push(
        `Buchungsbetrag ${euro.format(amount)} weicht vom offenen Beitragsbetrag ${euro.format(Number(due.amount || 0))} ab. VereinO markiert den Zeitraum nach Freigabe als bezahlt.`
      )
    }
    if (!account)
      warnings.push(
        'Kein Zahlungskonto angegeben; die Buchung wird ohne konkretes Zahlungskonto vorbereitet.'
      )

    const draft: AiContributionPaymentState = {
      memberId: member.id,
      memberName: member.name,
      periodKey: due.periodKey,
      interval: due.interval,
      dueAmount: Number(due.amount || 0),
      amount,
      date,
      description: `Mitgliedsbeitrag ${member.name} ${due.periodKey}`,
      paymentMethod,
      paymentAccountId: account?.id ?? null,
      paymentAccountName: account?.name ?? null,
      tags,
      warnings,
      sourcePrompt: userPrompt,
      status: 'DRAFT'
    }
    setPendingContributionPayment(draft)
    pushMessage({
      role: 'assistant',
      title: 'Beitragsbuchung vorbereitet',
      body: `Ich habe eine Buchung über ${euro.format(amount)} für ${member.name} vorbereitet und verknüpfe sie nach deiner Freigabe mit dem Beitragszeitraum ${due.periodKey}.`,
      meta: 'Review erforderlich'
    })
    return true
  }

  const processMemberRead = async (userPrompt: string) => {
    const members = await loadAllMembers()
    const normalized = normalizeLookup(userPrompt)
    const active = members.filter((member) => member.status === 'ACTIVE')
    const rows = /(vorstand|rolle|rollen|vorsitz|kassier)/.test(normalized)
      ? members.filter((member) => !!member.boardRole)
      : /(beitrag|beitraege|beitrage)/.test(normalized)
        ? members.filter((member) => member.status !== 'LEFT')
        : members
    if (settings.hasApiKey) {
      await answerToolResultWithAi({
        userPrompt,
        title: 'Mitgliederabfrage',
        toolName: 'members.list',
        type: 'MEMBER_MESSAGE',
        data: {
          summary: {
            total: members.length,
            active: active.length,
            matched: rows.length
          },
          members: rows.slice(0, 200).map((member) => ({
            id: member.id,
            memberNo: member.memberNo,
            name: member.name,
            status: member.status,
            boardRole: member.boardRole,
            contributionAmount: member.contribution_amount,
            contributionInterval: member.contribution_interval,
            nextDueDate: member.next_due_date,
            tags: member.tags || []
          }))
        }
      })
      return
    }
    const limited = rows.slice(0, 30)
    const body = [
      `Mitglieder gesamt: ${members.length}`,
      `Aktiv: ${active.length}`,
      rows.length ? '' : 'Keine passenden Mitglieder gefunden.',
      ...limited.map((member) => {
        const parts = [
          member.memberNo ? `#${member.memberNo}` : null,
          member.name,
          member.status !== 'ACTIVE' ? memberStatusLabel(member.status) : null,
          member.boardRole ? boardRoleLabel(member.boardRole) : null,
          member.contribution_amount
            ? `${euro.format(member.contribution_amount)} ${intervalLabel(member.contribution_interval)}`
            : null
        ].filter(Boolean)
        return `- ${parts.join(' · ')}`
      }),
      rows.length > limited.length ? `... ${rows.length - limited.length} weitere` : ''
    ]
      .filter((line) => line !== '')
      .join('\n')
    pushMessage({
      role: 'assistant',
      title: 'Mitgliederübersicht',
      body,
      meta: 'VereinO-Daten'
    })
  }

  const prepareMemberUpdate = async (userPrompt: string) => {
    const members = await loadAllMembers()
    const draft = buildMemberUpdateDraft(userPrompt, members)
    if (!draft) {
      pushMessage({
        role: 'assistant',
        title: 'Mitgliederänderung nicht eindeutig',
        body: 'Ich konnte keine eindeutigen Mitgliedsänderungen ableiten. Nenne bitte Zielgruppe oder Namen und die gewünschten Felder, z.B. „Setze bei allen aktiven Mitgliedern den Beitrag auf 20 € monatlich“.'
      })
      return true
    }
    setPendingMemberUpdates(draft)
    pushMessage({
      role: 'assistant',
      title: 'Mitgliederänderung vorbereitet',
      body: `${draft.changes.length} Änderung(en) für ${new Set(draft.changes.map((change) => change.memberId)).size} Mitglied(er) vorbereitet. Bitte prüfe die Vorschau unten.`,
      meta: 'Review erforderlich'
    })
    return true
  }

  const applyMemberUpdateFollowup = async (userPrompt: string) => {
    if (!pendingMemberUpdates || pendingMemberUpdates.status === 'APPLIED') return false
    if (wantsApplyPendingMemberUpdates(userPrompt)) {
      await applyPendingMemberUpdates()
      return true
    }
    const normalized = normalizeLookup(userPrompt)
    const wantsLowercase = /(klein|kleinschreib|lowercase|lower case|minuskel)/.test(normalized)
    const wantsUppercase = /(gross|groß|uppercase|upper case|majusk)/.test(normalized)
    const wantsEmailTransform =
      /(email|e mail|mail|adresse|adressen)/.test(normalized) ||
      pendingMemberUpdates.changes.some(
        (change) => change.field === 'email' && change.selected && !change.applied
      )
    if ((wantsLowercase || wantsUppercase) && wantsEmailTransform) {
      let changed = 0
      setPendingMemberUpdates((current) =>
        current
          ? {
              ...current,
              changes: current.changes.map((change) => {
                if (
                  change.applied ||
                  change.field !== 'email' ||
                  typeof change.newValue !== 'string'
                )
                  return change
                const nextValue = wantsLowercase
                  ? change.newValue.toLowerCase()
                  : change.newValue.toUpperCase()
                if (nextValue === change.newValue) return change
                changed += 1
                return {
                  ...change,
                  newValue: nextValue,
                  newDisplay: displayMemberValue(change.field, nextValue),
                  selected: true
                }
              })
            }
          : current
      )
      pushMessage({
        role: 'assistant',
        title: 'Mitgliederänderung angepasst',
        body: changed
          ? `${changed} E-Mail-Änderung(en) im offenen Review wurden ${wantsLowercase ? 'kleingeschrieben' : 'großgeschrieben'}. Bitte prüfe die Vorschau unten.`
          : `Die E-Mail-Änderungen im offenen Review waren bereits ${wantsLowercase ? 'kleingeschrieben' : 'großgeschrieben'}.`
      })
      return true
    }
    const contribution = parseContributionHint(userPrompt)
    if (!contribution.amount && !contribution.interval) return false
    setPendingMemberUpdates((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) => {
              if (change.applied) return change
              if (change.field === 'contribution_amount' && contribution.amount != null) {
                return {
                  ...change,
                  newValue: contribution.amount,
                  newDisplay: displayMemberValue(change.field, contribution.amount),
                  selected: true
                }
              }
              if (change.field === 'contribution_interval' && contribution.interval) {
                return {
                  ...change,
                  newValue: contribution.interval,
                  newDisplay: displayMemberValue(change.field, contribution.interval),
                  selected: true
                }
              }
              return change
            })
          }
        : current
    )
    pushMessage({
      role: 'assistant',
      title: 'Mitgliederänderung angepasst',
      body: 'Ich habe den Beitrag/Intervall im offenen Änderungsvorschlag aktualisiert. Bitte prüfe die Vorschau unten.'
    })
    return true
  }

  const toggleMemberUpdateChange = (id: string) => {
    setPendingMemberUpdates((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) =>
              change.id === id && !change.applied
                ? { ...change, selected: !change.selected }
                : change
            )
          }
        : current
    )
  }

  const applyPendingRecurringBooking = async () => {
    if (!pendingRecurringBooking || pendingRecurringBooking.status === 'APPLIED') return
    const openOccurrences = pendingRecurringBooking.occurrences.filter(
      (occurrence) => !occurrence.booked
    )
    if (!openOccurrences.length) return
    setBusy(true)
    const booked = new Map<number, string>()
    const failures = new Map<number, string>()
    try {
      for (const occurrence of openOccurrences) {
        try {
          const result = await window.api.recurringBookings.book({
            recurringBookingId: pendingRecurringBooking.recurringBookingId,
            occurrenceId: occurrence.occurrenceId,
            bookingDate: pendingRecurringBooking.bookingDate || occurrence.scheduledDate,
            amount: occurrence.amount
          })
          booked.set(occurrence.occurrenceId, result.voucherNo)
        } catch (error: any) {
          failures.set(occurrence.occurrenceId, error?.message || String(error))
        }
      }
      const nextState: AiRecurringBookingState = {
        ...pendingRecurringBooking,
        status: failures.size ? 'DRAFT' : 'APPLIED',
        occurrences: pendingRecurringBooking.occurrences.map((occurrence) => ({
          ...occurrence,
          booked: occurrence.booked || booked.has(occurrence.occurrenceId),
          voucherNo: booked.get(occurrence.occurrenceId) || occurrence.voucherNo || null,
          error: failures.get(occurrence.occurrenceId) || null
        }))
      }
      setPendingRecurringBooking(nextState)
      if (booked.size) {
        pushMessage({
          role: 'assistant',
          title: failures.size ? 'Dauerbuchungen teilweise erstellt' : 'Dauerbuchungen erstellt',
          body: failures.size
            ? `${booked.size} von ${openOccurrences.length} Fälligkeit(en) wurden gebucht. Offen: ${Array.from(failures.values()).join(' ')}`
            : `${booked.size} Fälligkeit(en) wurden als eigene Buchungsbelege erstellt und erledigt.`,
          meta: 'VereinO-Daten geändert'
        })
        dispatchDataChanged(['recurring-bookings', 'vouchers', 'budgets', 'earmarks', 'tags'])
        onBooked?.()
      }
      if (failures.size)
        notify('error', `${failures.size} Dauerbuchung(en) konnten nicht erstellt werden.`)
      else notify('success', `${booked.size} Dauerbuchung(en) erstellt.`)
    } finally {
      setBusy(false)
    }
  }

  const applyPendingMemberUpdates = async () => {
    if (!pendingMemberUpdates || pendingMemberUpdates.status === 'APPLIED') return
    const selected = pendingMemberUpdates.changes.filter(
      (change) => change.selected && !change.applied
    )
    if (!selected.length) {
      notify('info', 'Keine Mitgliederänderungen ausgewählt.')
      return
    }
    setBusy(true)
    try {
      const grouped = new Map<number, TMemberUpdateInput>()
      for (const change of selected) {
        const payload = grouped.get(change.memberId) || { id: change.memberId }
        ;(payload as any)[change.field] = change.newValue ?? null
        grouped.set(change.memberId, payload)
      }
      for (const payload of grouped.values()) {
        await window.api.members.update(payload)
      }
      const appliedIds = new Set(selected.map((change) => change.id))
      const nextState: AiMemberUpdateState = {
        ...pendingMemberUpdates,
        status: 'APPLIED',
        changes: pendingMemberUpdates.changes.map((change) =>
          appliedIds.has(change.id) ? { ...change, applied: true } : change
        )
      }
      setPendingMemberUpdates(nextState)
      pushMessage({
        role: 'assistant',
        title: 'Mitglieder geändert',
        body: `${selected.length} Änderung(en) bei ${grouped.size} Mitglied(er)n übernommen.`,
        meta: 'VereinO-Daten geändert'
      })
      dispatchDataChanged(['members'])
      notify('success', `${selected.length} Mitgliederänderungen übernommen.`)
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Mitgliederänderung fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  const createContributionPayment = async () => {
    if (!pendingContributionPayment || pendingContributionPayment.status === 'CREATED') return
    setBusy(true)
    try {
      const voucher = await window.api.vouchers.create({
        date: pendingContributionPayment.date,
        type: 'IN',
        sphere: 'IDEELL',
        description: pendingContributionPayment.description,
        note: `Aus VereinO KI-Beitragsvorschlag erstellt und mit ${pendingContributionPayment.memberName} / ${pendingContributionPayment.periodKey} verknüpft.`,
        grossAmount: pendingContributionPayment.amount,
        vatRate: 0,
        paymentMethod: pendingContributionPayment.paymentMethod || undefined,
        paymentAccountId: pendingContributionPayment.paymentAccountId ?? undefined,
        tags: pendingContributionPayment.tags
      })
      await window.api.payments.markPaid({
        memberId: pendingContributionPayment.memberId,
        periodKey: pendingContributionPayment.periodKey,
        interval: pendingContributionPayment.interval || 'YEARLY',
        amount: pendingContributionPayment.amount,
        voucherId: voucher.id,
        datePaid: pendingContributionPayment.date
      })
      const nextState: AiContributionPaymentState = {
        ...pendingContributionPayment,
        status: 'CREATED',
        voucherId: voucher.id,
        voucherNo: voucher.voucherNo
      }
      setPendingContributionPayment(nextState)
      pushMessage({
        role: 'assistant',
        title: 'Beitragsbuchung erstellt',
        body: `Buchung ${voucher.voucherNo} wurde erstellt und mit ${pendingContributionPayment.memberName} / ${pendingContributionPayment.periodKey} verknüpft.`,
        meta: 'VereinO-Daten geändert'
      })
      dispatchDataChanged(['vouchers', 'members'])
      onBooked?.()
      notify('success', `Beitragsbuchung ${voucher.voucherNo} erstellt.`)
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Beitragsbuchung fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  const toggleContributionLink = (id: string) => {
    setPendingContributionLinks((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) =>
              change.id === id && !change.applied
                ? { ...change, selected: !change.selected }
                : change
            )
          }
        : current
    )
  }

  const applyContributionLinks = async () => {
    if (!pendingContributionLinks || pendingContributionLinks.status === 'APPLIED') return
    const selected = pendingContributionLinks.changes.filter(
      (change) => change.selected && !change.applied
    )
    if (!selected.length) {
      notify('info', 'Keine Beitrags-Verknüpfungen ausgewählt.')
      return
    }
    setBusy(true)
    try {
      for (const change of selected) {
        await window.api.payments.markPaid({
          memberId: change.memberId,
          periodKey: change.periodKey,
          interval: change.interval || 'YEARLY',
          amount: change.amount,
          voucherId: change.voucherId,
          datePaid: change.datePaid || change.voucherDate || null
        })
      }
      const appliedIds = new Set(selected.map((change) => change.id))
      const nextState: AiContributionLinkState = {
        ...pendingContributionLinks,
        status: 'APPLIED',
        changes: pendingContributionLinks.changes.map((change) =>
          appliedIds.has(change.id) ? { ...change, applied: true } : change
        )
      }
      setPendingContributionLinks(nextState)
      pushMessage({
        role: 'assistant',
        title: 'Beiträge verknüpft',
        body: `${selected.length} Beitragszeitraum/-zeiträume wurden mit vorhandenen Buchungen verknüpft und als bezahlt markiert.`,
        meta: 'VereinO-Daten geändert'
      })
      dispatchDataChanged(['members'])
      onBooked?.()
      notify('success', `${selected.length} Beitrags-Verknüpfung(en) übernommen.`)
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Beitrags-Verknüpfung fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  const loadTags = async () => {
    const result = await window.api.tags.list({ includeUsage: true })
    return (result.rows || []) as TagRow[]
  }

  function budgetLabelFromRow(budget: any) {
    return (
      budget?.categoryName ||
      budget?.projectName ||
      budget?.name ||
      (budget?.id ? `Budget #${budget.id}` : '')
    )
  }

  function budgetLabelFromChange(change: AiBudgetActionChange) {
    const payload = (change.payload || {}) as Partial<TBudgetUpsertInput>
    return (
      payload.categoryName ||
      payload.projectName ||
      payload.name ||
      change.name ||
      (change.budgetId ? `Budget #${change.budgetId}` : '')
    )
  }

  const buildBudgetLookup = async (knownBudgets: Array<{ id: number; label: string }> = []) => {
    const result = await window.api.budgets.list({ includeArchived: true })
    const lookup = new Map<string, number>()
    const add = (label: unknown, id: unknown) => {
      const normalized = normalizeLookup(label)
      const numericId = Number(id)
      if (normalized && Number.isFinite(numericId)) lookup.set(normalized, numericId)
    }
    for (const budget of result.rows || []) {
      add(budgetLabelFromRow(budget), budget.id)
      add(budget.name, budget.id)
      add(budget.categoryName, budget.id)
      add(budget.projectName, budget.id)
      add(`Budget #${budget.id}`, budget.id)
    }
    for (const budget of knownBudgets) add(budget.label, budget.id)
    return lookup
  }

  const buildEarmarkLookup = async () => {
    const result = await window.api.bindings.list({ activeOnly: false })
    const rows = (result.rows || result || []) as any[]
    const lookup = new Map<string, number>()
    const add = (label: unknown, id: unknown) => {
      const normalized = normalizeLookup(label)
      const numericId = Number(id)
      if (normalized && Number.isFinite(numericId)) lookup.set(normalized, numericId)
    }
    for (const earmark of rows) {
      add(earmark.code, earmark.id)
      add(earmark.name, earmark.id)
      add([earmark.code, earmark.name].filter(Boolean).join(' '), earmark.id)
      add([earmark.code, earmark.name].filter(Boolean).join(' · '), earmark.id)
      add(`Zweckbindung #${earmark.id}`, earmark.id)
    }
    return lookup
  }

  const resolvePendingVoucherBudgetTargets = async (
    knownBudgets: Array<{ id: number; label: string }> = []
  ) => {
    const lookup = await buildBudgetLookup(knownBudgets)
    setPendingVoucherUpdates((current) => {
      if (!current) return current
      let changed = false
      const changes = current.changes.map((change) => {
        if (change.newBudgetId != null || !change.newBudgetLabel) return change
        const resolvedId = lookup.get(normalizeLookup(change.newBudgetLabel))
        if (!resolvedId) return change
        changed = true
        return { ...change, newBudgetId: resolvedId }
      })
      return changed ? { ...current, changes } : current
    })
  }

  const processTagRead = async (
    userPrompt = 'Tags, Kategorien, Budgets und Zweckbindungen abfragen'
  ) => {
    const [tags, budgets, bindings] = await Promise.all([
      loadTags(),
      window.api.budgets.list({ includeArchived: true }),
      window.api.bindings.list({ activeOnly: false })
    ])
    const budgetRows = budgets.rows || []
    const bindingRows = bindings.rows || []
    const budgetLabels = budgetRows
      .map((budget) => budget.categoryName || budget.projectName || budget.name)
      .filter(Boolean)
      .filter(
        (name, idx, list) =>
          list.findIndex((item) => normalizeLookup(item) === normalizeLookup(name)) === idx
      )
    if (settings.hasApiKey) {
      await answerToolResultWithAi({
        userPrompt,
        title: 'Tags und Kategorien',
        toolName: 'tags.list + budgets.list + bindings.list',
        type: 'REPORT_TEXT',
        data: {
          tags,
          budgets: budgetRows,
          categoryLabels: budgetLabels,
          earmarks: bindingRows
        }
      })
      return
    }
    pushMessage({
      role: 'assistant',
      title: 'Angelegte Tags und Kategorien',
      body: [
        'Tags:',
        tags.length
          ? tags
              .map(
                (tag) => `- ${tag.name}${tag.usage != null ? ` · ${tag.usage} Nutzung(en)` : ''}`
              )
              .join('\n')
          : '- keine Tags angelegt',
        '',
        'Budgets/Kategorien:',
        budgetLabels.length
          ? budgetLabels.map((name) => `- ${name}`).join('\n')
          : '- keine Budgets oder Kategorien angelegt',
        '',
        'Zweckbindungen:',
        bindingRows.length
          ? bindingRows
              .map(
                (binding) =>
                  `- ${binding.code} · ${binding.name}${binding.isActive ? '' : ' · inaktiv'}`
              )
              .join('\n')
          : '- keine Zweckbindungen angelegt'
      ].join('\n'),
      meta: 'VereinO-Daten'
    })
  }

  const buildTagActionDraft = async (
    userPrompt: string,
    fallbackText?: string
  ): Promise<AiTagActionState | null> => {
    const existingTags = await loadTags()
    const existingByName = new Map(existingTags.map((tag) => [normalizeLookup(tag.name), tag]))
    const normalizedPrompt = normalizeLookup(userPrompt)
    const changes: AiTagActionChange[] = []

    const renameMatch = userPrompt.match(
      /(?:benenne|nenn|umbenenne|ändere|aendere)[^\n\r]*tag\s+(.+?)\s+(?:in|zu|auf)\s+(.+)$/i
    )
    if (renameMatch) {
      const oldName = cleanTagCandidateName(renameMatch[1])
      const newName = cleanTagCandidateName(renameMatch[2])
      const tag = existingByName.get(normalizeLookup(oldName))
      if (tag && isLikelyTagName(newName)) {
        changes.push({
          id: `tag-update-${tag.id}`,
          action: 'UPDATE',
          tagId: tag.id,
          name: newName,
          oldDisplay: tag.name,
          newDisplay: newName,
          color: tag.color || tagColorForName(newName),
          selected: true
        })
      }
    } else if (/(loesch|losch|lösche|entfern)/.test(normalizedPrompt)) {
      const names = extractTagNamesFromText(userPrompt)
      for (const name of names) {
        const tag = existingByName.get(normalizeLookup(name))
        if (!tag) continue
        changes.push({
          id: `tag-delete-${tag.id}`,
          action: 'DELETE',
          tagId: tag.id,
          name: tag.name,
          oldDisplay: tag.name,
          newDisplay: 'löschen',
          selected: true
        })
      }
    } else {
      const names = extractTagNamesFromText([userPrompt, fallbackText || ''].join('\n'))
      for (const name of names) {
        if (existingByName.has(normalizeLookup(name))) continue
        changes.push({
          id: `tag-create-${normalizeLookup(name)}`,
          action: 'CREATE',
          name,
          oldDisplay: 'nicht vorhanden',
          newDisplay: name,
          color: tagColorForName(name),
          selected: true
        })
      }
    }

    return changes.length ? { changes, sourcePrompt: userPrompt, status: 'DRAFT' } : null
  }

  const prepareTagActions = async (userPrompt: string, fallbackText?: string) => {
    const draft = await buildTagActionDraft(userPrompt, fallbackText)
    if (!draft) {
      pushMessage({
        role: 'assistant',
        title: 'Keine Tag-Aktion erkannt',
        body: 'Ich konnte keine neuen oder zu ändernden Tags eindeutig ableiten. Nenne die Tags bitte als Liste, z.B. „Lege Tags Teamabend, Trikots und Förderung an“.'
      })
      return false
    }
    setPendingTagActions(draft)
    pushMessage({
      role: 'assistant',
      title: 'Tag-Änderungen vorbereitet',
      body: `${draft.changes.length} Tag-Änderung(en) vorbereitet. Bitte prüfe die Vorschau unten und übernimm sie erst danach.`,
      meta: 'Review erforderlich'
    })
    return true
  }

  const recoverTagActionsFromConversation = async (userPrompt: string) => {
    const lastAssistant = [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === 'assistant' &&
          /(tag|tags)/i.test(`${message.title || ''}\n${message.body}`)
      )
    if (!lastAssistant) return false
    const draft = await buildTagActionDraft(
      userPrompt,
      `${lastAssistant.title || ''}\n${lastAssistant.body}`
    )
    if (!draft) return false
    setPendingTagActions(draft)
    pushMessage({
      role: 'assistant',
      title: 'Tag-Änderungen vorbereitet',
      body: `${draft.changes.length} Tag-Änderung(en) aus der vorherigen Antwort vorbereitet. Bitte prüfe die Vorschau unten.`,
      meta: 'Review erforderlich'
    })
    return true
  }

  const toggleTagAction = (id: string) => {
    setPendingTagActions((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) =>
              change.id === id && !change.applied
                ? { ...change, selected: !change.selected }
                : change
            )
          }
        : current
    )
  }

  const togglePartyAction = (id: string) => {
    setPendingPartyActions((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) =>
              change.id === id && !change.applied
                ? { ...change, selected: !change.selected }
                : change
            )
          }
        : current
    )
  }

  const toggleBudgetAction = (id: string) => {
    setPendingBudgetActions((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) =>
              change.id === id && !change.applied
                ? { ...change, selected: !change.selected }
                : change
            )
          }
        : current
    )
  }

  const toggleEarmarkAction = (id: string) => {
    setPendingEarmarkActions((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) =>
              change.id === id && !change.applied
                ? { ...change, selected: !change.selected }
                : change
            )
          }
        : current
    )
  }

  const toggleInvoiceAction = (id: string) => {
    setPendingInvoiceActions((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) =>
              change.id === id && !change.applied
                ? { ...change, selected: !change.selected }
                : change
            )
          }
        : current
    )
  }

  const applyPendingTagActions = async () => {
    if (!pendingTagActions || pendingTagActions.status === 'APPLIED') return
    const selected = pendingTagActions.changes.filter(
      (change) => change.selected && !change.applied
    )
    if (!selected.length) {
      notify('info', 'Keine Tag-Änderungen ausgewählt.')
      return
    }
    setBusy(true)
    try {
      for (const change of selected) {
        if (change.action === 'DELETE' && change.tagId) {
          await window.api.tags.delete({ id: change.tagId })
        } else {
          const payload: TTagUpsertInput = {
            ...(change.action === 'UPDATE' && change.tagId ? { id: change.tagId } : {}),
            name: change.name,
            color: change.color ?? null
          }
          await window.api.tags.upsert(payload)
        }
      }
      const appliedIds = new Set(selected.map((change) => change.id))
      setPendingTagActions({
        ...pendingTagActions,
        status: 'APPLIED',
        changes: pendingTagActions.changes.map((change) =>
          appliedIds.has(change.id) ? { ...change, applied: true } : change
        )
      })
      pushMessage({
        role: 'assistant',
        title: 'Tags geändert',
        body: `${selected.length} Tag-Änderung(en) übernommen.`,
        meta: 'VereinO-Daten geändert'
      })
      dispatchDataChanged(['tags', 'vouchers', 'members', 'invoices'])
      notify('success', `${selected.length} Tag-Änderungen übernommen.`)
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Tag-Änderung fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  const applyPendingPartyActions = async () => {
    if (!pendingPartyActions || pendingPartyActions.status === 'APPLIED') return
    const selected = pendingPartyActions.changes.filter(
      (change) => change.selected && !change.applied
    )
    if (!selected.length) {
      notify('info', 'Keine Geschäftspartner-Änderungen ausgewählt.')
      return
    }
    setBusy(true)
    try {
      const created = new Map<string, number>()
      for (const change of selected) {
        if (!change.payload) continue
        const result = await window.api.parties.upsert(change.payload)
        if (result?.id) created.set(change.id, result.id)
      }
      const appliedIds = new Set(selected.map((change) => change.id))
      setPendingPartyActions({
        ...pendingPartyActions,
        status: 'APPLIED',
        changes: pendingPartyActions.changes.map((change) =>
          appliedIds.has(change.id)
            ? {
                ...change,
                partyId: created.get(change.id) ?? change.partyId ?? null,
                applied: true
              }
            : change
        )
      })
      pushMessage({
        role: 'assistant',
        title: 'Geschäftspartner übernommen',
        body: `${selected.length} Geschäftspartner-Änderung(en) übernommen.`,
        meta: 'VereinO-Daten geändert'
      })
      dispatchDataChanged(['parties', 'vouchers', 'invoices'])
      notify('success', `${selected.length} Geschäftspartner-Änderungen übernommen.`)
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Geschäftspartner-Änderung fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  const applyPendingBudgetActions = async () => {
    if (!pendingBudgetActions || pendingBudgetActions.status === 'APPLIED') return
    const selected = pendingBudgetActions.changes.filter(
      (change) => change.selected && !change.applied
    )
    if (!selected.length) {
      notify('info', 'Keine Budget-Änderungen ausgewählt.')
      return
    }
    setBusy(true)
    try {
      const resolvedBudgets: Array<{ id: number; label: string }> = []
      for (const change of selected) {
        if (change.action === 'DELETE') {
          if (!change.budgetId)
            throw new Error(`Budget "${change.name}" kann ohne ID nicht gelöscht werden.`)
          await window.api.budgets.delete({ id: change.budgetId })
        } else if (change.payload) {
          const result = await window.api.budgets.upsert(change.payload)
          if (result?.id)
            resolvedBudgets.push({ id: result.id, label: budgetLabelFromChange(change) })
        }
      }
      const appliedIds = new Set(selected.map((change) => change.id))
      setPendingBudgetActions({
        ...pendingBudgetActions,
        status: 'APPLIED',
        changes: pendingBudgetActions.changes.map((change) => {
          if (!appliedIds.has(change.id)) return change
          const resolved = resolvedBudgets.find(
            (budget) =>
              normalizeLookup(budget.label) === normalizeLookup(budgetLabelFromChange(change))
          )
          return { ...change, budgetId: resolved?.id ?? change.budgetId, applied: true }
        })
      })
      await resolvePendingVoucherBudgetTargets(resolvedBudgets)
      pushMessage({
        role: 'assistant',
        title: 'Budgets geändert',
        body: `${selected.length} Budget-Änderung(en) übernommen.`,
        meta: 'VereinO-Daten geändert'
      })
      dispatchDataChanged(['budgets', 'vouchers'])
      await loadMentionOptions()
      notify('success', `${selected.length} Budget-Änderungen übernommen.`)
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Budget-Änderung fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  const applyPendingEarmarkActions = async () => {
    if (!pendingEarmarkActions || pendingEarmarkActions.status === 'APPLIED') return
    const selected = pendingEarmarkActions.changes.filter(
      (change) => change.selected && !change.applied
    )
    if (!selected.length) {
      notify('info', 'Keine Zweckbindungs-Änderungen ausgewählt.')
      return
    }
    setBusy(true)
    try {
      for (const change of selected) {
        if (change.action === 'DELETE') {
          if (!change.earmarkId)
            throw new Error(`Zweckbindung "${change.name}" kann ohne ID nicht gelöscht werden.`)
          await window.api.bindings.delete({ id: change.earmarkId })
        } else if (change.payload) {
          await window.api.bindings.upsert(change.payload)
        }
      }
      const appliedIds = new Set(selected.map((change) => change.id))
      setPendingEarmarkActions({
        ...pendingEarmarkActions,
        status: 'APPLIED',
        changes: pendingEarmarkActions.changes.map((change) =>
          appliedIds.has(change.id) ? { ...change, applied: true } : change
        )
      })
      pushMessage({
        role: 'assistant',
        title: 'Zweckbindungen geändert',
        body: `${selected.length} Zweckbindungs-Änderung(en) übernommen.`,
        meta: 'VereinO-Daten geändert'
      })
      dispatchDataChanged(['earmarks', 'vouchers'])
      await loadMentionOptions()
      notify('success', `${selected.length} Zweckbindungs-Änderungen übernommen.`)
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Zweckbindungs-Änderung fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  const applyPendingInvoiceActions = async () => {
    if (!pendingInvoiceActions || pendingInvoiceActions.status === 'APPLIED') return
    const selected = pendingInvoiceActions.changes.filter(
      (change) => change.selected && !change.applied
    )
    if (!selected.length) {
      notify('info', 'Keine Forderung oder Verbindlichkeit ausgewählt.')
      return
    }
    setBusy(true)
    try {
      const created = new Map<string, number>()
      for (const change of selected) {
        const result = await window.api.invoices.create(change.invoice)
        if (result?.id) created.set(change.id, result.id)
      }
      const appliedIds = new Set(selected.map((change) => change.id))
      setPendingInvoiceActions({
        ...pendingInvoiceActions,
        status: 'APPLIED',
        changes: pendingInvoiceActions.changes.map((change) =>
          appliedIds.has(change.id)
            ? {
                ...change,
                applied: true,
                createdId: created.get(change.id) ?? change.createdId ?? null
              }
            : change
        )
      })
      pushMessage({
        role: 'assistant',
        title: 'Offene Posten angelegt',
        body: `${selected.length} Forderung(en)/Verbindlichkeit(en) angelegt.`,
        meta: 'VereinO-Daten geändert'
      })
      dispatchDataChanged(['invoices'])
      notify('success', `${selected.length} offene Posten angelegt.`)
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Offene Posten fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  const loadVouchersByTag = async (tag: string) => {
    const rows: VoucherRow[] = []
    let offset = 0
    const limit = 100
    while (true) {
      const result = await window.api.vouchers.list({
        tag,
        limit,
        offset,
        sortBy: 'date',
        sort: 'DESC'
      })
      rows.push(...(result.rows || []))
      if ((result.rows || []).length < limit) break
      offset += limit
    }
    return rows
  }

  const buildVoucherTagActionDraft = async (
    userPrompt: string,
    requestOverride?: { sourceTag: string; addedTags: string[] } | null
  ): Promise<AiVoucherTagActionState | null> => {
    const request = requestOverride || extractVoucherTagAppendRequest(userPrompt)
    if (!request) return null
    const tags = await loadTags()
    const sourceTag = resolveExistingTagName(request.sourceTag, tags)
    const addedTags = request.addedTags
      .map((tag) => resolveExistingTagName(tag, tags))
      .filter((tag) => normalizeLookup(tag) !== normalizeLookup(sourceTag))
      .filter(
        (tag, idx, list) =>
          list.findIndex((item) => normalizeLookup(item) === normalizeLookup(tag)) === idx
      )
    if (!sourceTag || !addedTags.length) return null
    const vouchers = await loadVouchersByTag(sourceTag)
    const changes = vouchers
      .map((voucher) => {
        const currentTags = voucher.tags || []
        const missingTags = addedTags.filter(
          (tag) =>
            !currentTags.some((existing) => normalizeLookup(existing) === normalizeLookup(tag))
        )
        if (!missingTags.length) return null
        const newTags = [...currentTags, ...missingTags]
        return {
          id: `voucher-tags-${voucher.id}`,
          voucherId: voucher.id,
          voucherNo: voucher.voucherNo,
          date: voucher.date,
          description: voucher.description,
          oldTags: currentTags,
          newTags,
          addedTags: missingTags,
          selected: true
        } satisfies AiVoucherTagActionChange
      })
      .filter(Boolean) as AiVoucherTagActionChange[]
    return {
      changes,
      sourceTag,
      addedTags,
      sourcePrompt: userPrompt,
      status: 'DRAFT'
    }
  }

  const prepareVoucherTagActions = async (userPrompt: string) => {
    const draft = await buildVoucherTagActionDraft(userPrompt)
    if (!draft) {
      pushMessage({
        role: 'assistant',
        title: 'Buchungsänderung nicht eindeutig',
        body: 'Ich konnte nicht eindeutig ableiten, welche Buchungen und welche Tags geändert werden sollen. Beispiel: „Ergänze bei allen Buchungen mit Tag Getränke zusätzlich den Tag Überweisung“.'
      })
      return false
    }
    setPendingVoucherTagActions(draft)
    pushMessage({
      role: 'assistant',
      title: 'Buchungs-Tags vorbereitet',
      body: draft.changes.length
        ? `${draft.changes.length} Buchung(en) mit Tag „${draft.sourceTag}“ bekommen zusätzlich: ${draft.addedTags.join(', ')}. Bitte prüfe die Vorschau unten.`
        : `Keine offenen Änderungen: Alle Buchungen mit Tag „${draft.sourceTag}“ haben die gewünschten Tags bereits.`,
      meta: 'Review erforderlich'
    })
    return true
  }

  const applyVoucherTagCorrection = async (userPrompt: string) => {
    if (!pendingVoucherTagActions || pendingVoucherTagActions.status === 'APPLIED') return false
    const correctedTag = extractVoucherTagCorrection(userPrompt)
    if (!correctedTag) return false
    const draft = await buildVoucherTagActionDraft(userPrompt, {
      sourceTag: correctedTag,
      addedTags: pendingVoucherTagActions.addedTags
    })
    if (!draft) return false
    setPendingVoucherTagActions(draft)
    pushMessage({
      role: 'assistant',
      title: 'Buchungs-Tags korrigiert',
      body: draft.changes.length
        ? `Okay, ich nutze jetzt den Tag „${draft.sourceTag}“. ${draft.changes.length} Buchung(en) bekommen zusätzlich: ${draft.addedTags.join(', ')}.`
        : `Okay, ich nutze jetzt den Tag „${draft.sourceTag}“. Dafür sind keine offenen Änderungen nötig.`,
      meta: 'Review aktualisiert'
    })
    return true
  }

  const toggleVoucherTagAction = (id: string) => {
    setPendingVoucherTagActions((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) =>
              change.id === id && !change.applied
                ? { ...change, selected: !change.selected }
                : change
            )
          }
        : current
    )
  }

  const applyPendingVoucherTagActions = async () => {
    if (!pendingVoucherTagActions || pendingVoucherTagActions.status === 'APPLIED') return
    const selected = pendingVoucherTagActions.changes.filter(
      (change) => change.selected && !change.applied
    )
    if (!selected.length) {
      notify('info', 'Keine Buchungsänderungen ausgewählt.')
      return
    }
    setBusy(true)
    try {
      for (const change of selected) {
        const payload: TVoucherMetaUpdateInput = { id: change.voucherId, tags: change.newTags }
        await window.api.vouchers.updateMeta(payload)
      }
      const appliedIds = new Set(selected.map((change) => change.id))
      setPendingVoucherTagActions({
        ...pendingVoucherTagActions,
        status: 'APPLIED',
        changes: pendingVoucherTagActions.changes.map((change) =>
          appliedIds.has(change.id) ? { ...change, applied: true } : change
        )
      })
      pushMessage({
        role: 'assistant',
        title: 'Buchungen geändert',
        body: `${selected.length} Buchung(en) wurden aktualisiert.`,
        meta: 'VereinO-Daten geändert'
      })
      dispatchDataChanged(['vouchers'])
      onBooked?.()
      notify('success', `${selected.length} Buchungen aktualisiert.`)
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Buchungsänderung fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  const toggleVoucherUpdate = (id: string) => {
    setPendingVoucherUpdates((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) =>
              change.id === id && !change.applied
                ? { ...change, selected: !change.selected }
                : change
            )
          }
        : current
    )
  }

  const applyPendingVoucherUpdates = async () => {
    if (!pendingVoucherUpdates || pendingVoucherUpdates.status === 'APPLIED') return
    const selected = pendingVoucherUpdates.changes.filter(
      (change) => change.selected && !change.applied
    )
    if (!selected.length) {
      notify('info', 'Keine Buchungsänderungen ausgewählt.')
      return
    }
    setBusy(true)
    try {
      const budgetTargetsForChange = (change: AiVoucherUpdateChange) => {
        if (Array.isArray(change.newBudgets) && change.newBudgets.length > 0) {
          return change.newBudgets
        }
        if (
          change.newBudgetId !== undefined ||
          change.newBudgetLabel ||
          change.newBudgetAmount != null
        ) {
          return [
            {
              budgetId: change.newBudgetId,
              label: change.newBudgetLabel,
              amount: change.newBudgetAmount
            }
          ]
        }
        return []
      }
      const needsBudgetLookup = selected.some((change) =>
        budgetTargetsForChange(change).some((budget) => budget.budgetId == null && !!budget.label)
      )
      const needsEarmarkLookup = selected.some(
        (change) => change.newEarmarkId == null && !!change.newEarmarkLabel
      )
      const budgetLookup = needsBudgetLookup ? await buildBudgetLookup() : new Map<string, number>()
      const earmarkLookup = needsEarmarkLookup
        ? await buildEarmarkLookup()
        : new Map<string, number>()
      for (const change of selected) {
        const budgetTargets = budgetTargetsForChange(change)
        const hasBudgetChange =
          budgetTargets.length > 0 || change.newBudgetId !== undefined || !!change.newBudgetLabel
        const hasEarmarkChange = change.newEarmarkId !== undefined || !!change.newEarmarkLabel
        const fullGrossAmount = Math.abs(Number(change.grossAmount || 0))
        const resolvedBudgets = budgetTargets.map((budget) => {
          const resolvedBudgetId =
            budget.budgetId == null && budget.label
              ? budgetLookup.get(normalizeLookup(budget.label))
              : budget.budgetId
          const amount = Math.abs(Number(budget.amount ?? fullGrossAmount))
          return {
            budgetId: resolvedBudgetId,
            label: budget.label,
            amount
          }
        })
        const resolvedEarmarkId =
          hasEarmarkChange && change.newEarmarkId == null && change.newEarmarkLabel
            ? earmarkLookup.get(normalizeLookup(change.newEarmarkLabel))
            : change.newEarmarkId
        const unresolvedBudget = resolvedBudgets.find(
          (budget) => budget.budgetId == null && budget.label
        )
        if (hasBudgetChange && unresolvedBudget) {
          throw new Error(
            `Budget "${unresolvedBudget.label}" wurde noch nicht gefunden. Bitte Budget zuerst übernehmen oder Namen prüfen.`
          )
        }
        if (hasEarmarkChange && resolvedEarmarkId == null && change.newEarmarkLabel) {
          throw new Error(
            `Zweckbindung "${change.newEarmarkLabel}" wurde noch nicht gefunden. Bitte Zweckbindung zuerst übernehmen oder Namen prüfen.`
          )
        }
        const earmarkAmount = Math.abs(Number(change.newEarmarkAmount ?? fullGrossAmount))
        if (
          hasBudgetChange &&
          resolvedBudgets.some((budget) => budget.budgetId != null && budget.amount <= 0)
        ) {
          throw new Error(
            `Budget-Zuordnung fuer Buchung ${change.voucherNo} hat keinen gueltigen Bruttobetrag.`
          )
        }
        if (hasEarmarkChange && resolvedEarmarkId != null && earmarkAmount <= 0) {
          throw new Error(
            `Zweckbindungs-Zuordnung fuer Buchung ${change.voucherNo} hat keinen gueltigen Bruttobetrag.`
          )
        }
        const payload: TVoucherMetaUpdateInput = {
          id: change.voucherId,
          ...(hasBudgetChange
            ? {
                budgets: resolvedBudgets
                  .filter((budget) => budget.budgetId != null)
                  .map((budget) => ({ budgetId: Number(budget.budgetId), amount: budget.amount }))
              }
            : {}),
          ...(hasEarmarkChange
            ? {
                earmarks:
                  resolvedEarmarkId != null
                    ? [{ earmarkId: resolvedEarmarkId, amount: earmarkAmount }]
                    : []
              }
            : {}),
          ...(change.newTags ? { tags: change.newTags } : {}),
          ...(change.newPrimaryClassificationValueId !== undefined
            ? { primaryClassificationValueId: change.newPrimaryClassificationValueId ?? undefined }
            : {})
        }
        await window.api.vouchers.updateMeta(payload)
      }
      const appliedIds = new Set(selected.map((change) => change.id))
      setPendingVoucherUpdates({
        ...pendingVoucherUpdates,
        status: 'APPLIED',
        changes: pendingVoucherUpdates.changes.map((change) => {
          if (!appliedIds.has(change.id)) return change
          const resolvedBudgetId =
            change.newBudgetId == null && change.newBudgetLabel
              ? budgetLookup.get(normalizeLookup(change.newBudgetLabel))
              : change.newBudgetId
          const resolvedBudgets = budgetTargetsForChange(change).map((budget) => ({
            ...budget,
            budgetId:
              budget.budgetId == null && budget.label
                ? (budgetLookup.get(normalizeLookup(budget.label)) ?? budget.budgetId)
                : budget.budgetId
          }))
          const resolvedEarmarkId =
            change.newEarmarkId == null && change.newEarmarkLabel
              ? earmarkLookup.get(normalizeLookup(change.newEarmarkLabel))
              : change.newEarmarkId
          return {
            ...change,
            newBudgetId: resolvedBudgets[0]?.budgetId ?? resolvedBudgetId ?? change.newBudgetId,
            newBudgets: resolvedBudgets.length ? resolvedBudgets : change.newBudgets,
            newEarmarkId: resolvedEarmarkId ?? change.newEarmarkId,
            applied: true
          }
        })
      })
      pushMessage({
        role: 'assistant',
        title: 'Buchungen aktualisiert',
        body: `${selected.length} Buchung(en) wurden aus dem Agent-Review übernommen.`,
        meta: 'VereinO-Daten geändert'
      })
      dispatchDataChanged(['vouchers'])
      onBooked?.()
      notify('success', `${selected.length} Buchungsänderungen übernommen.`)
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Buchungsänderung fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  const applyPendingVoucherReverse = async () => {
    if (!pendingVoucherReverse || pendingVoucherReverse.status === 'APPLIED') return
    setBusy(true)
    const reversed: Array<{ id: number; voucherNo?: string | null; reversedVoucherNo: string }> = []
    const failures: string[] = []
    try {
      for (const voucher of pendingVoucherReverse.vouchers) {
        try {
          const res = await window.api.vouchers.reverse({
            originalId: voucher.id,
            reason: pendingVoucherReverse.reason || 'Storno per VereinO KI-Agent'
          })
          reversed.push({
            id: voucher.id,
            voucherNo: voucher.voucherNo,
            reversedVoucherNo: res.voucherNo
          })
        } catch (error: any) {
          failures.push(
            `${voucher.voucherNo || `#${voucher.id}`}: ${error?.message || String(error)}`
          )
        }
      }
      const reversedById = new Map(reversed.map((item) => [item.id, item.reversedVoucherNo]))
      const nextState: AiVoucherReverseState = {
        ...pendingVoucherReverse,
        status: failures.length ? 'DRAFT' : 'APPLIED',
        vouchers: pendingVoucherReverse.vouchers.map((voucher) => ({
          ...voucher,
          reversedVoucherNo: reversedById.get(voucher.id) || voucher.reversedVoucherNo || null
        }))
      }
      setPendingVoucherReverse(nextState)
      if (reversed.length) {
        dispatchDataChanged(['vouchers'])
        onBooked?.()
      }
      pushMessage({
        role: 'assistant',
        title: failures.length ? 'Storno teilweise erstellt' : 'Storno erstellt',
        body: [
          reversed.length
            ? `Storniert: ${reversed.map((item) => `${item.voucherNo || `#${item.id}`} -> ${item.reversedVoucherNo}`).join(', ')}`
            : 'Keine Buchung wurde storniert.',
          failures.length ? `Fehler:\n${failures.join('\n')}` : ''
        ]
          .filter(Boolean)
          .join('\n'),
        meta: reversed.length ? 'VereinO-Daten geändert' : 'Keine Änderung'
      })
      if (failures.length) notify('error', `Storno teilweise fehlgeschlagen: ${failures[0]}`)
      else notify('success', `${reversed.length} Storno(s) erstellt.`)
    } finally {
      setBusy(false)
    }
  }

  const applyPendingVoucherRebook = async () => {
    if (!pendingVoucherRebook || pendingVoucherRebook.status === 'APPLIED') return
    setBusy(true)
    try {
      const reversal = await window.api.vouchers.reverse({
        originalId: pendingVoucherRebook.original.id,
        reason: pendingVoucherRebook.reason || 'Korrektur per VereinO KI-Agent'
      })
      const replacement = pendingVoucherRebook.replacement
      const payload: TVoucherCreateInput = {
        date: replacement.date,
        type: replacement.type,
        sphere: replacement.sphere,
        primaryClassificationValueId: replacement.primaryClassificationValueId ?? undefined,
        description: replacement.description,
        note: replacement.note || `Ersatzbuchung nach Storno ${reversal.voucherNo}.`,
        grossAmount: Number(replacement.grossAmount || 0),
        vatRate: Number(replacement.vatRate || 0),
        paymentMethod: replacement.paymentMethod || undefined,
        paymentAccountId: replacement.paymentAccountId ?? undefined,
        budgets: replacement.budgets || undefined,
        earmarks: replacement.earmarks || undefined,
        tags: replacement.tags || [],
        bankTransactionId: replacement.bankTransactionId || undefined
      }
      const created = await window.api.vouchers.create(payload)
      setPendingVoucherRebook({
        ...pendingVoucherRebook,
        status: 'APPLIED',
        reversalVoucherNo: reversal.voucherNo,
        newVoucherNo: created.voucherNo
      })
      pushMessage({
        role: 'assistant',
        title: 'Buchung korrigiert',
        body: `Beleg ${pendingVoucherRebook.original.voucherNo || `#${pendingVoucherRebook.original.id}`} wurde storniert (${reversal.voucherNo}) und als ${replacement.type} neu angelegt (${created.voucherNo}).`,
        meta: 'VereinO-Daten geändert'
      })
      dispatchDataChanged(['vouchers'])
      onBooked?.()
      notify('success', `Korrektur erstellt: ${reversal.voucherNo} + ${created.voucherNo}.`)
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Storno/Ersatzbuchung fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  const toggleBankLink = (id: string) => {
    setPendingBankLinks((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) =>
              change.id === id && !change.applied
                ? { ...change, selected: !change.selected }
                : change
            )
          }
        : current
    )
  }

  const applyPendingBankLinks = async () => {
    if (!pendingBankLinks || pendingBankLinks.status === 'APPLIED') return
    const selected = pendingBankLinks.changes.filter((change) => change.selected && !change.applied)
    if (!selected.length) {
      notify('info', 'Keine Bankbeleg-Verknüpfungen ausgewählt.')
      return
    }
    setBusy(true)
    const appliedIds = new Set<string>()
    const failures: string[] = []
    try {
      for (const change of selected) {
        try {
          const linked =
            change.targetKind === 'RECURRING' && change.recurringBookingId
              ? await window.api.recurringBookings.book({
                  recurringBookingId: change.recurringBookingId,
                  occurrenceId: change.occurrenceId || undefined,
                  scheduledDate: change.scheduledDate || undefined,
                  bookingDate:
                    change.bankBookingDate ||
                    change.scheduledDate ||
                    new Date().toISOString().slice(0, 10),
                  amount: change.bankAmount,
                  bankTransactionId: change.bankTransactionId
                })
              : await window.api.bankTransactions.link({
                  id: change.bankTransactionId,
                  voucherId: Number(change.voucherId)
                })
          appliedIds.add(change.id)
          updateBankSuggestion(change.bankTransactionId, {
            resolved: 'LINKED',
            resolvedVoucherId: change.targetKind === 'RECURRING' ? linked.id : change.voucherId,
            resolvedVoucherNo: change.voucherNo || linked.voucherNo || null
          })
        } catch (error: any) {
          failures.push(
            `Bankbeleg #${change.bankTransactionId}: ${error?.message || String(error)}`
          )
        }
      }

      setPendingBankLinks({
        ...pendingBankLinks,
        status: failures.length ? 'DRAFT' : 'APPLIED',
        changes: pendingBankLinks.changes.map((change) =>
          appliedIds.has(change.id)
            ? { ...change, applied: true, selected: true, error: null }
            : failures.length && selected.some((item) => item.id === change.id)
              ? {
                  ...change,
                  error:
                    failures.find((failure) => failure.includes(`#${change.bankTransactionId}`)) ||
                    null
                }
              : change
        )
      })

      if (appliedIds.size) {
        pushMessage({
          role: 'assistant',
          title: failures.length ? 'Bankbelege teilweise verknüpft' : 'Bankbelege verknüpft',
          body: failures.length
            ? `${appliedIds.size} Bankbeleg(e) wurden verknüpft. Offen: ${failures.join(' ')}`
            : `${appliedIds.size} Bankbeleg(e) wurden mit bestehenden Buchungen oder Dauerbuchungen zusammengeführt.`,
          meta: 'VereinO-Daten geändert'
        })
        dispatchDataChanged(['bank-imports', 'vouchers', 'recurring-bookings'])
        onBooked?.()
      }
      if (failures.length)
        notify('error', `Bankverknüpfung teilweise fehlgeschlagen: ${failures[0]}`)
      else notify('success', `${appliedIds.size} Bankbeleg(e) verknüpft.`)
    } finally {
      setBusy(false)
    }
  }

  const linkBankSuggestion = async (suggestion: AiBankReviewSuggestion) => {
    if (!suggestion.voucherId) {
      notify('error', 'Für diesen Treffer fehlt die Buchungs-ID.')
      return
    }
    setBusy(true)
    try {
      const linked = await window.api.bankTransactions.link({
        id: suggestion.transactionId,
        voucherId: suggestion.voucherId
      })
      updateBankSuggestion(suggestion.transactionId, {
        resolved: 'LINKED',
        resolvedVoucherId: suggestion.voucherId,
        resolvedVoucherNo: suggestion.voucherNo || linked.voucherNo || null
      })
      notify('success', `Bankbeleg #${suggestion.transactionId} wurde verknüpft.`)
      onBooked?.()
    } catch (error: any) {
      notify('error', error?.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  const applyRecurringBankSuggestion = async (suggestion: AiBankReviewSuggestion) => {
    if (!suggestion.recurringBookingId || (!suggestion.occurrenceId && !suggestion.scheduledDate)) {
      notify('error', 'Für diesen Treffer fehlen Dauerbuchungs-ID oder Fälligkeit.')
      return
    }
    setBusy(true)
    try {
      const transaction = suggestion.transaction || {}
      const created = await window.api.recurringBookings.book({
        recurringBookingId: suggestion.recurringBookingId,
        occurrenceId: suggestion.occurrenceId || undefined,
        scheduledDate: suggestion.scheduledDate || undefined,
        bookingDate:
          transaction.bookingDate ||
          suggestion.scheduledDate ||
          new Date().toISOString().slice(0, 10),
        amount: Number(transaction.amount || 0) || undefined,
        bankTransactionId: suggestion.transactionId
      })
      updateBankSuggestion(suggestion.transactionId, {
        resolved: 'LINKED',
        resolvedVoucherId: created.id,
        resolvedVoucherNo: created.voucherNo
      })
      dispatchDataChanged(['bank-imports', 'vouchers', 'recurring-bookings'])
      notify(
        'success',
        `Bankbeleg #${suggestion.transactionId} wurde mit der Dauerbuchung zusammengeführt.`
      )
      onBooked?.()
    } catch (error: any) {
      notify('error', error?.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  const createBankSuggestionBooking = async (suggestion: AiBankReviewSuggestion) => {
    const candidate = suggestion.bookingCandidate
    if (!candidate) {
      notify('error', 'Für diesen Bankbeleg fehlt ein Buchungsvorschlag.')
      return
    }
    setBusy(true)
    try {
      const transaction = suggestion.transaction || {}
      const res = await window.api.vouchers.create({
        date: candidate.date,
        type: candidate.type,
        sphere: candidate.sphere,
        primaryClassificationValueId: candidate.primaryClassificationValueId ?? undefined,
        description: candidate.description,
        note: ['Aus KI-Bankimport-Vorschlag erstellt.', suggestion.reason]
          .filter(Boolean)
          .join('\n'),
        grossAmount: candidate.grossAmount,
        vatRate: candidate.vatRate ?? 0,
        paymentMethod:
          candidate.paymentMethod ??
          paymentMethodForAccount(transaction.paymentAccountKind) ??
          'BANK',
        paymentAccountId: candidate.paymentAccountId ?? transaction.paymentAccountId ?? undefined,
        budgets: (candidate.budgets || []).map((budget) => ({
          budgetId: budget.id,
          amount: budget.amount
        })),
        earmarks: (candidate.earmarks || []).map((earmark) => ({
          earmarkId: earmark.id,
          amount: earmark.amount
        })),
        tags: candidate.tags || [],
        bankTransactionId: suggestion.transactionId
      })
      updateBankSuggestion(suggestion.transactionId, {
        resolved: 'CREATED',
        resolvedVoucherId: res.id,
        resolvedVoucherNo: res.voucherNo
      })
      notify('success', `Buchung ${res.voucherNo} erstellt und Bankbeleg verknüpft.`)
      onBooked?.()
    } catch (error: any) {
      notify('error', error?.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  const openBankSuggestionBookingModal = (suggestion: AiBankReviewSuggestion) => {
    const candidate = suggestion.bookingCandidate
    if (!candidate) {
      notify('error', 'Für diesen Bankbeleg fehlt ein Buchungsvorschlag.')
      return
    }
    const transaction = suggestion.transaction || {}
    window.dispatchEvent(
      new CustomEvent('ai:open-booking-draft', {
        detail: {
          qa: {
            date: candidate.date,
            type: candidate.type,
            sphere: candidate.sphere,
            mode: 'GROSS',
            grossAmount: candidate.grossAmount,
            vatRate: candidate.vatRate ?? 0,
            description: candidate.description,
            note: ['Aus KI-Bankimport-Vorschlag vorbereitet.', suggestion.reason]
              .filter(Boolean)
              .join('\n'),
            paymentMethod:
              candidate.paymentMethod ??
              paymentMethodForAccount(transaction.paymentAccountKind) ??
              'BANK',
            paymentAccountId: candidate.paymentAccountId ?? transaction.paymentAccountId ?? null,
            paymentAccountName: transaction.paymentAccountName ?? null,
            budgets: (candidate.budgets || []).map((budget) => ({
              budgetId: budget.id,
              amount: budget.amount
            })),
            earmarksAssigned: (candidate.earmarks || []).map((earmark) => ({
              earmarkId: earmark.id,
              amount: earmark.amount
            })),
            tags: candidate.tags || [],
            bankTransactionId: suggestion.transactionId
          }
        }
      })
    )
    pushMessage({
      role: 'assistant',
      title: 'Buchungsmodal geöffnet',
      body: `Bankbeleg #${suggestion.transactionId} wurde als bearbeitbarer Buchungsentwurf geöffnet. Speichern im Modal erstellt und verknüpft die Buchung.`,
      meta: 'Review im Buchungsmodal'
    })
  }

  const checkBankSuggestion = async (suggestion: AiBankReviewSuggestion) => {
    setBusy(true)
    try {
      await window.api.bankTransactions.check({
        id: suggestion.transactionId,
        note: suggestion.reason || 'Per VereinO KI geprüft.'
      })
      updateBankSuggestion(suggestion.transactionId, { resolved: 'CHECKED' })
      notify('success', `Bankbeleg #${suggestion.transactionId} wurde als geprüft markiert.`)
      onBooked?.()
    } catch (error: any) {
      notify('error', error?.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  const applyBankReviewFollowup = async (userPrompt: string) => {
    if (!bankReview) return false
    const pool =
      (bankReview.allSuggestions?.length ? bankReview.allSuggestions : bankReview.suggestions) || []
    if (!pool.length) return false
    const normalized = normalizeLookup(userPrompt)
    const wantsBankAction =
      /(bankimport|bankbeleg|beleg|transaktion|diesen|diese|der|sommerfest|getraenk|getrank|verpflegung|grillgut|buchung|buche|buchen|anleg|erstell|verknuepf|verknupf)/.test(
        normalized
      )
    if (!wantsBankAction) return false
    const matched = extractBankSuggestionsFromAiText(
      { ...(bankReview as TAiBankImportReviewOutput), suggestions: pool },
      userPrompt
    )
    const selected = matched.length
      ? matched
      : bankReview.suggestions.length === 1
        ? bankReview.suggestions
        : []
    if (!selected.length) return false
    setBankReview({
      ...bankReview,
      suggestions: selected,
      allSuggestions: pool,
      sourceTotal: bankReview.sourceTotal || pool.length,
      filterSummary:
        selected.length === pool.length
          ? null
          : `${selected.length} von ${pool.length} KI-Vorschlägen für diese Anfrage ausgewählt.`
    })
    const shouldCreate = /(buchung|buche|buchen|anleg|erstell|verbuch|uebernehm|ubernehm)/.test(
      normalized
    )
    const wantsDirectBooking =
      /(direkt|sofort|ohne review|ohne pruefung|ohne prufung|endgueltig|endgultig)/.test(normalized)
    const suggestion = selected[0]
    if (shouldCreate && selected.length === 1) {
      if (suggestion.action === 'LINK_EXISTING' && suggestion.voucherId) {
        await linkBankSuggestion(suggestion)
        pushMessage({
          role: 'assistant',
          title: 'Bankbeleg verknüpft',
          body: `Der ausgewählte Bankbeleg #${suggestion.transactionId} wurde mit der bestehenden Buchung verknüpft.`,
          meta: 'VereinO-Daten geändert'
        })
      } else if (suggestion.bookingCandidate && wantsDirectBooking) {
        await createBankSuggestionBooking(suggestion)
        pushMessage({
          role: 'assistant',
          title: 'Bankimport-Buchung erstellt',
          body: `Der ausgewählte Bankbeleg #${suggestion.transactionId} wurde als Buchung erstellt und verknüpft.`,
          meta: 'VereinO-Daten geändert'
        })
      } else if (suggestion.bookingCandidate) {
        openBankSuggestionBookingModal(suggestion)
      } else {
        pushMessage({
          role: 'assistant',
          title: 'Bankbeleg ausgewählt',
          body: 'Ich habe den passenden Bankbeleg ausgewählt, aber für ihn fehlt ein eindeutiger Buchungsvorschlag. Bitte prüfe ihn unten manuell.',
          meta: 'Review erforderlich'
        })
      }
      return true
    }
    pushMessage({
      role: 'assistant',
      title: selected.length === 1 ? 'Bankbeleg ausgewählt' : 'Bankbelege gefiltert',
      body:
        selected.length === 1
          ? `Ich habe den passenden Bankbeleg #${selected[0].transactionId} ausgewählt. Du kannst ihn unten buchen oder verknüpfen.`
          : `${selected.length} passende Bankbelege wurden ausgewählt. Bitte prüfe die Vorschläge unten.`,
      meta: 'Review aktualisiert'
    })
    return true
  }

  const processText = async (userPrompt: string) => {
    const promptForModel = buildConversationPrompt(userPrompt)
    const type = routeTextType(promptForModel)
    const job = await window.api.ai.jobs.create({
      type: type === 'REPORT_TEXT' ? 'REPORT_TEXT' : 'MEMBER_TEXT',
      title: userPrompt.slice(0, 80),
      prompt: promptForModel
    })
    const processed = await window.api.ai.jobs.process({ id: job.id })
    if (processed.status === 'FAILED') {
      throw new Error(processed.error || 'KI-Textauftrag fehlgeschlagen.')
    }
    const draft = processed.result as { title: string; body: string; notes?: string[] }
    await loadJobs()
    const recoveredMembers = parseMemberDraftsFromText(
      [promptForModel, draft.title, draft.body].join('\n')
    )
    if (
      recoveredMembers &&
      (wantsMemberCreation(userPrompt) || wantsMemberCreation(`${draft.title}\n${draft.body}`))
    ) {
      setPendingMembers(recoveredMembers)
      pushMessage({
        role: 'assistant',
        title: 'Mitgliederanlage vorbereitet',
        body: `${recoveredMembers.members.length} Mitglied(er) wurden erkannt und unten als übernehmbarer Vorschlag vorbereitet.`,
        meta: ['Aktion erkannt', formatAiUsage(processed.usage)].filter(Boolean).join(' · ')
      })
      return
    }
    if (wantsTagAction(userPrompt)) {
      const tagDraft = await buildTagActionDraft(userPrompt, `${draft.title}\n${draft.body}`)
      if (tagDraft) {
        setPendingTagActions(tagDraft)
        pushMessage({
          role: 'assistant',
          title: 'Tag-Änderungen vorbereitet',
          body: `${tagDraft.changes.length} Tag-Änderung(en) aus der KI-Antwort vorbereitet. Bitte prüfe die Vorschau unten.`,
          meta: ['Review erforderlich', formatAiUsage(processed.usage)].filter(Boolean).join(' · ')
        })
        return
      }
    }
    const voucherTagDraft = await buildVoucherTagActionDraft(
      `${userPrompt}\n${draft.title}\n${draft.body}`
    )
    if (
      voucherTagDraft &&
      (wantsVoucherTagAction(userPrompt) ||
        wantsVoucherTagAction(draft.body) ||
        /review-vorschlag/i.test(draft.body))
    ) {
      setPendingVoucherTagActions(voucherTagDraft)
      pushMessage({
        role: 'assistant',
        title: 'Buchungs-Tags vorbereitet',
        body: voucherTagDraft.changes.length
          ? `${voucherTagDraft.changes.length} Buchung(en) mit Tag „${voucherTagDraft.sourceTag}“ bekommen zusätzlich: ${voucherTagDraft.addedTags.join(', ')}. Bitte prüfe die Vorschau unten.`
          : `Keine offenen Änderungen: Alle Buchungen mit Tag „${voucherTagDraft.sourceTag}“ haben die gewünschten Tags bereits.`,
        meta: ['Aus KI-Antwort in Review umgewandelt', formatAiUsage(processed.usage)]
          .filter(Boolean)
          .join(' · ')
      })
      return
    }
    pushMessage({
      role: 'assistant',
      title: draft.title,
      body: draft.body,
      meta: [
        typeLabel(type === 'REPORT_TEXT' ? 'REPORT_TEXT' : 'MEMBER_TEXT'),
        formatAiUsage(processed.usage)
      ]
        .filter(Boolean)
        .join(' · '),
      jobId: processed.id,
      reviewable: false
    })
  }

  const applyPaymentAccountFollowup = async (userPrompt: string) => {
    if (!selectedJob || !analysis) return false
    if (selectedJob.type !== 'BOOKING_FROM_DOCUMENTS' || selectedJob.status !== 'NEEDS_REVIEW')
      return false
    const account = findPaymentAccountHint(userPrompt, paymentAccounts)
    if (!account) return false
    const applyAll = shouldApplyAccountHintToAll(userPrompt)
    const paymentMethod = paymentMethodForAccount(account.kind) || null
    let changed = false
    const nextResult: TAiBookingAnalysisResult = {
      ...analysis,
      candidates: analysis.candidates.map((item, idx) => {
        if (isCandidateApproved(item, selectedJob)) return item
        if (!applyAll && idx !== selectedCandidate && item.paymentAccountId) return item
        changed = true
        return {
          ...item,
          paymentAccountId: account.id,
          paymentMethod,
          warnings: (item.warnings || []).filter(
            (warning) => !/kein konto|kein zahlungsweg|zahlung.*platzhalter/i.test(String(warning))
          )
        }
      })
    }
    if (!changed) return false
    const saved = await window.api.ai.jobs.updateCandidate({
      id: selectedJob.id,
      result: nextResult
    })
    selectJob(saved, selectedCandidate)
    pushMessage({
      role: 'assistant',
      title: 'Zahlungskonto gesetzt',
      body: `${account.name} wurde ${applyAll ? 'für alle Buchungsvorschläge' : 'für den aktuellen Buchungsvorschlag'} übernommen.`,
      jobId: selectedJob.id
    })
    await loadJobs()
    return true
  }

  const wantsCurrentBookingReviewAction = (userPrompt: string, plan: TAiActionPlan) => {
    if (!selectedJob || !analysis || selectedJob.type !== 'BOOKING_FROM_DOCUMENTS') return false
    const normalized = normalizeLookup(userPrompt)
    if (plan.entity === 'vouchers' && ['create', 'update'].includes(plan.operation)) return true
    if (
      /(diese|diesen|alle|vorschlaege|vorschlage|review|import|buchungen|kandidaten|hierzu)/.test(
        normalized
      ) &&
      /(buch|buche|buchen|verbuch|uebernehm|ubernehm|freig|freigabe|tag|tags|stammdaten|brutto|netto)/.test(
        normalized
      )
    )
      return true
    return false
  }

  const ensureCandidateTags = async (candidateTags: string[]) => {
    const existingTags = await loadTags()
    const existing = new Set(existingTags.map((tag) => normalizeLookup(tag.name)))
    const created: string[] = []
    for (const rawTag of candidateTags) {
      const tag = cleanTagCandidateName(rawTag)
      if (!isLikelyTagName(tag)) continue
      if (existing.has(normalizeLookup(tag))) continue
      await window.api.tags.upsert({ name: tag, color: tagColorForName(tag) })
      existing.add(normalizeLookup(tag))
      created.push(tag)
    }
    if (created.length) dispatchDataChanged(['tags'])
    return created
  }

  const findMissingCandidateTags = async (candidateTags: string[]) => {
    const existingTags = await loadTags()
    const existing = new Set(existingTags.map((tag) => normalizeLookup(tag.name)))
    const missing: string[] = []
    for (const rawTag of candidateTags) {
      const tag = cleanTagCandidateName(rawTag)
      if (!isLikelyTagName(tag)) continue
      if (existing.has(normalizeLookup(tag))) continue
      if (!missing.some((name) => normalizeLookup(name) === normalizeLookup(tag))) missing.push(tag)
    }
    return missing
  }

  const askMissingTagsBeforeBooking = (
    userPrompt: string,
    plan: TAiActionPlan,
    missingTags: string[]
  ) => {
    const question: AiPlannerQuestionState = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      kind: 'BOOKING_REVIEW_MISSING_TAGS',
      question: 'Wie soll VereinO mit neuen Tags aus diesem Buchungsreview umgehen?',
      body: `Diese Tags sind in VereinO noch nicht angelegt: ${missingTags.join(', ')}.`,
      sourcePrompt: userPrompt,
      plan,
      missingTags,
      status: 'OPEN',
      options: [
        {
          id: 'CREATE_TAGS_AND_BOOK_ALL',
          label: 'Tags anlegen & buchen',
          description:
            'Fehlende Tags werden angelegt, danach werden alle offenen Vorschläge gebucht.'
        },
        {
          id: 'BOOK_ALL_WITHOUT_NEW_TAGS',
          label: 'Ohne neue Tags buchen',
          description:
            'Nicht vorhandene Tags werden aus den Vorschlägen entfernt, danach wird gebucht.'
        },
        {
          id: 'CREATE_TAGS_ONLY',
          label: 'Nur Tags anlegen',
          description: 'Die Tags werden angelegt, die Buchungsvorschläge bleiben zur Prüfung offen.'
        },
        {
          id: 'CANCEL',
          label: 'Abbrechen',
          description: 'Es wird nichts geändert.'
        }
      ]
    }
    setPendingPlannerQuestion(question)
    pushMessage({
      role: 'assistant',
      title: 'Rückfrage vor dem Buchen',
      body: `${question.body}\nBitte wähle unten aus, wie ich fortfahren soll.`,
      meta: 'Planer · Entscheidung nötig'
    })
  }

  const applyCurrentBookingReviewAction = async (
    userPrompt: string,
    plan: TAiActionPlan,
    options: {
      skipClarification?: boolean
      bookAll?: boolean
      createMissingTags?: boolean
      dropMissingTags?: boolean
    } = {}
  ) => {
    if (!selectedJob || !analysis) return false
    const normalized = normalizeLookup(userPrompt)
    const shouldBookAll =
      /(alle|saemtliche|samtliche|diese|diesen)/.test(normalized) &&
      /(buch|buche|buchen|verbuch|uebernehm|ubernehm|freig|freigabe)/.test(normalized)
    const shouldCreateMissingTags =
      /(tag|tags|stammdaten|nicht exist|fehlen|fehlende|anleg|erstell)/.test(normalized) ||
      plan.changes.some((change) => normalizePlanKey(change.field).includes('tag')) ||
      shouldBookAll
    const openIndexes = analysis.candidates
      .map((candidate, idx) => ({ candidate, idx }))
      .filter(({ candidate }) => !isCandidateApproved(candidate, selectedJob))
    if (!openIndexes.length) {
      pushMessage({
        role: 'assistant',
        title: 'Keine offenen Buchungsvorschläge',
        body: 'Alle Buchungsvorschläge in diesem Review sind bereits gebucht.'
      })
      return true
    }

    const candidateTags = openIndexes.flatMap(({ candidate }) => candidate.tags || [])
    const missingTags = await findMissingCandidateTags(candidateTags)
    const bookAll = options.bookAll ?? shouldBookAll
    if (bookAll && missingTags.length && !options.skipClarification) {
      askMissingTagsBeforeBooking(userPrompt, plan, missingTags)
      return true
    }

    let createdTags: string[] = []
    const createMissingTags = options.createMissingTags ?? shouldCreateMissingTags
    if (createMissingTags) {
      createdTags = await ensureCandidateTags(candidateTags)
    }

    const nextAnalysis: TAiBookingAnalysisResult =
      options.dropMissingTags && missingTags.length
        ? {
            ...analysis,
            candidates: analysis.candidates.map((candidate) => ({
              ...candidate,
              tags: (candidate.tags || []).filter(
                (tag) =>
                  !missingTags.some((missing) => normalizeLookup(missing) === normalizeLookup(tag))
              ),
              warnings: [
                ...(candidate.warnings || []),
                'Nicht vorhandene Tags wurden auf Wunsch vor dem Buchen entfernt.'
              ]
            }))
          }
        : analysis

    const saved = await window.api.ai.jobs.updateCandidate({
      id: selectedJob.id,
      result: nextAnalysis
    })
    selectJob(saved, selectedCandidate)

    if (!bookAll) {
      pushMessage({
        role: 'assistant',
        title: 'Buchungsreview vorbereitet',
        body: [
          createdTags.length
            ? `Ich habe ${createdTags.length} fehlende Tag(s) angelegt: ${createdTags.join(', ')}.`
            : 'Die Tags im aktuellen Review sind vorbereitet.',
          'Die Buchungen sind noch nicht übernommen. Bitte bestätige, wenn ich sie buchen soll.'
        ].join('\n'),
        meta: 'Review aktualisiert'
      })
      await loadJobs()
      return true
    }

    const booked: string[] = []
    const failed: string[] = []
    for (const { idx } of openIndexes) {
      try {
        const res = await window.api.ai.jobs.approveCandidate({
          id: selectedJob.id,
          candidateIndex: idx
        })
        booked.push(res.voucherNo)
      } catch (error: any) {
        failed.push(`Vorschlag ${idx + 1}: ${error?.message || String(error)}`)
      }
    }
    const refreshed = await window.api.ai.jobs.get({ id: selectedJob.id })
    selectJob(refreshed, firstOpenCandidateIndex(refreshed))
    await loadJobs()
    onBooked?.()
    pushMessage({
      role: 'assistant',
      title: failed.length ? 'Buchungsreview teilweise gebucht' : 'Buchungsreview gebucht',
      body: [
        createdTags.length
          ? `Angelegte Tags: ${createdTags.join(', ')}`
          : 'Keine fehlenden Tags mussten angelegt werden.',
        booked.length ? `Gebucht: ${booked.join(', ')}` : 'Keine Buchung wurde erstellt.',
        failed.length ? `Fehler:\n${failed.join('\n')}` : ''
      ]
        .filter(Boolean)
        .join('\n'),
      meta: 'VereinO-Daten geändert'
    })
    return true
  }

  const resolvePlannerQuestion = async (option: AiPlannerQuestionOption) => {
    if (!pendingPlannerQuestion || pendingPlannerQuestion.status !== 'OPEN') return
    setPendingPlannerQuestion({ ...pendingPlannerQuestion, status: 'RESOLVED' })
    pushMessage({
      role: 'user',
      title: 'Du',
      body: option.label
    })
    if (option.id === 'CANCEL') {
      pushMessage({
        role: 'assistant',
        title: 'Ausführung abgebrochen',
        body: 'Okay, ich habe nichts geändert. Der Buchungsreview bleibt offen.'
      })
      return
    }
    setBusy(true)
    try {
      if (option.id === 'CREATE_TAGS_ONLY') {
        await applyCurrentBookingReviewAction(
          pendingPlannerQuestion.sourcePrompt,
          pendingPlannerQuestion.plan,
          {
            skipClarification: true,
            bookAll: false,
            createMissingTags: true
          }
        )
      } else if (option.id === 'BOOK_ALL_WITHOUT_NEW_TAGS') {
        await applyCurrentBookingReviewAction(
          pendingPlannerQuestion.sourcePrompt,
          pendingPlannerQuestion.plan,
          {
            skipClarification: true,
            bookAll: true,
            createMissingTags: false,
            dropMissingTags: true
          }
        )
      } else {
        await applyCurrentBookingReviewAction(
          pendingPlannerQuestion.sourcePrompt,
          pendingPlannerQuestion.plan,
          {
            skipClarification: true,
            bookAll: true,
            createMissingTags: true
          }
        )
      }
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Ausführung fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  const planConversation = () =>
    messages.slice(-10).map((message) => ({
      role: message.role,
      title: message.title,
      body: message.body
    }))

  const hasRecentContributionContext = () =>
    messages.slice(-6).some((message) => {
      const text = normalizeLookup(
        `${message.title || ''}\n${message.body || ''}\n${message.meta || ''}`
      )
      return /(offene mitgliedsbeitraege|beitragsstatus|faellige offene beitraege|mitgliedsbeitrag|beitragszahlung)/.test(
        text
      )
    })

  const executeAiActionPlan = async (userPrompt: string) => {
    const modifiesPendingReview = hasOpenReviewWorkflow() && wantsModifyPendingReview(userPrompt)
    if (!files.length && (await applyPaymentAccountFollowup(userPrompt))) {
      return true
    }
    if (
      !modifiesPendingReview &&
      !files.length &&
      pendingRecurringBooking &&
      pendingRecurringBooking.status !== 'APPLIED' &&
      wantsApplyPendingVoucherActions(userPrompt)
    ) {
      await applyPendingRecurringBooking()
      return true
    }
    if (
      !modifiesPendingReview &&
      !files.length &&
      pendingBankLinks &&
      pendingBankLinks.status !== 'APPLIED' &&
      wantsApplyPendingVoucherActions(userPrompt)
    ) {
      await applyPendingBankLinks()
      return true
    }
    if (
      !modifiesPendingReview &&
      !files.length &&
      pendingVoucherUpdates &&
      pendingVoucherUpdates.status !== 'APPLIED' &&
      wantsApplyPendingVoucherActions(userPrompt)
    ) {
      await applyPendingVoucherUpdates()
      return true
    }
    if (
      !modifiesPendingReview &&
      !files.length &&
      pendingPartyActions &&
      pendingPartyActions.status !== 'APPLIED' &&
      wantsApplyPendingTagActions(userPrompt)
    ) {
      await applyPendingPartyActions()
      return true
    }
    if (
      !modifiesPendingReview &&
      !files.length &&
      pendingBudgetActions &&
      pendingBudgetActions.status !== 'APPLIED' &&
      wantsApplyPendingTagActions(userPrompt)
    ) {
      await applyPendingBudgetActions()
      return true
    }
    if (
      !modifiesPendingReview &&
      !files.length &&
      pendingEarmarkActions &&
      pendingEarmarkActions.status !== 'APPLIED' &&
      wantsApplyPendingTagActions(userPrompt)
    ) {
      await applyPendingEarmarkActions()
      return true
    }
    if (
      !modifiesPendingReview &&
      !files.length &&
      pendingInvoiceActions &&
      pendingInvoiceActions.status !== 'APPLIED' &&
      wantsApplyPendingTagActions(userPrompt)
    ) {
      await applyPendingInvoiceActions()
      return true
    }
    if (shouldUseAgentRuntime(userPrompt)) {
      await runAgentRuntime(userPrompt)
      return true
    }
    const mentionHint = buildMentionPlannerHint(userPrompt, mentionOptions)
    const plannerPrompt = files.length
      ? [
          userPrompt || 'Bitte die angehängten Dateien prüfen.',
          mentionHint,
          '',
          'Aktueller VereinO-KI-Kontext:',
          JSON.stringify(agentUiContext, null, 2),
          '',
          'Angehängte Dateien:',
          ...files.map(
            (file) => `- ${file.name} (${file.type || 'unbekannter MIME-Typ'}, ${file.size} Bytes)`
          )
        ]
          .filter(Boolean)
          .join('\n')
      : [
          userPrompt,
          mentionHint,
          'Aktueller VereinO-KI-Kontext:',
          JSON.stringify(agentUiContext, null, 2)
        ]
          .filter(Boolean)
          .join('\n\n')
    const planned = await window.api.ai.actions.plan({
      prompt: plannerPrompt,
      conversation: planConversation()
    })
    const plan = planned.plan
    const usageMeta = formatAiUsage(planned.usage)

    if (files.length) {
      if (
        plan.entity === 'vouchers' ||
        plan.entity === 'payments' ||
        plan.operation === 'create' ||
        shouldProcessFilesAsBookingDocuments(userPrompt, files)
      ) {
        await processDocuments(userPrompt)
      } else {
        await processFileTextTask(userPrompt)
      }
      return true
    }

    if (plan.safety === 'BLOCKED') {
      pushMessage({
        role: 'assistant',
        title: plan.title || 'Nicht im VereinO-Kontext',
        body: plan.answer || plan.summary || 'Diese Anfrage passt nicht zu VereinO-Aufgaben.',
        meta: usageMeta
      })
      return true
    }

    if (wantsCurrentBookingReviewAction(userPrompt, plan)) {
      return applyCurrentBookingReviewAction(userPrompt, plan)
    }

    if (bankReview && (await applyBankReviewFollowup(userPrompt))) {
      return true
    }

    if (wantsReportExport(userPrompt)) {
      await processReportExport(userPrompt)
      return true
    }

    // A planner can mistake "in einer Tabelle ausgeben" for a file export.
    // Use the regular text workflow unless the user actually requested a file.
    if (plan.entity === 'reports' && plan.operation === 'export') return false

    if (plan.entity === 'bankImport' || plan.operation === 'reviewBankImport') {
      await processBankImport(userPrompt)
      return true
    }

    if (
      (wantsContributionPaymentAction(userPrompt) ||
        (hasRecentContributionContext() && wantsContextualBookingLink(userPrompt))) &&
      plan.operation !== 'read'
    ) {
      return prepareContributionPayment(userPrompt, plan)
    }

    if (plan.entity === 'members' && plan.operation === 'create') {
      const state = memberStateFromPlan(plan, userPrompt) || parseMemberDraftsFromText(userPrompt)
      if (!state) return false
      setPendingMembers(state)
      const missingContribution = state.members.some(
        (member) => !member.contributionAmount || !member.contributionInterval
      )
      pushMessage({
        role: 'assistant',
        title: 'Mitgliederanlage vorbereitet',
        body: `${state.members.length} Mitglied(er) wurden als übernehmbarer Vorschlag vorbereitet. Bitte prüfe die Vorschau unten${missingContribution ? ' und ergänze fehlende Beiträge.' : '.'}`,
        meta: ['Review erforderlich', usageMeta].filter(Boolean).join(' · ')
      })
      return true
    }

    if (plan.entity === 'members' && plan.operation === 'update') {
      await prepareMemberUpdate(userPrompt)
      return true
    }

    if (
      wantsContributionDueRead(userPrompt) ||
      (plan.entity === 'payments' && plan.operation === 'read')
    ) {
      await processContributionDueRead(userPrompt)
      return true
    }

    if (plan.entity === 'members' && plan.operation === 'read') {
      await processMemberRead(userPrompt)
      return true
    }

    if (
      plan.entity === 'payments' &&
      (plan.operation === 'create' || plan.operation === 'update')
    ) {
      return prepareContributionPayment(userPrompt, plan)
    }

    if (plan.entity === 'tags' && plan.operation === 'read') {
      await processTagRead(userPrompt)
      return true
    }

    if (
      plan.entity === 'tags' &&
      (plan.operation === 'create' || plan.operation === 'update' || plan.operation === 'delete')
    ) {
      const handled = await prepareTagActions(
        tagPromptFromPlan(plan, userPrompt),
        plan.answer || plan.summary
      )
      return handled
    }

    if (plan.entity === 'vouchers' && plan.operation === 'update') {
      const handled = await prepareVoucherTagActions(voucherTagPromptFromPlan(plan, userPrompt))
      return handled
    }

    if (plan.answer && plan.safety === 'READ_ONLY') {
      pushMessage({
        role: 'assistant',
        title: plan.title || 'VereinO-Antwort',
        body: plan.answer,
        meta: usageMeta
      })
      return true
    }

    return false
  }

  const submitPrompt = async () => {
    if (busy) return
    const userPrompt = prompt.trim()
    if (!userPrompt && !files.length) {
      notify('info', 'Bitte gib einen Auftrag ein oder hänge eine Datei an.')
      return
    }
    const hasConversationContext = chatStarted || messages.length > 0
    if (
      !files.length &&
      !settings.hasApiKey &&
      !isVereinRelevantPrompt(userPrompt) &&
      !hasConversationContext
    ) {
      pushMessage({
        role: 'user',
        body: userPrompt
      })
      pushMessage({
        role: 'assistant',
        title: 'Nicht im VereinO-Kontext',
        body: 'Ich kann dir hier bei VereinO-Aufgaben helfen, zum Beispiel Mitglieder, Buchungen, Belege, Bankimport, Beiträge, Spenden, Einladungen und Vereinsberichte. Für allgemeine Themen nutze bitte einen separaten KI-Chat.'
      })
      setPrompt('')
      return
    }
    if (settings.hasApiKey) {
      setBusy(true)
      pushMessage({
        role: 'user',
        body: userPrompt || 'Bitte die angehängten Dateien prüfen.',
        meta: files.length ? `${files.length} Anhang/Anhänge` : undefined
      })
      setPrompt('')
      setPromptCursor(0)
      try {
        const planned = await executeAiActionPlan(userPrompt)
        if (!planned) {
          if (files.length) {
            if (shouldProcessFilesAsBookingDocuments(userPrompt, files))
              await processDocuments(userPrompt)
            else await processFileTextTask(userPrompt)
          } else await processText(userPrompt)
        }
      } catch (error: any) {
        try {
          if (files.length) {
            if (shouldProcessFilesAsBookingDocuments(userPrompt, files))
              await processDocuments(userPrompt)
            else await processFileTextTask(userPrompt)
          } else await processText(userPrompt)
        } catch (fallbackError: any) {
          notify('error', fallbackError?.message || error?.message || String(error))
          pushMessage({
            role: 'assistant',
            title: 'Auftrag fehlgeschlagen',
            body: fallbackError?.message || error?.message || String(error)
          })
        }
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && !pendingMembers && wantsCreatePendingMembers(userPrompt)) {
      const recovered = parseMemberDraftsFromText(
        messages.map((message) => `${message.title || ''}\n${message.body}`).join('\n\n')
      )
      if (recovered) {
        pushMessage({ role: 'user', body: userPrompt })
        setPendingMembers(recovered)
        await createPendingMembers(recovered)
        setPrompt('')
        return
      }
    }
    if (!files.length && pendingBankLinks && pendingBankLinks.status !== 'APPLIED') {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        if (wantsApplyPendingVoucherActions(userPrompt)) {
          await applyPendingBankLinks()
        } else if (!settings.hasApiKey) {
          notify('error', 'Bitte zuerst einen KI-API-Key in den KI-Einstellungen hinterlegen.')
          setShowSettings(true)
        } else {
          await processText(userPrompt)
        }
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Bankverknüpfung fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (
      !files.length &&
      pendingVoucherTagActions &&
      pendingVoucherTagActions.status !== 'APPLIED'
    ) {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        if (wantsApplyPendingVoucherActions(userPrompt)) await applyPendingVoucherTagActions()
        else if (await applyVoucherTagCorrection(userPrompt)) {
          // Review was updated from the follow-up correction.
        } else if (wantsVoucherTagAction(userPrompt)) await prepareVoucherTagActions(userPrompt)
        else if (!settings.hasApiKey) {
          notify('error', 'Bitte zuerst einen KI-API-Key in den KI-Einstellungen hinterlegen.')
          setShowSettings(true)
        } else {
          await processText(userPrompt)
        }
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Buchungsauftrag fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && wantsVoucherTagAction(userPrompt)) {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        const handled = await prepareVoucherTagActions(userPrompt)
        if (!handled) {
          if (!settings.hasApiKey) {
            notify('error', 'Bitte zuerst einen KI-API-Key in den KI-Einstellungen hinterlegen.')
            setShowSettings(true)
          } else {
            await processText(userPrompt)
          }
        }
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Buchungsänderung fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && pendingVoucherUpdates && pendingVoucherUpdates.status !== 'APPLIED') {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        if (wantsApplyPendingVoucherActions(userPrompt)) await applyPendingVoucherUpdates()
        else if (!settings.hasApiKey) {
          pushMessage({
            role: 'assistant',
            title: 'Buchungsreview offen',
            body: 'Der Agent-Review ist noch offen. Bitte bestätige die Übernahme oder wähle die Änderungen unten aus.'
          })
        } else {
          await processText(userPrompt)
        }
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Buchungsänderung fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && pendingPartyActions && pendingPartyActions.status !== 'APPLIED') {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        if (wantsApplyPendingTagActions(userPrompt)) await applyPendingPartyActions()
        else if (!settings.hasApiKey) {
          pushMessage({
            role: 'assistant',
            title: 'Geschäftspartner-Review offen',
            body: 'Der Geschäftspartner-Review ist noch offen. Bitte bestätige die Übernahme oder wähle die Änderungen unten aus.'
          })
        } else {
          await processText(userPrompt)
        }
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Geschäftspartner-Änderung fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && pendingBudgetActions && pendingBudgetActions.status !== 'APPLIED') {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        if (wantsApplyPendingTagActions(userPrompt)) await applyPendingBudgetActions()
        else if (!settings.hasApiKey) {
          pushMessage({
            role: 'assistant',
            title: 'Budget-Review offen',
            body: 'Der Budget-Review ist noch offen. Bitte bestätige die Übernahme oder wähle die Änderungen unten aus.'
          })
        } else {
          await processText(userPrompt)
        }
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Budget-Änderung fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && pendingEarmarkActions && pendingEarmarkActions.status !== 'APPLIED') {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        if (wantsApplyPendingTagActions(userPrompt)) await applyPendingEarmarkActions()
        else if (!settings.hasApiKey) {
          pushMessage({
            role: 'assistant',
            title: 'Zweckbindungs-Review offen',
            body: 'Der Zweckbindungs-Review ist noch offen. Bitte bestätige die Übernahme oder wähle die Änderungen unten aus.'
          })
        } else {
          await processText(userPrompt)
        }
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Zweckbindungs-Änderung fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && pendingTagActions && pendingTagActions.status !== 'APPLIED') {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        if (wantsApplyPendingTagActions(userPrompt)) await applyPendingTagActions()
        else if (wantsTagAction(userPrompt)) {
          const handled = await prepareTagActions(userPrompt)
          if (!handled && settings.hasApiKey) await processText(userPrompt)
        } else if (wantsTagRead(userPrompt)) await processTagRead(userPrompt)
        else if (!settings.hasApiKey) {
          notify('error', 'Bitte zuerst einen KI-API-Key in den KI-Einstellungen hinterlegen.')
          setShowSettings(true)
        } else {
          await processText(userPrompt)
        }
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Tag-Auftrag fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (
      !files.length &&
      !pendingTagActions &&
      wantsApplyPendingTagActions(userPrompt) &&
      messages.some(
        (message) =>
          message.role === 'assistant' &&
          /(tag|tags)/i.test(`${message.title || ''}\n${message.body}`)
      )
    ) {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        const handled = await recoverTagActionsFromConversation(userPrompt)
        if (!handled) {
          if (!settings.hasApiKey) {
            notify('error', 'Bitte zuerst einen KI-API-Key in den KI-Einstellungen hinterlegen.')
            setShowSettings(true)
          } else {
            await processText(userPrompt)
          }
        }
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Tag-Auftrag fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && wantsTagAction(userPrompt)) {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        const shouldAskModelForSuggestions =
          extractTagNamesFromText(userPrompt).length === 0 &&
          /(vorschlag|vorschlaeg|vorschläge|sinnvoll|empfehl)/i.test(userPrompt)
        const handled = shouldAskModelForSuggestions ? false : await prepareTagActions(userPrompt)
        if (!handled) {
          if (!settings.hasApiKey) {
            notify('error', 'Bitte zuerst einen KI-API-Key in den KI-Einstellungen hinterlegen.')
            setShowSettings(true)
          } else {
            await processText(userPrompt)
          }
        }
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Tag-Änderung fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && wantsTagRead(userPrompt)) {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        await processTagRead(userPrompt)
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Tag-Abfrage fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && pendingMembers && pendingMembers.status !== 'CREATED') {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        const handled = await applyMemberFollowup(userPrompt)
        if (!handled) {
          if (!settings.hasApiKey) {
            notify('error', 'Bitte zuerst einen KI-API-Key in den KI-Einstellungen hinterlegen.')
            setShowSettings(true)
          } else {
            await processText(userPrompt)
          }
        }
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Auftrag fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && pendingMemberUpdates && pendingMemberUpdates.status !== 'APPLIED') {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        const handled = await applyMemberUpdateFollowup(userPrompt)
        if (!handled) {
          if (wantsMemberUpdate(userPrompt)) await prepareMemberUpdate(userPrompt)
          else if (wantsMemberRead(userPrompt)) await processMemberRead(userPrompt)
          else if (!settings.hasApiKey) {
            notify('error', 'Bitte zuerst einen KI-API-Key in den KI-Einstellungen hinterlegen.')
            setShowSettings(true)
          } else {
            await processText(userPrompt)
          }
        }
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Mitgliederauftrag fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (
      !files.length &&
      pendingContributionPayment &&
      pendingContributionPayment.status !== 'CREATED'
    ) {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        if (
          wantsCreatePendingMembers(userPrompt) ||
          wantsApplyPendingMemberUpdates(userPrompt) ||
          wantsContributionPaymentAction(userPrompt)
        ) {
          await createContributionPayment()
        } else if (!settings.hasApiKey) {
          notify('error', 'Bitte zuerst einen OpenAI API-Key in den KI-Einstellungen hinterlegen.')
          setShowSettings(true)
        } else {
          await processText(userPrompt)
        }
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Beitragsauftrag fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (
      !files.length &&
      selectedJob &&
      analysis &&
      findPaymentAccountHint(userPrompt, paymentAccounts)
    ) {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        const handled = await applyPaymentAccountFollowup(userPrompt)
        if (!handled) await processText(userPrompt)
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Zahlungskonto konnte nicht gesetzt werden',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && wantsMemberCreation(userPrompt)) {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        const handled = await prepareMemberCreation(userPrompt)
        if (!handled) {
          if (!settings.hasApiKey) {
            notify('error', 'Bitte zuerst einen KI-API-Key in den KI-Einstellungen hinterlegen.')
            setShowSettings(true)
          } else {
            await processText(userPrompt)
          }
        }
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Mitgliederanlage fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && wantsMemberUpdate(userPrompt)) {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        await prepareMemberUpdate(userPrompt)
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Mitgliederänderung fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && wantsContributionDueRead(userPrompt)) {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        await processContributionDueRead(userPrompt)
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Beitragsprüfung fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && wantsMemberRead(userPrompt)) {
      setBusy(true)
      pushMessage({ role: 'user', body: userPrompt })
      try {
        await processMemberRead(userPrompt)
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Mitgliederabfrage fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!files.length && wantsReportExport(userPrompt)) {
      setBusy(true)
      pushMessage({
        role: 'user',
        body: userPrompt
      })
      try {
        await processReportExport(userPrompt)
        setPrompt('')
      } catch (error: any) {
        notify('error', error?.message || String(error))
        pushMessage({
          role: 'assistant',
          title: 'Export fehlgeschlagen',
          body: error?.message || String(error)
        })
      } finally {
        setBusy(false)
      }
      return
    }
    if (!settings.hasApiKey) {
      notify('error', 'Bitte zuerst einen OpenAI API-Key in den KI-Einstellungen hinterlegen.')
      setShowSettings(true)
      return
    }
    setBusy(true)
    pushMessage({
      role: 'user',
      body: userPrompt || 'Bitte die angehängten Dateien prüfen.',
      meta: files.length ? `${files.length} Anhang/Anhänge` : undefined
    })
    try {
      if (!files.length && (await applyPaymentAccountFollowup(userPrompt))) {
        setPrompt('')
      } else {
        const route = routeDefaultAiPrompt(userPrompt, files)
        if (route === 'DOCUMENT_ANALYSIS') await processDocuments(userPrompt)
        else if (route === 'FILE_TEXT_TASK') await processFileTextTask(userPrompt)
        else if (route === 'BANK_IMPORT') await processBankImport(userPrompt)
        else await processText(userPrompt)
      }
      setPrompt('')
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Auftrag fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  const updateCandidate = async (next: TAiBookingCandidate) => {
    if (!selectedJob || !analysis) return
    const nextResult = {
      ...analysis,
      candidates: analysis.candidates.map((item, idx) => (idx === selectedCandidate ? next : item))
    }
    selectJob({ ...selectedJob, result: nextResult }, selectedCandidate)
  }

  const saveCandidate = async () => {
    if (!selectedJob || !analysis) return selectedJob
    return window.api.ai.jobs.updateCandidate({ id: selectedJob.id, result: analysis })
  }

  const approveCandidate = async () => {
    if (!selectedJob || !analysis) return
    const currentCandidate = analysis.candidates[selectedCandidate]
    if (isCandidateApproved(currentCandidate, selectedJob)) {
      notify('info', 'Dieser KI-Buchungsvorschlag ist bereits gebucht.')
      return
    }
    setBusy(true)
    try {
      await saveCandidate()
      const res = await window.api.ai.jobs.approveCandidate({
        id: selectedJob.id,
        candidateIndex: selectedCandidate
      })
      notify('success', `Buchung ${res.voucherNo} erstellt.`)
      const refreshed = await window.api.ai.jobs.get({ id: selectedJob.id })
      selectJob(refreshed, selectedCandidate)
      await loadJobs()
      onBooked?.()
    } catch (error: any) {
      notify('error', error?.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  const openJob = async (id: number) => {
    try {
      const job = await window.api.ai.jobs.get({ id })
      selectJob(job)
      const result = job.result as any
      if (result?.body) {
        pushMessage({
          role: 'assistant',
          title: result.title || job.title || 'Textentwurf',
          body: result.body,
          meta: typeLabel(job.type),
          jobId: job.id,
          reviewable: false
        })
      }
    } catch (error: any) {
      notify('error', error?.message || String(error))
    }
  }

  const renderComposer = (placement: 'initial' | 'followup') => (
    <AiComposer
      placement={placement}
      busy={busy}
      prompt={prompt}
      files={files}
      filePreviews={filePreviews}
      visibleMentions={visibleMentions}
      isDraggingFiles={isDraggingFiles}
      promptInputRef={promptInputRef}
      fileInputRef={fileInputRef}
      onPromptChange={(value, cursor) => {
        setPrompt(value)
        setPromptCursor(cursor)
      }}
      onCursorSync={syncPromptCursor}
      onSubmit={() => void submitPrompt()}
      onAppendFiles={appendFiles}
      onRemoveFile={removeFile}
      onInsertMention={insertMention}
      onDragEnter={handleComposerDragEnter}
      onDragOver={handleComposerDragOver}
      onDragLeave={handleComposerDragLeave}
      onDrop={handleComposerDrop}
    />
  )

  return (
    <div className="page-content ai-page ai-assistant-page">
      <AiAssistantHeader
        busy={busy}
        hasPendingReview={hasPendingReview}
        avatarFrame={avatarFrame}
        hasApiKey={settings.hasApiKey}
        chatStarted={chatStarted}
        onNewChat={startNewChat}
        onToggleDrawer={(drawer) => dispatchDrawer({ type: 'TOGGLE', drawer })}
        historyButtonRef={historyButtonRef}
        agentContextButtonRef={agentContextButtonRef}
        settingsButtonRef={settingsButtonRef}
        rulesButtonRef={rulesButtonRef}
      />

      <div className="ai-assistant-layout">
        <main className="ai-chat-surface">
          {!chatStarted && (
            <section className="ai-welcome">
              <h2>Schön, dich zu sehen. Was möchtest du erledigen?</h2>
            </section>
          )}

          {!chatStarted && renderComposer('initial')}

          {!chatStarted && (
            <div className="ai-prompt-examples">
              {PROMPT_EXAMPLES.map((example) => (
                <button key={example} type="button" onClick={() => setPrompt(example)}>
                  {example}
                </button>
              ))}
            </div>
          )}

          <AiMessageList
            messages={messages}
            onOpenVoucher={(mention) => void openVoucherMention(mention)}
            onOpenJob={(id) => void openJob(id)}
            onOpenBookingDraftFromJob={(id) => void openBookingDraftFromJobId(id)}
            onOpenMessageDraft={openMessageBookingDraft}
            onShowFile={(path) => void window.api.shell.showItemInFolder(path)}
          />

          <AgentReviewQueue items={agentReviewQueueItems} onOpen={openAgentReviewQueueItem} />

          {pendingPlannerQuestion && (
            <AiPlannerQuestionCard
              state={pendingPlannerQuestion}
              busy={busy}
              onResolve={(option) => void resolvePlannerQuestion(option)}
            />
          )}

          {pendingMembers && (
            <AiMemberImportReviewCard
              state={pendingMembers}
              busy={busy}
              onApply={() => void createPendingMembers()}
            />
          )}

          {pendingMemberUpdates && (
            <AiMemberUpdateReviewCard
              state={pendingMemberUpdates}
              busy={busy}
              onToggle={toggleMemberUpdateChange}
              onApply={() => void applyPendingMemberUpdates()}
            />
          )}

          {pendingContributionPayment && (
            <AiContributionPaymentReviewCard
              state={pendingContributionPayment}
              busy={busy}
              onApply={() => void createContributionPayment()}
            />
          )}

          {pendingRecurringBooking && (
            <AiRecurringBookingReviewCard
              state={pendingRecurringBooking}
              busy={busy}
              onApply={() => void applyPendingRecurringBooking()}
            />
          )}

          {pendingContributionLinks && (
            <AiContributionLinkReviewCard
              state={pendingContributionLinks}
              busy={busy}
              onToggle={toggleContributionLink}
              onApply={() => void applyContributionLinks()}
            />
          )}
          {pendingTagActions && (
            <AiTagActionReviewCard
              state={pendingTagActions}
              busy={busy}
              onToggle={toggleTagAction}
              onApply={() => void applyPendingTagActions()}
            />
          )}

          {pendingVoucherTagActions && (
            <AiVoucherTagReviewCard
              state={pendingVoucherTagActions}
              busy={busy}
              onToggle={toggleVoucherTagAction}
              onApply={() => void applyPendingVoucherTagActions()}
            />
          )}

          {pendingVoucherUpdates && (
            <AgentVoucherUpdateCard
              anchorId="ai-review-voucher-updates"
              state={pendingVoucherUpdates}
              busy={busy}
              onToggle={toggleVoucherUpdate}
              onApply={() => void applyPendingVoucherUpdates()}
            />
          )}

          {pendingBankLinks && (
            <AiBankLinkReviewCard
              state={pendingBankLinks}
              busy={busy}
              onToggle={toggleBankLink}
              onApply={() => void applyPendingBankLinks()}
            />
          )}

          {pendingVoucherReverse && (
            <AgentVoucherReverseCard
              anchorId="ai-review-voucher-reverse"
              state={pendingVoucherReverse}
              busy={busy}
              onApply={() => void applyPendingVoucherReverse()}
            />
          )}

          {pendingVoucherRebook && (
            <AgentVoucherRebookCard
              anchorId="ai-review-voucher-rebook"
              state={pendingVoucherRebook}
              busy={busy}
              onApply={() => void applyPendingVoucherRebook()}
            />
          )}

          {pendingInvoiceActions && (
            <AgentInvoiceActionCard
              anchorId="ai-review-invoice-actions"
              state={pendingInvoiceActions}
              busy={busy}
              onToggle={toggleInvoiceAction}
              onApply={() => void applyPendingInvoiceActions()}
            />
          )}

          {pendingPartyActions && (
            <AgentMasterDataChangeCard
              anchorId="ai-review-party-actions"
              title="Geschäftspartner"
              entityLabel="Geschäftspartner-Änderungen"
              state={pendingPartyActions}
              busy={busy}
              onToggle={togglePartyAction}
              onApply={() => void applyPendingPartyActions()}
            />
          )}

          {pendingBudgetActions && (
            <AgentMasterDataChangeCard
              anchorId="ai-review-budget-actions"
              title="Budget-Stammdaten"
              entityLabel="Budget-Änderungen"
              state={pendingBudgetActions}
              busy={busy}
              onToggle={toggleBudgetAction}
              onApply={() => void applyPendingBudgetActions()}
            />
          )}

          {pendingEarmarkActions && (
            <AgentMasterDataChangeCard
              anchorId="ai-review-earmark-actions"
              title="Zweckbindungen"
              entityLabel="Zweckbindungs-Änderungen"
              state={pendingEarmarkActions}
              busy={busy}
              onToggle={toggleEarmarkAction}
              onApply={() => void applyPendingEarmarkActions()}
            />
          )}

          {bankReview && (
            <AiBankReviewCard
              review={bankReview}
              busy={busy}
              onLink={(suggestion) => void linkBankSuggestion(suggestion)}
              onApplyRecurring={(suggestion) => void applyRecurringBankSuggestion(suggestion)}
              onOpenBooking={openBankSuggestionBookingModal}
              onCreateBooking={(suggestion) => void createBankSuggestionBooking(suggestion)}
              onMarkChecked={(suggestion) => void checkBankSuggestion(suggestion)}
            />
          )}

          {selectedJob && analysis && candidate && (
            <section id="ai-review-booking" className="card ai-review-card">
              {selectedJob.usage && (
                <div className="ai-usage-row" title={selectedJob.usage.pricingNote || undefined}>
                  <span>KI-Nutzung</span>
                  <strong>{formatAiUsage(selectedJob.usage)}</strong>
                </div>
              )}
              {analysis.candidates.length > 1 && (
                <div className="ai-candidate-tabs">
                  {analysis.candidates.map((item, idx) => {
                    const booked = isCandidateApproved(item, selectedJob)
                    return (
                      <button
                        key={idx}
                        className={[
                          idx === selectedCandidate ? 'active' : '',
                          booked ? 'is-booked' : 'is-open'
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => setSelectedCandidate(idx)}
                      >
                        <span>{candidateSourceLabel(item) || `Vorschlag ${idx + 1}`}</span>
                        <small>{booked ? 'Gebucht' : 'Offen'}</small>
                      </button>
                    )
                  })}
                </div>
              )}
              <CandidateEditor
                job={selectedJob}
                candidate={candidate}
                candidateIndex={selectedCandidate}
                paymentAccounts={paymentAccounts}
                busy={busy}
                onChange={updateCandidate}
                onApprove={approveCandidate}
                onOpenDraft={() =>
                  openBookingDraftForCandidate(selectedJob, candidate, selectedCandidate)
                }
              />
            </section>
          )}

          {chatStarted && renderComposer('followup')}
        </main>
      </div>

      {showHistory && (
        <AiHistoryDrawer
          ref={historyDrawerRef}
          jobs={jobs}
          openBookingJobs={openBookingJobs}
          completedBookingJobs={completedBookingJobs}
          selectedJobId={selectedJob?.id}
          busy={busy}
          onClose={() => setShowHistory(false)}
          onOpenJob={(id) => void openJob(id)}
          onMarkDone={(job) => void markHistoryJobDone(job)}
          onDelete={(job) => void deleteHistoryJob(job)}
        />
      )}

      {showAgentContext && (
        <section
          ref={agentContextDrawerRef}
          className="ai-agent-context-drawer"
          role="dialog"
          aria-label="Agent-Kontext"
        >
          <AgentRuntimePanel trace={agentTrace} memory={agentMemory} autoRules={agentAutoRules} />
        </section>
      )}

      {showRules && (
        <div ref={rulesDrawerRef}>
          <AiRulesCatalog notify={notify} onClose={() => setShowRules(false)} />
        </div>
      )}

      {showSettings && (
        <AiSettingsDrawer
          ref={settingsDrawerRef}
          settings={settings}
          apiKey={apiKey}
          modelOptions={providerModelOptions}
          providerOptions={AI_PROVIDER_OPTIONS}
          connectionTest={connectionTest}
          busy={busy}
          onClose={() => setShowSettings(false)}
          onApiKeyChange={updateApiKey}
          onSettingsChange={setSettings}
          onProviderChange={handleProviderChange}
          onInvalidateConnection={invalidateConnection}
          onSave={() => void saveSettings()}
          onTestConnection={() => void testConnection()}
        />
      )}
    </div>
  )
}
