import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './AIView.css'
import { dispatchDataChanged } from '../../utils/refresh'
import { AgentRuntimePanel } from './AgentRuntimePanel'
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

const VEREINI_DEFAULT_SRC = new URL(
  '../../../../assets/VereinI/VereinI-Default.png',
  import.meta.url
).href
const VEREINI_BLINK_SRC = new URL('../../../../assets/VereinI/Vereini_Blink.png', import.meta.url)
  .href
const VEREINI_SMIRK_SRC = new URL('../../../../assets/VereinI/Vereini_Smirk.png', import.meta.url)
  .href
const VEREINI_SUCCESS_SRC = new URL(
  '../../../../assets/VereinI/Vereini_Sucess.png',
  import.meta.url
).href
const VEREINI_THINKING_SRC = new URL(
  '../../../../assets/VereinI/Vereini_Thinking.png',
  import.meta.url
).href
const VEREINI_TALK1_SRC = new URL('../../../../assets/VereinI/VereinI-Talk1.png', import.meta.url)
  .href
const VEREINI_TALK2_SRC = new URL('../../../../assets/VereinI/Vereini_Talk2.png', import.meta.url)
  .href
const AI_AVATAR_CROSSFADE_MS = 220

type AiAvatarFrame = 'default' | 'blink' | 'smirk' | 'success' | 'thinking' | 'talk1' | 'talk2'

type Notify = (
  type: 'success' | 'error' | 'info',
  text: string,
  duration?: number,
  action?: { label: string; onClick: () => void }
) => void

type Props = {
  notify: Notify
  onBooked?: () => void
  onBusyChange?: (busy: boolean) => void
}

type AiMessage = {
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

type AiAttachmentPreview = {
  key: string
  name: string
  url: string | null
  badge: string
}

type PaymentAccountOption = {
  id: number
  name: string
  kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'
  color?: string | null
  isActive: number
}

type AiMentionOption = {
  id: string
  label: string
  insert: string
  scope: 'Bereich' | 'Tag' | 'Kategorie' | 'Zweckbindung' | 'Zahlungskonto' | 'Sphäre'
  description: string
  plannerHint: string
}

type AiVoucherMention = {
  key: string
  id?: number
  voucherNo?: string
  date?: string
  description: string
  amount?: string
  type?: 'IN' | 'OUT'
}

type AiChatSnapshot = {
  messages?: AiMessage[]
  agentSessionId?: string | null
  selectedJobId?: number | null
  selectedCandidate?: number
  bankReview?: AiBankReviewState | null
  pendingMembers?: AiMemberImportState | null
  pendingMemberUpdates?: AiMemberUpdateState | null
  pendingContributionPayment?: AiContributionPaymentState | null
  pendingContributionLinks?: AiContributionLinkState | null
  pendingTagActions?: AiTagActionState | null
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

type AiBankReviewSuggestion = TAiBankImportReviewOutput['suggestions'][number] & {
  resolved?: 'LINKED' | 'CREATED' | 'CHECKED'
  resolvedVoucherId?: number | null
  resolvedVoucherNo?: string | null
}

type AiBankReviewState = Omit<TAiBankImportReviewOutput, 'suggestions'> & {
  suggestions: AiBankReviewSuggestion[]
  allSuggestions?: AiBankReviewSuggestion[]
  sourceTotal?: number
  filterSummary?: string | null
}

type AiBankLinkChange = {
  id: string
  bankTransactionId: number
  bankBookingDate?: string | null
  bankDirection?: 'IN' | 'OUT' | string | null
  bankAmount: number
  bankCounterparty?: string | null
  bankPurpose?: string | null
  bankReference?: string | null
  paymentAccountName?: string | null
  voucherId: number
  voucherNo?: string | null
  voucherDate?: string | null
  voucherType?: 'IN' | 'OUT' | string | null
  voucherDescription?: string | null
  voucherGrossAmount: number
  selected: boolean
  applied?: boolean
  error?: string | null
}

type AiBankLinkState = {
  changes: AiBankLinkChange[]
  reason?: string | null
  warnings?: string[]
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

type AiMemberDraft = {
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

type AiMemberImportState = {
  members: AiMemberDraft[]
  sourcePrompt: string
  status: 'DRAFT' | 'CREATED'
}

type MemberRow = TMembersListOutput['rows'][number]
type AiMemberUpdateField = Exclude<keyof TMemberUpdateInput, 'id' | 'tags'>

type AiMemberUpdateChange = {
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

type AiMemberUpdateState = {
  changes: AiMemberUpdateChange[]
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

type PaymentDueRow = TPaymentsListDueOutput['rows'][number]

type AiContributionPaymentState = {
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

type AiContributionLinkChange = {
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

type AiContributionLinkState = {
  changes: AiContributionLinkChange[]
  reason?: string | null
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

type TagRow = TTagsListOutput['rows'][number]

type AiTagActionChange = {
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

type AiTagActionState = {
  changes: AiTagActionChange[]
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

type AiBudgetActionChange = AgentMasterDataChange & {
  budgetId?: number | null
  payload?: TBudgetUpsertInput | null
}

type AiBudgetActionState = {
  changes: AiBudgetActionChange[]
  reason?: string | null
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

type AiEarmarkActionChange = AgentMasterDataChange & {
  earmarkId?: number | null
  payload?: TBindingUpsertInput | null
}

type AiEarmarkActionState = {
  changes: AiEarmarkActionChange[]
  reason?: string | null
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

type VoucherRow = TVouchersListOutput['rows'][number]

type AiVoucherTagActionChange = {
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

type AiVoucherTagActionState = {
  changes: AiVoucherTagActionChange[]
  sourceTag: string
  addedTags: string[]
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

type AiPlannerQuestionOption = {
  id: 'CREATE_TAGS_AND_BOOK_ALL' | 'BOOK_ALL_WITHOUT_NEW_TAGS' | 'CREATE_TAGS_ONLY' | 'CANCEL'
  label: string
  description: string
}

type AiPlannerQuestionState = {
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

type BookingJobLike = {
  status?: string
  voucherId?: number | null
  result?: unknown
}

const AI_CHAT_STORAGE_KEY = 'vereino.ai.chat.v1'
const AI_MESSAGE_STREAM_TICK_MS = 18
const AI_MESSAGE_STREAM_TARGET_TICKS = 180

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const usd = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 4
})

const DEFAULT_AI_SETTINGS: TAiSettingsGetOutput = {
  hasApiKey: false,
  model: 'gpt-5.5',
  textModel: 'gpt-5.4-mini',
  defaultReasoningEffort: 'medium',
  provider: 'openai',
  apiBaseUrl: 'https://api.openai.com/v1',
  proxyMode: 'system',
  proxyUrl: '',
  proxyBypassRules: '<local>'
}

const AI_PROVIDER_CONFIG = {
  openai: {
    label: 'OpenAI',
    apiBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.5',
    defaultTextModel: 'gpt-5.4-mini',
    modelOptions: [
      { value: 'gpt-5.5', label: 'GPT-5.5', hint: 'Beste Qualität für Belege' },
      { value: 'gpt-5.4', label: 'GPT-5.4', hint: 'Stark, günstiger als 5.5' },
      { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini', hint: 'Schnell und günstiger' },
      { value: 'gpt-5.4-nano', label: 'GPT-5.4 nano', hint: 'Sehr günstig für einfache Texte' }
    ]
  },
  minimax: {
    label: 'Minimax',
    apiBaseUrl: 'https://api.minimaxi.com/v1',
    defaultModel: 'MiniMax-M3',
    defaultTextModel: 'MiniMax-M3',
    modelOptions: [
      { value: 'MiniMax-M3', label: 'MiniMax-M3', hint: 'Aktuelles Agent- und Reasoning-Modell' },
      { value: 'MiniMax-M1', label: 'MiniMax-M1', hint: 'Starkes Reasoning für längere Aufgaben' },
      {
        value: 'MiniMax-Text-01',
        label: 'MiniMax-Text-01',
        hint: 'Klassisches Textmodell für Standardaufgaben'
      }
    ]
  },
  mittwald: {
    label: 'Mittwald AI Hosting',
    apiBaseUrl: 'https://llm.aihosting.mittwald.de/v1',
    defaultModel: 'GLM-OCR',
    defaultTextModel: 'Qwen3.5-0.8B',
    modelOptions: [
      { value: 'GLM-OCR', label: 'GLM-OCR', hint: 'Empfohlen für Rechnungen, PDFs und Tabellen' },
      {
        value: 'Mistral-Medium-3.5-128B',
        label: 'Mistral Medium 3.5',
        hint: 'Starke Beleg- und Bildanalyse'
      },
      {
        value: 'Qwen3.5-122B-A10B-FP8',
        label: 'Qwen 3.5 122B',
        hint: 'Empfohlen für Batch: GLM-OCR liest PDFs, Qwen bewertet sie'
      },
      {
        value: 'Qwen3.6-35B-A3B-FP8',
        label: 'Qwen 3.6 35B',
        hint: 'Langer Kontext, Reasoning und Vision'
      },
      { value: 'gpt-oss-120b', label: 'gpt-oss-120b', hint: 'Präzise Texte und Tool-Aufrufe' },
      {
        value: 'Qwen3.5-0.8B',
        label: 'Qwen 3.5 0.8B',
        hint: 'Schnell für Standardtexte und Klassifizierung'
      }
    ]
  }
} as const

const AI_PROVIDER_OPTIONS = Object.entries(AI_PROVIDER_CONFIG).map(([value, config]) => ({
  value,
  label: config.label
})) as Array<{ value: TAiSettingsGetOutput['provider']; label: string }>

function getAiProviderConfig(provider: TAiSettingsGetOutput['provider']) {
  return AI_PROVIDER_CONFIG[provider] || AI_PROVIDER_CONFIG.openai
}

function normalizeAiSettings(settings: TAiSettingsGetOutput): TAiSettingsGetOutput {
  const providerConfig = getAiProviderConfig(settings.provider)
  const allowedModels = new Set<string>(providerConfig.modelOptions.map((option) => option.value))
  return {
    ...settings,
    apiBaseUrl: providerConfig.apiBaseUrl,
    model: allowedModels.has(settings.model) ? settings.model : providerConfig.defaultModel,
    textModel: allowedModels.has(settings.textModel)
      ? settings.textModel
      : providerConfig.defaultTextModel
  }
}

const PROMPT_EXAMPLES = [
  'Lies diese Rechnung aus und erstelle einen Buchungsvorschlag.',
  'Schreibe eine Einladung an alle Mitglieder für das Sommerfest.',
  'Prüfe offene Bankimport-Belege und schlage Zuordnungen vor.',
  'Welche Tags und Kategorien haben wir angelegt?',
  'Exportiere einen Controllingbericht für das Jahr 2026 als PDF.',
  'Setze bei allen aktiven Mitgliedern den Beitrag auf 20 € monatlich.',
  'Prüfe diese Exceldatei und bereite einen Importvorschlag vor.'
]

const TAG_ACTION_COLORS = [
  '#2962FF',
  '#00B8D4',
  '#26A69A',
  '#00C853',
  '#FFD600',
  '#FF9100',
  '#FF7043',
  '#F50057',
  '#9C27B0',
  '#7C4DFF'
]

const STATIC_AI_MENTIONS: AiMentionOption[] = [
  {
    id: 'area-bankimport',
    label: 'Bankimport',
    insert: 'Bankimport',
    scope: 'Bereich',
    description: 'Offene Bankbelege prüfen, verknüpfen oder als Buchung vorbereiten',
    plannerHint: 'entity bankImport; nutze Bankimport-Tools und offene Banktransaktionen.'
  },
  {
    id: 'area-buchungen',
    label: 'Buchungen',
    insert: 'Buchungen',
    scope: 'Bereich',
    description: 'Journal, Belege, Tags und Buchungsvorschläge',
    plannerHint: 'entity vouchers; nutze Buchungs-/Journal-Tools.'
  },
  {
    id: 'area-rechnungen',
    label: 'Rechnungen',
    insert: 'Rechnungen',
    scope: 'Bereich',
    description: 'Belege oder Rechnungen auslesen und Buchungsvorschläge erstellen',
    plannerHint: 'entity vouchers; bei Anhängen Beleganalyse verwenden.'
  },
  {
    id: 'area-mitglieder',
    label: 'Mitglieder',
    insert: 'Mitglieder',
    scope: 'Bereich',
    description: 'Mitglieder lesen, anlegen, bearbeiten und Beiträge prüfen',
    plannerHint: 'entity members/payments; nutze Mitglieder- und Beitragsdaten.'
  },
  {
    id: 'area-beitraege',
    label: 'Beiträge',
    insert: 'Beiträge',
    scope: 'Bereich',
    description: 'Offene Mitgliedsbeiträge, Zahlungen und Verknüpfungen',
    plannerHint: 'entity payments; nutze Beitragsstatus und Zahlungsvorschläge.'
  },
  {
    id: 'area-reports',
    label: 'Reports',
    insert: 'Reports',
    scope: 'Bereich',
    description: 'Controlling, KPIs und PDF/CSV/XLSX-Exporte',
    plannerHint: 'entity reports; nutze Reporting- und Export-Tools.'
  },
  {
    id: 'area-tags',
    label: 'Tags',
    insert: 'Tags',
    scope: 'Bereich',
    description: 'Tags anzeigen, anlegen, ändern oder Buchungen taggen',
    plannerHint: 'entity tags oder vouchers.update tags; nutze Tag-Kontext.'
  },
  {
    id: 'area-budgets',
    label: 'Budgets',
    insert: 'Budgets',
    scope: 'Bereich',
    description: 'Budgets, Kategorien und Plan/Ist-Auswertungen',
    plannerHint: 'entity budgets/reports; nutze Budget- und Kategorie-Kontext.'
  },
  {
    id: 'area-zweckbindungen',
    label: 'Zweckbindungen',
    insert: 'Zweckbindungen',
    scope: 'Bereich',
    description: 'Zweckbindungen und Mittelverwendung',
    plannerHint: 'entity earmarks/reports; nutze Zweckbindungs-Kontext.'
  },
  {
    id: 'area-zahlungskonten',
    label: 'Zahlungskonten',
    insert: 'Zahlungskonten',
    scope: 'Bereich',
    description: 'Bank, Kasse und Kontosalden',
    plannerHint: 'nutze Zahlungskonten, Kontosalden und paymentAccountId.'
  },
  {
    id: 'sphere-ideell',
    label: 'IDEELL',
    insert: 'IDEELL',
    scope: 'Sphäre',
    description: 'Ideeller Bereich',
    plannerHint: 'filter/set sphere IDEELL.'
  },
  {
    id: 'sphere-zweck',
    label: 'ZWECK',
    insert: 'ZWECK',
    scope: 'Sphäre',
    description: 'Zweckbetrieb',
    plannerHint: 'filter/set sphere ZWECK.'
  },
  {
    id: 'sphere-vermoegen',
    label: 'VERMÖGEN',
    insert: 'VERMÖGEN',
    scope: 'Sphäre',
    description: 'Vermögensverwaltung',
    plannerHint: 'filter/set sphere VERMOEGEN.'
  },
  {
    id: 'sphere-wgb',
    label: 'WGB',
    insert: 'WGB',
    scope: 'Sphäre',
    description: 'Wirtschaftlicher Geschäftsbetrieb',
    plannerHint: 'filter/set sphere WGB.'
  }
]

function mentionInsertToken(option: AiMentionOption) {
  return `@${option.insert.replace(/\s+/g, '-')}`
}

function activeMentionTrigger(text: string, cursor: number) {
  const beforeCursor = text.slice(0, cursor)
  const match = beforeCursor.match(/(^|\s)@([^\s@]*)$/)
  if (!match) return null
  const start = beforeCursor.length - match[2].length - 1
  return { start, end: cursor, query: match[2] }
}

function extractMentionTokens(text: string) {
  return Array.from(String(text || '').matchAll(/@([^\s,.;!?]+)/g))
    .map((match) => match[1])
    .filter(Boolean)
}

function buildMentionPlannerHint(prompt: string, options: AiMentionOption[]) {
  const tokens = extractMentionTokens(prompt)
  if (!tokens.length) return ''
  const optionByInsert = new Map(
    options.map((option) => [normalizeLookup(option.insert.replace(/\s+/g, '-')), option])
  )
  const matched = tokens
    .map((token) => optionByInsert.get(normalizeLookup(token)))
    .filter(Boolean) as AiMentionOption[]
  if (!matched.length) return ''
  return [
    'Explizite @-Kontexthinweise des Nutzers:',
    ...matched.map(
      (option) => `- @${option.insert}: ${option.scope} ${option.label}. ${option.plannerHint}`
    )
  ].join('\n')
}

function filePreviewKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.readAsDataURL(file)
  })
}

function attachmentBadge(file: File) {
  const name = file.name.toLowerCase()
  if (file.type.startsWith('image/')) return 'IMG'
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'XLS'
  if (name.endsWith('.csv')) return 'CSV'
  if (name.endsWith('.tsv')) return 'TSV'
  if (name.endsWith('.pdf')) return 'PDF'
  return 'DATEI'
}

function isAiAttachmentFile(file: File) {
  const mimeType = String(file.type || '').toLowerCase()
  const name = String(file.name || '').toLowerCase()
  if (mimeType === 'application/pdf') return true
  if (mimeType === 'image/png' || mimeType === 'image/jpeg') return true
  return /\.(pdf|xlsx|xls|csv|tsv|png|jpe?g)$/i.test(name)
}

function statusLabel(status: string) {
  if (status === 'DRAFT') return 'Entwurf'
  if (status === 'QUEUED') return 'Wartet'
  if (status === 'PROCESSING') return 'In Arbeit'
  if (status === 'NEEDS_REVIEW') return 'Review'
  if (status === 'APPROVED') return 'Gebucht'
  if (status === 'REJECTED') return 'Abgelehnt'
  if (status === 'FAILED') return 'Fehler'
  return status
}

function typeLabel(type: string) {
  if (type === 'BOOKING_FROM_DOCUMENTS') return 'Beleganalyse'
  if (type === 'MEMBER_TEXT') return 'Mitgliedertext'
  if (type === 'REPORT_TEXT') return 'Berichtstext'
  return type
}

function warningClassName(warning: string) {
  const duplicate = /(doppelt|duplikat|bereits.*buchung|bereits.*vorhanden|double|duplicate)/i.test(
    String(warning || '')
  )
  return duplicate ? 'ai-warning ai-warning--duplicate' : 'ai-warning'
}

function readAiChatSnapshot(): AiChatSnapshot {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(AI_CHAT_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeAiChatSnapshot(snapshot: AiChatSnapshot) {
  if (typeof window === 'undefined') return
  try {
    const persistedMessages = (snapshot.messages || []).map(
      ({ displayBody, isStreaming, ...message }) => message
    )
    window.localStorage.setItem(
      AI_CHAT_STORAGE_KEY,
      JSON.stringify({ ...snapshot, messages: persistedMessages })
    )
  } catch {
    // The chat should keep working even if local storage is unavailable.
  }
}

function clearAiChatSnapshot() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(AI_CHAT_STORAGE_KEY)
  } catch {
    // Ignore storage errors; clearing is a convenience, not critical state.
  }
}

function paymentMethodForAccount(kind?: string | null): TAiBookingCandidate['paymentMethod'] {
  if (kind === 'CASH') return 'BAR'
  if (kind === 'BANK' || kind === 'PAYPAL' || kind === 'CARD' || kind === 'OTHER') return 'BANK'
  return undefined
}

function normalizeLookup(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function parseGermanDate(value: string) {
  const match = String(value || '').match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2}|19\d{2})\b/)
  if (!match) return null
  const day = match[1].padStart(2, '0')
  const month = match[2].padStart(2, '0')
  return `${match[3]}-${month}-${day}`
}

function formatIsoDate(value?: string | null) {
  if (!value) return '-'
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value
}

function isoDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function stripMarkdownInline(value: string) {
  return String(value || '')
    .replace(/\*\*/g, '')
    .trim()
}

function voucherMentionFromContext(
  id: number | null,
  voucherNo: string | null,
  text: string,
  start: number
): AiVoucherMention {
  const context = cleanVoucherMentionText(
    text.slice(Math.max(0, start - 80), Math.min(text.length, start + 140))
  )
  const date = context.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0]
  const amount = context.match(/[+-]?\d{1,3}(?:\.\d{3})*,\d{2}\s*€/)?.[0]
  const type = context.match(/\b(IN|OUT)\b/)?.[1] as AiVoucherMention['type'] | undefined
  const description = context
    .replace(/\b(?:ID|Beleg|Belege|Buchung|Buchungen|Voucher)\s*#?\s*\d+(?:\s*\/\s*\d+)*/gi, '')
    .replace(/\b20\d{2}-\d{2}-\d{2}_\d{5}\b/g, '')
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, '')
    .replace(/[+-]?\d{1,3}(?:\.\d{3})*,\d{2}\s*€/g, '')
    .replace(/[–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return {
    key: id ? `id-${id}` : `no-${voucherNo}`,
    id: id || undefined,
    voucherNo: voucherNo || undefined,
    date,
    amount,
    type,
    description: description || (id ? `Buchung #${id}` : `Voucher ${voucherNo}`)
  }
}

function shouldSkipInlineVoucherReference(text: string, start: number, label?: string) {
  const before = normalizeLookup(text.slice(Math.max(0, start - 32), start))
  const after = normalizeLookup(text.slice(start, start + 48))
  const context = `${before} ${after}`
  const nonVoucherPrefix =
    /(budget|bank\s*import|bankimport|bank\s*transaktion|banktransaktion|bank\s*beleg|bankbeleg|transaktion|transaction|zahlungskonto|konto)$/
  const nonVoucherId =
    /(budget id|bank\s*import id|bankimport id|bank\s*transaktion id|banktransaktion id|bank\s*beleg id|bankbeleg id|transaktion id|transaction id|paymentaccount id)/
  if (nonVoucherPrefix.test(before)) return true
  if (nonVoucherId.test(context)) return true
  return (
    normalizeLookup(label) === 'id' &&
    /(budget|bank\s*import|bankimport|bank\s*transaktion|banktransaktion|bank\s*beleg|bankbeleg|transaktion|transaction)/.test(
      before
    )
  )
}

function renderVoucherReference(
  mention: AiVoucherMention,
  onOpenVoucher: (mention: AiVoucherMention) => void,
  key: string
) {
  return (
    <button
      key={key}
      type="button"
      className={`ai-inline-voucher-ref ai-inline-voucher-ref--${mention.type ? mention.type.toLowerCase() : 'neutral'}`}
      title={`${mention.description}${mention.amount ? ` · ${mention.amount}` : ''}`}
      onClick={() => onOpenVoucher(mention)}
    >
      {mention.id ? `ID ${mention.id}` : mention.voucherNo}
    </button>
  )
}

function renderInlineVoucherReferences(
  text: string,
  onOpenVoucher?: (mention: AiVoucherMention) => void
) {
  if (!onOpenVoucher) return [text]
  const nodes: React.ReactNode[] = []
  const regex =
    /\b(Buchungen|Buchung|Belege|Beleg|Voucher|ID)\s*#?\s*((?:\d+\s*(?:\/\s*)?)+)|\b(20\d{2}-\d{2}-\d{2}_\d{5})\b/gi
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text))) {
    const start = match.index
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start))
    if (match[3]) {
      const voucherNo = match[3]
      const mention = voucherMentionFromContext(null, voucherNo, text, start)
      nodes.push(renderVoucherReference(mention, onOpenVoucher, `voucher-no-${voucherNo}-${start}`))
    } else if (shouldSkipInlineVoucherReference(text, start, match[1])) {
      nodes.push(match[0])
    } else {
      const ids = Array.from(match[2].matchAll(/\d+/g))
        .map((item) => Number(item[0]))
        .filter((id) => Number.isInteger(id) && id > 0)
      nodes.push(`${match[1]} `)
      ids.forEach((id, idx) => {
        if (idx > 0) nodes.push(' / ')
        nodes.push(
          renderVoucherReference(
            voucherMentionFromContext(id, null, text, start),
            onOpenVoucher,
            `voucher-id-${id}-${start}-${idx}`
          )
        )
      })
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes.length ? nodes : [text]
}

function renderInlineMarkdown(text: string, onOpenVoucher?: (mention: AiVoucherMention) => void) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, idx) => {
    const strong = part.match(/^\*\*([^*]+)\*\*$/)
    return strong ? (
      <strong key={idx}>{renderInlineVoucherReferences(strong[1], onOpenVoucher)}</strong>
    ) : (
      <React.Fragment key={idx}>
        {renderInlineVoucherReferences(part, onOpenVoucher)}
      </React.Fragment>
    )
  })
}

function splitMarkdownTableRow(line: string) {
  const trimmed = String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

function isMarkdownTableSeparator(line: string) {
  const cells = splitMarkdownTableRow(line)
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))
}

function isMarkdownTableLine(line: string) {
  return /^\s*\|.+\|\s*$/.test(line) && splitMarkdownTableRow(line).length > 1
}

function parseCompactMarkdownTable(line: string) {
  const normalized = String(line || '').trim()
  const separator = normalized.match(/\|\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?/)
  if (!separator) return null
  const before = normalized.slice(0, separator.index).trim()
  const after = normalized.slice((separator.index || 0) + separator[0].length).trim()
  const headers = splitMarkdownTableRow(before)
  if (headers.length < 2 || !after) return null
  const cells = splitMarkdownTableRow(after)
  if (cells.length < headers.length) return null
  const rows: string[][] = []
  for (let idx = 0; idx < cells.length; idx += headers.length) {
    const row = cells.slice(idx, idx + headers.length)
    if (row.length === headers.length && row.some(Boolean)) rows.push(row)
  }
  return rows.length ? { headers, rows } : null
}

function renderMarkdownTable(
  headers: string[],
  rows: string[][],
  key: string,
  onOpenVoucher?: (mention: AiVoucherMention) => void
) {
  const shouldRenderVoucherLinksInColumn = (header: string) => {
    const normalized = normalizeLookup(header)
    return !/\b(bank\s*transaktion|banktransaktion|bank\s*beleg|bankbeleg|transaktion|transaction)\b/.test(
      normalized
    )
  }
  const columnClassName = (header: string) => {
    const normalized = normalizeLookup(header)
    if (/(betrag|summe|saldo|einnahm|ausgab|brutto|netto|mwst|ust|preis|kosten)/.test(normalized))
      return 'is-number'
    if (/(datum|faellig|fallig|zeitraum)/.test(normalized)) return 'is-date'
    return undefined
  }
  return (
    <div key={key} className="ai-markdown-table-wrap">
      <table className="ai-markdown-table">
        <thead>
          <tr>
            {headers.map((header, headerIdx) => (
              <th key={headerIdx} className={columnClassName(header)}>
                {renderInlineMarkdown(header, onOpenVoucher)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {headers.map((header, cellIdx) => {
                const cellOpenVoucher = shouldRenderVoucherLinksInColumn(header)
                  ? onOpenVoucher
                  : undefined
                return (
                  <td key={cellIdx} className={columnClassName(header || '')}>
                    {renderInlineMarkdown(row[cellIdx] || '', cellOpenVoucher)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AiMarkdown({
  text,
  onOpenVoucher
}: {
  text: string
  onOpenVoucher?: (mention: AiVoucherMention) => void
}) {
  const blocks: React.ReactNode[] = []
  const lines = String(text || '').split(/\r?\n/)
  let idx = 0
  while (idx < lines.length) {
    const line = lines[idx].trim()
    if (!line) {
      idx += 1
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/) || line.match(/^\*\*([^*]+)\*\*$/)
    if (heading) {
      const content = heading[2] || heading[1]
      blocks.push(<h4 key={`h-${idx}`}>{renderInlineMarkdown(content, onOpenVoucher)}</h4>)
      idx += 1
      continue
    }

    if (isMarkdownTableLine(line)) {
      const compactTable = parseCompactMarkdownTable(line)
      if (compactTable) {
        blocks.push(
          renderMarkdownTable(
            compactTable.headers,
            compactTable.rows,
            `table-${idx}`,
            onOpenVoucher
          )
        )
        idx += 1
        continue
      }

      if (idx + 1 < lines.length && isMarkdownTableSeparator(lines[idx + 1])) {
        const headers = splitMarkdownTableRow(line)
        idx += 2
        const rows: string[][] = []
        while (idx < lines.length && isMarkdownTableLine(lines[idx])) {
          const row = splitMarkdownTableRow(lines[idx])
          rows.push(headers.map((_, cellIdx) => row[cellIdx] || ''))
          idx += 1
        }
        blocks.push(renderMarkdownTable(headers, rows, `table-${idx}`, onOpenVoucher))
        continue
      }
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (idx < lines.length && /^[-*]\s+/.test(lines[idx].trim())) {
        items.push(lines[idx].trim().replace(/^[-*]\s+/, ''))
        idx += 1
      }
      blocks.push(
        <ul key={`ul-${idx}`}>
          {items.map((item, itemIdx) => (
            <li key={itemIdx}>{renderInlineMarkdown(item, onOpenVoucher)}</li>
          ))}
        </ul>
      )
      continue
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (idx < lines.length && /^\d+[.)]\s+/.test(lines[idx].trim())) {
        items.push(lines[idx].trim().replace(/^\d+[.)]\s+/, ''))
        idx += 1
      }
      blocks.push(
        <ol key={`ol-${idx}`}>
          {items.map((item, itemIdx) => (
            <li key={itemIdx}>{renderInlineMarkdown(item, onOpenVoucher)}</li>
          ))}
        </ol>
      )
      continue
    }

    const paragraph: string[] = []
    while (
      idx < lines.length &&
      lines[idx].trim() &&
      !/^(#{1,3})\s+/.test(lines[idx].trim()) &&
      !/^\*\*[^*]+\*\*$/.test(lines[idx].trim()) &&
      !isMarkdownTableLine(lines[idx].trim()) &&
      !/^[-*]\s+/.test(lines[idx].trim()) &&
      !/^\d+[.)]\s+/.test(lines[idx].trim())
    ) {
      paragraph.push(lines[idx].trim())
      idx += 1
    }
    blocks.push(<p key={`p-${idx}`}>{renderInlineMarkdown(paragraph.join(' '), onOpenVoucher)}</p>)
  }

  return <div className="ai-markdown">{blocks}</div>
}

function cleanVoucherMentionText(value: string) {
  return stripMarkdownInline(value)
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseMemberContributionAmount(prompt: string) {
  const toAmount = (major?: string, minor?: string) => {
    if (!major) return null
    const euros = Number(major.replace(/\./g, ''))
    if (!Number.isFinite(euros)) return null
    const cents = minor && minor !== '-' ? minor.padEnd(2, '0').slice(0, 2) : '00'
    const amount = Number(`${euros}.${cents}`)
    return amount > 0 && amount <= 1000 ? amount : null
  }

  const explicitMoney = prompt.match(/\b(\d{1,4})(?:\s*[,.]\s*(\d{1,2}|-))?\s*(?:€|eur\b|euro\b)/i)
  const explicitAmount = toAmount(explicitMoney?.[1], explicitMoney?.[2])
  if (explicitAmount != null) return explicitAmount

  const contributionNearAmount =
    prompt.match(
      /(?:mitgliedsbeitrag|beitrag|betrag)[^\n\r]{0,80}?(?:von|ueber|über|=|:)\s*(\d{1,4})(?:\s*[,.]\s*(\d{1,2}|-))?/i
    ) || prompt.match(/(?:mitgliedsbeitrag|beitrag|betrag)\s+(\d{1,4})(?:\s*[,.]\s*(\d{1,2}|-))?/i)
  return toAmount(contributionNearAmount?.[1], contributionNearAmount?.[2])
}

function parseContributionHint(prompt: string) {
  const normalized = normalizeLookup(prompt)
  const amount = parseMemberContributionAmount(prompt)
  const interval: TMemberCreateInput['contribution_interval'] | null = /(jahr|jaehr|jähr)/.test(
    normalized
  )
    ? 'YEARLY'
    : /(quartal|viertel)/.test(normalized)
      ? 'QUARTERLY'
      : /(monat)/.test(normalized)
        ? 'MONTHLY'
        : null
  return { amount, interval }
}

function isLikelyMemberName(name: string) {
  const cleaned = String(name || '')
    .replace(/^[\d.)\-\s]+/, '')
    .replace(/[,;:]$/, '')
    .trim()
  const normalized = normalizeLookup(cleaned)
  if (!cleaned || !/[A-Za-zÄÖÜäöüß]{2,}\s+[A-Za-zÄÖÜäöüß]{2,}/.test(cleaned)) return false
  if (
    /^(erste zahlungsfrist|zahlungsfrist|faelligkeit|falligkeit|geburt|geburtsdatum|eintritt|beitrag|mitgliedsbeitrag|betrag|rolle|hinweis|mitglied|mitglieder|mitgliederanlage|beitragspflicht)$/.test(
      normalized
    )
  )
    return false
  return true
}

function sanitizeMemberDrafts(members: AiMemberDraft[]) {
  const seen = new Set<string>()
  const sanitized: AiMemberDraft[] = []
  for (const member of members) {
    if (!isLikelyMemberName(member.name)) continue
    const key = normalizeLookup(`${member.name}-${member.joinDate}`)
    if (seen.has(key)) continue
    seen.add(key)
    sanitized.push({
      ...member,
      contributionAmount:
        member.contributionAmount &&
        member.contributionAmount > 0 &&
        member.contributionAmount <= 1000
          ? member.contributionAmount
          : null
    })
  }
  return sanitized
}

function sanitizeMemberState(state?: AiMemberImportState | null) {
  if (!state) return null
  const members = sanitizeMemberDrafts(state.members || [])
  return members.length ? { ...state, members } : null
}

function boardRoleFromText(value: string): TMemberCreateInput['boardRole'] | null {
  const normalized = normalizeLookup(value)
  if (/vorsitz|1 vorstand|vorstandsvorsitz/.test(normalized)) return 'V1'
  if (/stellvertret|2 vorstand/.test(normalized)) return 'V2'
  if (/kassier|kassenwart|schatzmeister/.test(normalized)) return 'KASSIER'
  if (/schrift/.test(normalized)) return 'SCHRIFT'
  if (/kassenpruefer|kassenprufer/.test(normalized)) return 'KASSENPR1'
  return null
}

function memberStatusFromText(value: string): TMemberUpdateInput['status'] | null {
  const normalized = normalizeLookup(value)
  if (/(aktiv|active)/.test(normalized) && !/(inaktiv|paus)/.test(normalized)) return 'ACTIVE'
  if (/(neu|new)/.test(normalized)) return 'NEW'
  if (/(paus|inaktiv|ruhend)/.test(normalized)) return 'PAUSED'
  if (/(ausgetreten|austritt|ausgeschieden|left)/.test(normalized)) return 'LEFT'
  return null
}

function intervalLabel(value?: TMemberCreateInput['contribution_interval'] | null) {
  if (value === 'MONTHLY') return 'monatlich'
  if (value === 'QUARTERLY') return 'quartalsweise'
  if (value === 'YEARLY') return 'jährlich'
  return '-'
}

function boardRoleLabel(value?: TMemberCreateInput['boardRole'] | null) {
  if (value === 'V1') return '1. Vorsitz'
  if (value === 'V2') return '2. Vorsitz'
  if (value === 'KASSIER') return 'Kassier'
  if (value === 'KASSENPR1') return '1. Kassenprüfer'
  if (value === 'KASSENPR2') return '2. Kassenprüfer'
  if (value === 'SCHRIFT') return 'Schriftführer'
  return '-'
}

function memberStatusLabel(value?: TMemberUpdateInput['status'] | null) {
  if (value === 'ACTIVE') return 'Aktiv'
  if (value === 'NEW') return 'Neu'
  if (value === 'PAUSED') return 'Pausiert'
  if (value === 'LEFT') return 'Ausgetreten'
  return '-'
}

function memberFieldLabel(field: AiMemberUpdateField) {
  const labels: Record<AiMemberUpdateField, string> = {
    memberNo: 'Mitgliedsnummer',
    name: 'Name',
    email: 'E-Mail',
    phone: 'Telefon',
    address: 'Adresse',
    status: 'Status',
    boardRole: 'Rolle',
    iban: 'IBAN',
    bic: 'BIC',
    contribution_amount: 'Beitrag',
    contribution_interval: 'Intervall',
    mandate_ref: 'Mandatsreferenz',
    mandate_date: 'Mandatsdatum',
    join_date: 'Eintritt',
    leave_date: 'Austritt',
    notes: 'Notizen',
    next_due_date: 'Nächste Frist'
  }
  return labels[field] || String(field)
}

function displayMemberValue(field: AiMemberUpdateField, value: unknown) {
  if (value == null || value === '') return '-'
  if (field === 'contribution_amount') return euro.format(Number(value))
  if (field === 'contribution_interval')
    return intervalLabel(value as TMemberCreateInput['contribution_interval'])
  if (field === 'boardRole') return boardRoleLabel(value as TMemberCreateInput['boardRole'])
  if (field === 'status') return memberStatusLabel(value as TMemberUpdateInput['status'])
  if (
    field === 'join_date' ||
    field === 'leave_date' ||
    field === 'mandate_date' ||
    field === 'next_due_date'
  )
    return formatIsoDate(String(value))
  return String(value)
}

function wantsMemberCreation(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(mitglied|mitglieder|mitgliedsanlage)/.test(normalized) &&
    /(anleg|anlage|erstell|aufnehm|importier|vorbereit|uebernehm|ubernehm)/.test(normalized)
  )
}

function wantsCreatePendingMembers(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(leg|lege|anleg|speicher|erstell|uebernehm|ubernehm)/.test(normalized) &&
    /(diese|diesen|alle|drei|3|nur)/.test(normalized)
  )
}

function wantsMemberRead(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(mitglied|mitglieder|vorstand|rolle|rollen|beitrag|beitraege|beitrage)/.test(normalized) &&
    /(zeig|zeige|liste|list|welche|wer|wie viele|ausles|uebersicht|ubersicht|status|haben wir)/.test(
      normalized
    )
  )
}

function wantsMemberUpdate(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(mitglied|mitglieder|beitrag|beitraege|beitrage|rolle|vorstand|status|eintritt|austritt|zahlungsfrist|faelligkeit|falligkeit)/.test(
      normalized
    ) &&
    /(setz|setze|aender|ander|ändere|bearbeit|update|mach|stelle|korrigier|monatlich|jaehrlich|jahrlich|jährlich|paus|aktiv|ausgetreten|vorsitz|kassier)/.test(
      normalized
    )
  )
}

function wantsContributionPaymentAction(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(mitgliedsbeitrag|beitrag|beitraege|beitrage|beitragszahlung|zahlung)/.test(normalized) &&
    /(buchung|buche|buchen|erstell|anleg|verbuch|verknuepf|verknupf|link|bezahlt|zahlungseingang)/.test(
      normalized
    )
  )
}

function wantsContextualBookingLink(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(hierzu|dazu|dafuer|dafur|diese|den|das|offene|ausstehende)/.test(normalized) &&
    /(buchung|buche|buchen|erstell|anleg|verbuch|verknuepf|verknupf|link|bezahlt|zahlungseingang)/.test(
      normalized
    )
  )
}

function wantsContributionDueRead(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(mitgliedsbeitrag|beitrag|beitraege|beitrage|beitragszahlung|beitragszahlungen|zahlung|zahlungen)/.test(
      normalized
    ) &&
    /(offen|aussteh|faellig|fallig|rueckstand|ruckstand|ueberfaellig|uberfallig|nicht bezahlt|noch|check|pruef|pruf|welche|wer|bei welchem)/.test(
      normalized
    )
  )
}

function wantsApplyPendingMemberUpdates(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(uebernehm|ubernehm|anwenden|speicher|ausfuehr|ausfuhr|durchfuehr|durchfuhr|aendern|andern)/.test(
      normalized
    ) && /(diese|alle|vorschlaege|vorschlage|aenderungen|anderungen|so|passt)/.test(normalized)
  )
}

function parseMemberDraftsFromText(prompt: string): AiMemberImportState | null {
  const contribution = parseContributionHint(prompt)
  const globalNextDue = (() => {
    const dueMatch = prompt.match(
      /(?:zahlungsfrist|fälligkeit|faelligkeit|frist)[^\n\r]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i
    )
    return dueMatch ? parseGermanDate(dueMatch[1]) : null
  })()
  const lines = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const members: AiMemberDraft[] = []
  const pushDraft = (draft: AiMemberDraft) => {
    const key = normalizeLookup(`${draft.name}-${draft.joinDate}`)
    if (members.some((member) => normalizeLookup(`${member.name}-${member.joinDate}`) === key))
      return
    members.push(draft)
  }
  for (const line of lines) {
    const dates = Array.from(line.matchAll(/\b\d{1,2}\.\d{1,2}\.(?:20|19)\d{2}\b/g)).map(
      (match) => match[0]
    )
    if (!dates.length) continue
    const firstDateIndex = line.search(/\b\d{1,2}\.\d{1,2}\.(?:20|19)\d{2}\b/)
    const rawName = line
      .slice(0, firstDateIndex)
      .replace(/^[\d.)\-\s]+/, '')
      .replace(/[,;:]$/, '')
      .trim()
    const name = rawName || line.split(',')[0]?.trim()
    if (!name || !isLikelyMemberName(name)) continue
    const entryMatch = line.match(/eintritt[^\d]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i)
    const joinDate = parseGermanDate(entryMatch?.[1] || dates[1] || dates[0])
    if (!joinDate) continue
    pushDraft({
      name,
      birthDate: parseGermanDate(dates[0]),
      joinDate,
      boardRole: boardRoleFromText(line),
      contributionAmount: contribution.amount,
      contributionInterval: contribution.interval || undefined,
      nextDueDate: globalNextDue
    })
  }
  const blocks: Array<{ name: string; lines: string[] }> = []
  let currentBlock: { name: string; lines: string[] } | null = null
  for (const line of lines) {
    const heading = line.match(/^\s*\d+[).]\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß' -]+)$/)
    if (heading) {
      if (currentBlock) blocks.push(currentBlock)
      currentBlock = { name: heading[1].trim(), lines: [line] }
    } else if (currentBlock) {
      currentBlock.lines.push(line)
    }
  }
  if (currentBlock) blocks.push(currentBlock)
  for (const block of blocks) {
    if (!isLikelyMemberName(block.name)) continue
    const text = block.lines.join('\n')
    const birthDate = parseGermanDate(
      text.match(/geburtsdatum[^\d]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i)?.[1] || ''
    )
    const joinDate = parseGermanDate(
      text.match(/eintritt[^\d]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i)?.[1] || ''
    )
    if (!joinDate) continue
    const blockContribution = parseContributionHint(text)
    const blockDue =
      parseGermanDate(
        text.match(
          /(?:zahlungsfrist|beitragspflicht|fälligkeit|faelligkeit)[^\d]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i
        )?.[1] || ''
      ) || globalNextDue
    pushDraft({
      name: block.name,
      birthDate,
      joinDate,
      boardRole: boardRoleFromText(text),
      contributionAmount: blockContribution.amount ?? contribution.amount,
      contributionInterval: blockContribution.interval || contribution.interval || undefined,
      nextDueDate: blockDue
    })
  }
  const sanitized = sanitizeMemberDrafts(members)
  return sanitized.length ? { members: sanitized, sourcePrompt: prompt, status: 'DRAFT' } : null
}

function filterMembersForPrompt(prompt: string, members: MemberRow[]) {
  const normalized = normalizeLookup(prompt)
  const activeRows = members.filter((member) => member.status !== 'LEFT')
  const strictlyActiveRows = members.filter((member) => member.status === 'ACTIVE')
  const batchAll = /(alle|allen|jede|jeden|saemtliche|samtliche)/.test(normalized)
  const withoutContribution = /(ohne beitrag|beitrag fehlt|fehlender beitrag|keinen beitrag)/.test(
    normalized
  )
  if (batchAll) {
    const base = /(aktive|aktiven|active)/.test(normalized)
      ? strictlyActiveRows
      : /(ausgetreten|inklusive ausgetreten|alle status)/.test(normalized)
        ? members
        : activeRows
    return withoutContribution ? base.filter((member) => !member.contribution_amount) : base
  }

  const named = activeRows.filter((member) => {
    const memberName = normalizeLookup(member.name)
    if (memberName && normalized.includes(memberName)) return true
    const parts = memberName.split(' ').filter((part) => part.length >= 3)
    return parts.length >= 2 && parts.every((part) => normalized.includes(part))
  })
  const uniquePartial = named.length
    ? []
    : activeRows.filter((member) => {
        const parts = normalizeLookup(member.name)
          .split(' ')
          .filter((part) => part.length >= 4)
        return parts.some((part) => normalized.includes(part))
      })
  const selected = named.length ? named : uniquePartial.length === 1 ? uniquePartial : []
  return withoutContribution ? selected.filter((member) => !member.contribution_amount) : selected
}

function addMemberUpdateChange(
  changes: AiMemberUpdateChange[],
  member: MemberRow,
  field: AiMemberUpdateField,
  newValue: TMemberUpdateInput[AiMemberUpdateField] | null | undefined
) {
  const oldValue = member[field as keyof MemberRow] as
    | TMemberUpdateInput[AiMemberUpdateField]
    | null
    | undefined
  const oldDisplay = displayMemberValue(field, oldValue)
  const newDisplay = displayMemberValue(field, newValue)
  if (oldDisplay === newDisplay) return
  changes.push({
    id: `${member.id}-${field}-${changes.length}`,
    memberId: member.id,
    memberName: member.name,
    field,
    label: memberFieldLabel(field),
    oldValue,
    newValue,
    oldDisplay,
    newDisplay,
    selected: true
  })
}

function buildMemberUpdateDraft(prompt: string, members: MemberRow[]): AiMemberUpdateState | null {
  const normalized = normalizeLookup(prompt)
  const targets = filterMembersForPrompt(prompt, members)
  if (!targets.length) return null
  const contribution = parseContributionHint(prompt)
  const role = boardRoleFromText(prompt)
  const status = memberStatusFromText(prompt)
  const joinDate = parseGermanDate(
    prompt.match(/eintritt[^\d]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i)?.[1] || ''
  )
  const leaveDate = parseGermanDate(
    prompt.match(/austritt[^\d]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i)?.[1] || ''
  )
  const nextDue = parseGermanDate(
    prompt.match(
      /(?:zahlungsfrist|beitragspflicht|fälligkeit|faelligkeit|frist)[^\d]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i
    )?.[1] || ''
  )
  const changes: AiMemberUpdateChange[] = []
  if (role && targets.length === 1) {
    const currentRoleHolder = members.find(
      (member) => member.boardRole === role && member.id !== targets[0].id
    )
    if (currentRoleHolder) addMemberUpdateChange(changes, currentRoleHolder, 'boardRole', null)
  }

  for (const member of targets) {
    if (contribution.amount != null)
      addMemberUpdateChange(changes, member, 'contribution_amount', contribution.amount)
    if (contribution.interval)
      addMemberUpdateChange(changes, member, 'contribution_interval', contribution.interval)
    if (
      role &&
      targets.length === 1 &&
      !/(alle|allen|jede|jeden|saemtliche|samtliche)/.test(normalized)
    )
      addMemberUpdateChange(changes, member, 'boardRole', role)
    if (status) addMemberUpdateChange(changes, member, 'status', status)
    if (joinDate) addMemberUpdateChange(changes, member, 'join_date', joinDate)
    if (leaveDate) addMemberUpdateChange(changes, member, 'leave_date', leaveDate)
    if (nextDue) addMemberUpdateChange(changes, member, 'next_due_date', nextDue)
  }

  return changes.length ? { changes, sourcePrompt: prompt, status: 'DRAFT' } : null
}

function findPaymentAccountHint(prompt: string, accounts: PaymentAccountOption[]) {
  const normalizedPrompt = normalizeLookup(prompt)
  if (!normalizedPrompt) return null
  const genericTokens = new Set([
    'bank',
    'konto',
    'konten',
    'kasse',
    'cash',
    'paypal',
    'card',
    'karte'
  ])
  return (
    accounts
      .filter((account) => account.isActive !== 0)
      .map((account) => {
        const normalizedName = normalizeLookup(account.name)
        const tokens = normalizedName
          .split(' ')
          .filter((token) => token.length >= 4 && !genericTokens.has(token))
        let score = 0
        if (normalizedName && normalizedPrompt.includes(normalizedName))
          score += 1000 + normalizedName.length
        for (const token of tokens) {
          if (normalizedPrompt.includes(token)) score += token.length
        }
        return { account, normalizedName, score }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.normalizedName.length - a.normalizedName.length)[0]
      ?.account || null
  )
}

function shouldApplyAccountHintToAll(prompt: string) {
  return /(alle|allen|jede|jeden|saemtliche|samtliche|immer|standard|default|grundsaetzlich|grundsatzlich|nicht anders angegeben|gehen diese auf|sollen auf|soll bei allen)/.test(
    normalizeLookup(prompt)
  )
}

function formatAiUsage(usage?: TAiJobsGetOutput['usage'] | null) {
  if (!usage) return ''
  const tokens = Number(usage.totalTokens || 0).toLocaleString('de-DE')
  const cost =
    usage.estimatedCostUsd == null ? 'Kosten n/a' : usd.format(Number(usage.estimatedCostUsd || 0))
  return `${tokens} Tokens · ${cost}`
}

type AiPlanValue = TAiActionPlan['changes'][number]['value']

function planValueList(value: AiPlanValue | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
  if (value == null || value === '') return []
  return [String(value)]
}

function planValueString(value: AiPlanValue | undefined) {
  return planValueList(value)[0] || ''
}

function normalizePlanKey(value: string) {
  return normalizeLookup(value).replace(/\s+/g, '_')
}

function findPlanFilter(plan: TAiActionPlan, fields: string[]) {
  const wanted = new Set(fields.map(normalizePlanKey))
  return plan.filters.find((filter) => wanted.has(normalizePlanKey(filter.field)))?.value
}

function findPlanChange(plan: TAiActionPlan, fields: string[], modes?: string[]) {
  const wanted = new Set(fields.map(normalizePlanKey))
  const allowedModes = modes ? new Set(modes.map(normalizePlanKey)) : null
  return plan.changes.find(
    (change) =>
      wanted.has(normalizePlanKey(change.field)) &&
      (!allowedModes || allowedModes.has(normalizePlanKey(change.mode)))
  )?.value
}

function findPlanArg(plan: TAiActionPlan, keys: string[]) {
  const wanted = new Set(keys.map(normalizePlanKey))
  return plan.args.find((arg) => wanted.has(normalizePlanKey(arg.key)))?.value
}

function planItemValue(item: TAiActionPlan['items'][number], keys: string[]) {
  const wanted = new Set(keys.map(normalizePlanKey))
  return item.values.find((entry) => wanted.has(normalizePlanKey(entry.key)))?.value
}

function parsePlanDate(value: AiPlanValue | undefined) {
  const raw = planValueString(value)
  if (!raw) return null
  const iso = raw.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return iso[0]
  return parseGermanDate(raw)
}

function parsePlanAmount(value: AiPlanValue | undefined) {
  if (typeof value === 'number') return value > 0 && value <= 1000 ? value : null
  const raw = planValueString(value)
  if (!raw) return null
  const parsed = parseMemberContributionAmount(raw.includes('€') ? raw : `${raw} €`)
  return parsed != null ? parsed : null
}

function parsePlanInterval(
  value: AiPlanValue | undefined
): TMemberCreateInput['contribution_interval'] | null {
  const normalized = normalizeLookup(planValueString(value))
  if (!normalized) return null
  if (/yearly|jahr|jaehr|jahrlich|jährlich/.test(normalized)) return 'YEARLY'
  if (/quarterly|quartal/.test(normalized)) return 'QUARTERLY'
  if (/monthly|monat/.test(normalized)) return 'MONTHLY'
  return null
}

function parsePlanBoardRole(
  value: AiPlanValue | undefined
): TMemberCreateInput['boardRole'] | null {
  const raw = planValueString(value)
  if (!raw) return null
  if (/^(V1|V2|KASSIER|SCHRIFT|KASSENPR1|KASSENPR2)$/.test(raw))
    return raw as TMemberCreateInput['boardRole']
  return boardRoleFromText(raw)
}

function memberStateFromPlan(
  plan: TAiActionPlan,
  sourcePrompt: string
): AiMemberImportState | null {
  const globalAmount = parsePlanAmount(
    findPlanChange(plan, [
      'contributionAmount',
      'contribution_amount',
      'beitrag',
      'mitgliedsbeitrag'
    ])
  )
  const globalInterval = parsePlanInterval(
    findPlanChange(plan, [
      'contributionInterval',
      'contribution_interval',
      'intervall',
      'beitragsintervall'
    ])
  )
  const globalNextDue = parsePlanDate(
    findPlanChange(plan, [
      'nextDueDate',
      'next_due_date',
      'ersteZahlungsfrist',
      'zahlungsfrist',
      'frist'
    ])
  )

  const members = plan.items.map((item) => {
    const name = planValueString(
      planItemValue(item, ['name', 'memberName', 'mitglied', 'vollerName'])
    )
    const birthDate = parsePlanDate(
      planItemValue(item, ['birthDate', 'birth_date', 'geburtsdatum', 'geburt'])
    )
    const joinDate = parsePlanDate(
      planItemValue(item, ['joinDate', 'join_date', 'eintritt', 'eintrittsdatum'])
    )
    const contributionAmount =
      parsePlanAmount(
        planItemValue(item, [
          'contributionAmount',
          'contribution_amount',
          'beitrag',
          'mitgliedsbeitrag'
        ])
      ) ?? globalAmount
    const contributionInterval =
      parsePlanInterval(
        planItemValue(item, [
          'contributionInterval',
          'contribution_interval',
          'intervall',
          'beitragsintervall'
        ])
      ) || globalInterval
    const nextDueDate =
      parsePlanDate(
        planItemValue(item, [
          'nextDueDate',
          'next_due_date',
          'ersteZahlungsfrist',
          'zahlungsfrist',
          'frist'
        ])
      ) || globalNextDue
    return {
      name,
      birthDate,
      joinDate: joinDate || '',
      boardRole: parsePlanBoardRole(
        planItemValue(item, ['boardRole', 'board_role', 'rolle', 'vorstandsrolle'])
      ),
      contributionAmount,
      contributionInterval,
      nextDueDate
    } satisfies AiMemberDraft
  })

  const sanitized = sanitizeMemberDrafts(members)
  return sanitized.length ? { members: sanitized, sourcePrompt, status: 'DRAFT' } : null
}

function tagPromptFromPlan(plan: TAiActionPlan, fallbackPrompt: string) {
  const names = [
    ...planValueList(
      findPlanChange(plan, ['name', 'names', 'tag', 'tags'], ['add', 'set', 'append'])
    ),
    ...plan.items.flatMap((item) => planValueList(planItemValue(item, ['name', 'tag', 'tags'])))
  ]
    .map(cleanTagCandidateName)
    .filter(isLikelyTagName)
    .filter(
      (name, idx, list) =>
        list.findIndex((item) => normalizeLookup(item) === normalizeLookup(name)) === idx
    )
  if (names.length) return `Lege Tags ${names.join(', ')} an.`
  return fallbackPrompt
}

function voucherTagPromptFromPlan(plan: TAiActionPlan, fallbackPrompt: string) {
  const sourceTag = cleanTagCandidateName(
    planValueString(findPlanFilter(plan, ['tag', 'tags', 'sourceTag', 'source_tag']))
  )
  const addedTags = planValueList(
    findPlanChange(plan, ['tags', 'tag', 'addedTags', 'added_tags'], ['add', 'append'])
  )
    .map(cleanTagCandidateName)
    .filter(isLikelyTagName)
  if (sourceTag && addedTags.length) {
    return `Ergänze bei allen Buchungen mit Tag ${sourceTag} zusätzlich den Tag ${addedTags.join(', ')}.`
  }
  return fallbackPrompt
}

function bookingAnalysis(job: TAiJobsGetOutput | null): TAiBookingAnalysisResult | null {
  const result = job?.result as TAiBookingAnalysisResult | undefined
  return result?.candidates?.length ? result : null
}

function bookingAnalysisFromJob(job: BookingJobLike | null): TAiBookingAnalysisResult | null {
  const result = job?.result as TAiBookingAnalysisResult | undefined
  return result?.candidates?.length ? result : null
}

function isCandidateApproved(candidate?: TAiBookingCandidate | null, job?: BookingJobLike | null) {
  if (!candidate) return false
  if (candidate.review?.status === 'APPROVED' || candidate.review?.voucherId) return true
  const analysis = bookingAnalysisFromJob(job || null)
  return job?.status === 'APPROVED' && analysis?.candidates?.length === 1 && !!job.voucherId
}

function bookingProgress(job: BookingJobLike) {
  const analysis = bookingAnalysisFromJob(job)
  if (!analysis) return ''
  const approved = analysis.candidates.filter((candidate) =>
    isCandidateApproved(candidate, job)
  ).length
  return `${approved}/${analysis.candidates.length} gebucht`
}

function hasOpenBookingCandidates(job: BookingJobLike) {
  if (job.status === 'APPROVED' || job.status === 'REJECTED') return false
  const analysis = bookingAnalysisFromJob(job)
  if (!analysis) return job.status !== 'APPROVED'
  return analysis.candidates.some((candidate) => !isCandidateApproved(candidate, job))
}

function firstOpenCandidateIndex(job: BookingJobLike) {
  const analysis = bookingAnalysisFromJob(job)
  if (!analysis) return 0
  const idx = analysis.candidates.findIndex((candidate) => !isCandidateApproved(candidate, job))
  return idx >= 0 ? idx : 0
}

function routeTextType(prompt: string): TAiTextGenerateInput['type'] {
  const normalized = prompt.toLowerCase()
  if (
    /(bericht|report|kassier|jahres|finanz|auswertung|einnahm|ausgab|saldo|bilanz|umsatz|gewinn|verlust|tag|tags|kategorie|kategorien|stammdaten|konto|konten|budget|budgets)/.test(
      normalized
    )
  )
    return 'REPORT_TEXT'
  if (/(mitglied|info|nachricht|mail|email|einladung|veranstaltung|fest)/.test(normalized)) {
    return normalized.includes('einladung') ? 'INVITATION' : 'MEMBER_MESSAGE'
  }
  return 'MEMBER_MESSAGE'
}

function isVereinRelevantPrompt(prompt: string) {
  return /verein|vereino|mitglied|mitglieder|vorstand|kassier|kasse|beitrag|spende|rechnung|beleg|buchung|zahlung|bank|konto|konten|budget|budgets|zweckbindung|bericht|report|einnahm|ausgab|saldo|bilanz|jahr|steuer|gemeinnuetzig|gemeinnützig|einladung|veranstaltung|sommerfest|arbeitseinsatz|protokoll|finanz|sepa|lastschrift|zuwendung|quittung|import|offen|bezahlt|tag|tags|kategorie|kategorien|stammdaten|excel|xlsx|csv|tabelle|tabellen/i.test(
    prompt
  )
}

function wantsBankImportReview(prompt: string) {
  return /(bankimport|bankbeleg|kontoauszug|offene bank|bank import|banktransaktion)/i.test(prompt)
}

function wantsReportExport(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(export|exportier|erstelle|erzeuge|speicher|download)/.test(normalized) &&
    /(bericht|report|controlling|journal|auswertung|buchungen|finanz|kassier|jahresabschluss)/.test(
      normalized
    )
  )
}

function wantsReportFollowup(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return /(bericht|report|controlling|kpi|kennzahl|auswertung|saldo|salden|einnahm|ausgab|jahresergebnis|spendenanteil|top|zeitraum|monat|monate|quartal|auffaellig|auffallig|heraussticht|raussticht)/.test(
    normalized
  )
}

function wantsTagRead(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(tag|tags|kategorie|kategorien|stammdaten)/.test(normalized) &&
    /(welche|zeige|zeig|liste|uebersicht|ubersicht|haben wir|angelegt|gibt es)/.test(normalized)
  )
}

function wantsTagAction(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    !wantsTagRead(prompt) &&
    /(tag|tags)/.test(normalized) &&
    /(anleg|erstell|speicher|uebernehm|ubernehm|loesch|losch|entfern|benenn|umbenenn|aender|ander|farbe|color)/.test(
      normalized
    )
  )
}

function wantsVoucherTagAction(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(buchung|buchungen|beleg|belege|journal|voucher)/.test(normalized) &&
    /(tag|tags)/.test(normalized) &&
    /(ergaenz|erganz|hinzufueg|hinzufug|setze|setz|versehen|markier|markiere|entfern|loesch|losch)/.test(
      normalized
    )
  )
}

function wantsApplyPendingTagActions(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(ja|mach|bitte|ok|okay|passt|uebernehm|ubernehm|anwenden|speicher|anlegen|erstellen|ausfuehr|ausfuhr)/.test(
      normalized
    ) && !/(nicht|abbrechen|stop)/.test(normalized)
  )
}

function wantsApplyPendingVoucherActions(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(ja|mach|bitte|ok|okay|passt|uebernehm|ubernehm|anwenden|speicher|aendern|andern|ausfuehr|ausfuhr)/.test(
      normalized
    ) && !/(nicht|abbrechen|stop)/.test(normalized)
  )
}

function wantsModifyPendingReview(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(aender|ander|korrigier|korrekt|setze|setz|fueg|fug|hinzufueg|hinzufug|hinzufügen|ergaenz|erganz|ergänz|tausch|wechsel|statt|auf)/.test(
      normalized
    ) &&
    /(sphaere|sphare|zweck|ideell|vermoegen|wgb|rechnungsnummer|nummer|datum|faellig|fallig|betrag|beschreibung|partei|stadt|budget|zweckbindung|tag|tags|konto|zahlungskonto)/.test(
      normalized
    ) &&
    !/(nicht|abbrechen|stop)/.test(normalized)
  )
}

function tagColorForName(name: string) {
  let hash = 0
  for (let idx = 0; idx < name.length; idx += 1)
    hash = ((hash << 5) - hash + name.charCodeAt(idx)) | 0
  return TAG_ACTION_COLORS[Math.abs(hash) % TAG_ACTION_COLORS.length]
}

function cleanTagCandidateName(value: string) {
  return String(value || '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s+[–-]\s+.*$/g, '')
    .replace(/^[„"']|[“"'.:,;]$/g, '')
    .trim()
}

function isLikelyTagName(value: string) {
  const name = cleanTagCandidateName(value)
  const normalized = normalizeLookup(name)
  if (!name || name.length > 36 || name.length < 2) return false
  if (!/[A-Za-zÄÖÜäöüß0-9]/.test(name)) return false
  if (
    /(bereits|vorhanden|empfehlung|wenn du|moechtest|mochtest|sinnvoll|folgende|angelegt|kategorie|kategorien|budget|budgets|zweckbindung|bericht|tabelle|verein|kontext|tags?)/.test(
      normalized
    )
  )
    return false
  if (/[.!?]/.test(name)) return false
  return true
}

function extractTagNamesFromText(text: string) {
  const names: string[] = []
  const push = (raw: string) => {
    const name = cleanTagCandidateName(raw)
    if (!isLikelyTagName(name)) return
    if (!names.some((existing) => normalizeLookup(existing) === normalizeLookup(name)))
      names.push(name)
  }

  for (const match of text.matchAll(/[„"']([^„“"']{2,36})[“"']/g)) push(match[1])

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const normalized = normalizeLookup(trimmed)
    if (
      /(bereits|empfehlung|wenn du|vorhanden|angelegt|budget|zweckbindung|kategorie)/.test(
        normalized
      )
    )
      continue
    const listed = trimmed.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/)
    if (listed) push(listed[1])
  }

  const explicit = text.match(
    /(?:tags?\s*(?:anlegen|erstellen|speichern)?|lege\s+(?:die\s+)?tags?|erstelle\s+(?:die\s+)?tags?)[^:\n\r]*:?\s*([^\n\r]+)/i
  )
  if (explicit) explicit[1].split(/[,;/]| und /i).forEach(push)

  return names
}

function extractVoucherTagAppendRequest(prompt: string) {
  const names: string[] = []
  const push = (value: string) => {
    const name = cleanTagCandidateName(value)
    if (!isLikelyTagName(name)) return
    if (!names.some((existing) => normalizeLookup(existing) === normalizeLookup(name)))
      names.push(name)
  }

  const pair = prompt.match(
    /(?:buchungen|belege|journal)[\s\S]*?(?:mit\s+(?:dem\s+)?)tag\s+(.+?)(?:,|\s+noch|\s+zusätzlich|\s+zusaetzlich|\s+und)[\s\S]*?(?:mit\s+(?:dem\s+)?)tag\s+(.+?)(?:\s+(?:ergänz|ergaenz|erganz|hinzufüg|hinzufueg|hinzufug|versehen|setzen|setze|markier|markiere)|[.?!]|$)/i
  )
  if (pair) {
    push(pair[1])
    push(pair[2])
  }

  for (const match of prompt.matchAll(
    /(?:mit\s+(?:dem\s+)?|vom\s+)?tag\s+[„"']?([^,.;\n\r]+?)[“"']?(?=\s+(?:noch|zusätzlich|zusaetzlich|ergänz|ergaenz|erganz|hinzufüg|hinzufueg|hinzufug|setzen|setze|versehen|markier|markiere)|[,.;\n\r]|$)/gi
  )) {
    push(match[1])
  }

  if (names.length < 2) return null
  return { sourceTag: names[0], addedTags: names.slice(1) }
}

function resolveExistingTagName(candidate: string, tags: TagRow[]) {
  const raw = cleanTagCandidateName(candidate)
  const normalized = normalizeLookup(raw)
  if (!normalized) return raw
  const exact = tags.find((tag) => normalizeLookup(tag.name) === normalized)
  if (exact) return exact.name
  const contained = tags
    .filter((tag) => {
      const tagName = normalizeLookup(tag.name)
      return tagName && (normalized.includes(tagName) || tagName.includes(normalized))
    })
    .sort((a, b) => normalizeLookup(b.name).length - normalizeLookup(a.name).length)[0]
  if (contained) return contained.name
  const withoutTrailingVerb = raw
    .replace(
      /\s+(haben|hat|habe|bekommen|ergaenzen|ergänzen|hinzufuegen|hinzufügen|setzen|setze)$/i,
      ''
    )
    .trim()
  const fallback = tags.find(
    (tag) => normalizeLookup(tag.name) === normalizeLookup(withoutTrailingVerb)
  )
  return fallback?.name || withoutTrailingVerb || raw
}

function extractVoucherTagCorrection(prompt: string) {
  const match = prompt.match(/tag\s+(?:heisst|heißt|ist|lautet)\s+[„"']?([^,.;\n\r]+)[“"']?/i)
  return match ? cleanTagCandidateName(match[1]) : null
}

function parseReportExportRequest(prompt: string): { payload: TReportsExportInput; label: string } {
  const normalized = normalizeLookup(prompt)
  const yearMatch = normalized.match(/\b(20\d{2})\b/)
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear()
  const isoDates = Array.from(prompt.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)).map(
    (match) => match[0]
  )
  const relativeMonths = normalized.match(/letzte(?:n|r|s)?\s+(\d{1,2})\s+monat/)
  const today = new Date()
  const to = isoDates[1] || (relativeMonths ? isoDate(today) : `${year}-12-31`)
  const from =
    isoDates[0] ||
    (relativeMonths
      ? (() => {
          const start = new Date(today)
          start.setMonth(start.getMonth() - Number(relativeMonths[1]))
          return isoDate(start)
        })()
      : `${year}-01-01`)
  const format: TReportsExportInput['format'] = /\b(csv)\b/.test(normalized)
    ? 'CSV'
    : /\b(xlsx|excel)\b/.test(normalized)
      ? 'XLSX'
      : 'PDF'
  const type: TReportsExportInput['type'] = /(budget|plan.*ist|soll.*ist)/.test(normalized)
    ? 'BUDGET_VS_ACTUAL'
    : /(sphaere|sphare|ideell|zweckbetrieb|vermoegen|wirtschaft)/.test(normalized)
      ? 'SPHERE_SUMMARY'
      : /(zweckbindung|mittelverwendung)/.test(normalized)
        ? 'EARMARK_USAGE'
        : 'JOURNAL'
  return {
    label: `${format}-Controllingbericht ${from} bis ${to}`,
    payload: {
      type,
      format,
      from,
      to,
      fields: [
        'date',
        'voucherNo',
        'type',
        'sphere',
        'description',
        'status',
        'paymentMethod',
        'netAmount',
        'vatAmount',
        'grossAmount',
        'tags'
      ],
      amountMode: 'OUT_NEGATIVE',
      sort: 'ASC',
      sortBy: 'date'
    }
  }
}

function wantsBookingFromFiles(prompt: string, attachedFiles: File[]) {
  const normalized = prompt.toLowerCase()
  const hasSpreadsheet = attachedFiles.some((file) => /\.(xlsx|xls|csv|tsv)$/i.test(file.name))
  if (
    /(buchung|buchungen|buchungsvorschlag|buchungsvorschläge|buche|buchen|verbuch|anlegen|lege.*buch|erstelle.*buch|rechnung|beleg|quittung|zahlung|ausgabe|ausgaben|einnahme|einnahmen|kassenzettel)/i.test(
      normalized
    )
  )
    return true
  if (
    hasSpreadsheet &&
    /(import|stammdaten|tag|tags|kategorie|kategorien|mitglied|mitglieder|tabelle|spalten|zuordnung)/i.test(
      normalized
    )
  )
    return false
  return !hasSpreadsheet
}

function shouldProcessFilesAsBookingDocuments(prompt: string, attachedFiles: File[]) {
  return wantsBookingFromFiles(prompt, attachedFiles)
}

function bankReviewBody(result: TAiBankImportReviewOutput) {
  if (!result.suggestions.length) return 'Es wurden keine offenen Bankbelege gefunden.'
  const grouped = result.suggestions.reduce<Record<string, number>>((acc, suggestion) => {
    acc[suggestion.action] = (acc[suggestion.action] || 0) + 1
    return acc
  }, {})
  const lines = [
    result.summary || `${result.suggestions.length} offene Bankbelege geprüft.`,
    `Zuordnen: ${grouped.LINK_EXISTING || 0}`,
    `Neu anlegen: ${grouped.CREATE_BOOKING || 0}`,
    `Geprüft markieren: ${grouped.MARK_CHECKED || 0}`,
    `Manuell prüfen: ${grouped.NEEDS_MANUAL_REVIEW || 0}`
  ]
  return lines.join('\n')
}

function bankSuggestionLabel(suggestion: AiBankReviewSuggestion) {
  if (suggestion.resolved === 'LINKED') return 'Verknüpft'
  if (suggestion.resolved === 'CREATED') return 'Gebucht'
  if (suggestion.resolved === 'CHECKED') return 'Geprüft'
  if (suggestion.action === 'LINK_EXISTING') return 'Treffer'
  if (suggestion.action === 'CREATE_BOOKING') return 'Neue Buchung'
  if (suggestion.action === 'MARK_CHECKED') return 'Ohne Buchung'
  return 'Manuell prüfen'
}

function candidateSourceLabel(candidate: TAiBookingCandidate) {
  return candidate.source?.label || candidate.source?.fileName || null
}

function candidateSourceStateLabel(candidate: TAiBookingCandidate, job: TAiJobsGetOutput) {
  return isCandidateApproved(candidate, job) ? 'Gebucht' : 'Offen'
}

function bankSuggestionTone(suggestion: AiBankReviewSuggestion) {
  if (suggestion.resolved) return 'done'
  if (suggestion.action === 'LINK_EXISTING') return 'match'
  if (suggestion.action === 'CREATE_BOOKING') return 'create'
  if (suggestion.action === 'MARK_CHECKED') return 'check'
  return 'manual'
}

function bankSuggestionTitle(suggestion: AiBankReviewSuggestion) {
  const transaction = suggestion.transaction || {}
  const counterparty = transaction.counterparty || suggestion.bookingCandidate?.counterparty || null
  const purpose = transaction.purpose || suggestion.bookingCandidate?.description || null
  return (
    [counterparty, purpose].filter(Boolean).join(' · ') || `Bankbeleg #${suggestion.transactionId}`
  )
}

function bankSuggestionAmount(suggestion: AiBankReviewSuggestion) {
  const transaction = suggestion.transaction || {}
  const amount = Number(transaction.amount ?? suggestion.bookingCandidate?.grossAmount ?? 0)
  if (!amount) return ''
  const direction = transaction.direction || suggestion.bookingCandidate?.type
  return `${direction === 'OUT' ? '-' : '+'}${euro.format(Math.abs(amount))}`
}

function isRestrictiveBankImportPrompt(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return /(nur|ausschliesslich|lediglich|bestimmte|passende|zutun|bezug|mit .*tag|mit .*kategorie|getraenk|spende|mitgliedsbeitrag|miete|webhosting|kasse)/.test(
    normalized
  )
}

function extractBankSuggestionIdsFromAiText(text: string, availableIds: number[]) {
  const available = new Set(availableIds.map(Number))
  const ids = new Set<number>()
  for (const match of String(text || '').matchAll(
    /(?:bankbeleg|bankimport|transaktion|beleg)\s*#?\s*(\d+)/gi
  )) {
    const id = Number(match[1])
    if (available.has(id)) ids.add(id)
  }
  return Array.from(ids)
}

function bankSuggestionSearchText(suggestion: AiBankReviewSuggestion) {
  const transaction = suggestion.transaction || {}
  const candidate = (suggestion.bookingCandidate || {}) as Partial<
    NonNullable<AiBankReviewSuggestion['bookingCandidate']>
  >
  return normalizeLookup(
    [
      suggestion.transactionId,
      transaction.bookingDate,
      transaction.valueDate,
      transaction.counterparty,
      transaction.purpose,
      transaction.reference,
      transaction.amount,
      candidate.date,
      candidate.description,
      candidate.counterparty,
      candidate.grossAmount,
      (candidate.tags || []).join(' '),
      suggestion.reason,
      (suggestion.warnings || []).join(' ')
    ]
      .filter(Boolean)
      .join(' ')
  )
}

function bankSuggestionScoreFromText(suggestion: AiBankReviewSuggestion, text: string) {
  const haystack = bankSuggestionSearchText(suggestion)
  const normalizedText = normalizeLookup(text)
  let score = 0
  const transaction = suggestion.transaction || {}
  const candidate = (suggestion.bookingCandidate || {}) as Partial<
    NonNullable<AiBankReviewSuggestion['bookingCandidate']>
  >
  const important = [
    transaction.counterparty,
    transaction.purpose,
    transaction.reference,
    candidate.description,
    candidate.counterparty,
    ...(candidate.tags || [])
  ]
    .filter(Boolean)
    .map((value) => normalizeLookup(value))
  for (const token of important) {
    if (token && token.length >= 4 && normalizedText.includes(token))
      score += Math.min(80, token.length * 4)
  }
  const words = normalizedText.split(/\s+/).filter((word) => word.length >= 4)
  for (const word of words) {
    if (haystack.includes(word)) score += 6
  }
  const amount = Number(transaction.amount ?? candidate.grossAmount ?? 0)
  if (amount && normalizedText.includes(String(Math.abs(amount)).replace('.', ' '))) score += 20
  return score
}

function extractBankSuggestionsFromAiText(result: TAiBankImportReviewOutput, text: string) {
  const allSuggestions = (result.suggestions || []) as AiBankReviewSuggestion[]
  const ids = extractBankSuggestionIdsFromAiText(
    text,
    allSuggestions.map((suggestion) => suggestion.transactionId)
  )
  if (ids.length)
    return allSuggestions.filter((suggestion) => ids.includes(Number(suggestion.transactionId)))
  const scored = allSuggestions
    .map((suggestion) => ({ suggestion, score: bankSuggestionScoreFromText(suggestion, text) }))
    .filter((item) => item.score >= 18)
    .sort((a, b) => b.score - a.score)
  if (!scored.length) return []
  const bestScore = scored[0].score
  return scored
    .filter((item) => item.score >= Math.max(18, bestScore - 12))
    .map((item) => item.suggestion)
}

function filterBankReviewByAiText(
  result: TAiBankImportReviewOutput,
  userPrompt: string,
  aiText: string
): AiBankReviewState {
  const allSuggestions = (result.suggestions || []) as AiBankReviewSuggestion[]
  if (!isRestrictiveBankImportPrompt(userPrompt)) {
    return {
      ...(result as AiBankReviewState),
      suggestions: allSuggestions,
      allSuggestions,
      sourceTotal: allSuggestions.length
    }
  }
  const matched = extractBankSuggestionsFromAiText(result, aiText)
  const normalizedAiText = normalizeLookup(aiText)
  const saysNone = /(keine|kein|keinen).{0,80}(passend|relevant|treffer|bezug|vorschlag)/.test(
    normalizedAiText
  )
  const visible = matched.length ? matched : saysNone ? [] : allSuggestions
  return {
    ...(result as AiBankReviewState),
    suggestions: visible,
    allSuggestions,
    sourceTotal: allSuggestions.length,
    filterSummary:
      visible.length === allSuggestions.length
        ? null
        : `${visible.length} von ${allSuggestions.length} KI-Vorschlägen für diese Anfrage ausgewählt.`
  }
}

function CandidateEditor({
  job,
  candidate,
  candidateIndex,
  onChange,
  onApprove,
  onOpenDraft,
  paymentAccounts,
  busy
}: {
  job: TAiJobsGetOutput
  candidate: TAiBookingCandidate
  candidateIndex: number
  onChange: (candidate: TAiBookingCandidate) => void
  onApprove: () => void
  onOpenDraft: () => void
  paymentAccounts: PaymentAccountOption[]
  busy: boolean
}) {
  const sourceFile = candidate.source?.fileName
    ? job.files.find((file) => file.fileName === candidate.source?.fileName) || job.files?.[0]
    : job.files?.[0]
  const previewSrc = sourceFile?.dataBase64
    ? `data:${sourceFile.mimeType || 'application/octet-stream'};base64,${sourceFile.dataBase64}`
    : ''
  const isImage = String(sourceFile?.mimeType || '').startsWith('image/')
  const activePaymentAccounts = paymentAccounts.filter((account) => account.isActive !== 0)
  const accountById = new Map(activePaymentAccounts.map((account) => [account.id, account]))
  const isApproved = isCandidateApproved(candidate, job)
  const sourceLabel = candidateSourceLabel(candidate)

  const update = <K extends keyof TAiBookingCandidate>(key: K, value: TAiBookingCandidate[K]) => {
    onChange({ ...candidate, [key]: value })
  }

  const updatePaymentAccount = (value: string) => {
    const nextId = value ? Number(value) : null
    const account = nextId ? accountById.get(nextId) : undefined
    onChange({
      ...candidate,
      paymentAccountId: nextId || null,
      paymentMethod: account ? paymentMethodForAccount(account.kind) || null : null
    })
  }

  return (
    <div className="ai-review-grid">
      <section className="ai-preview-panel">
        <div className="ai-section-head">
          <strong>Quelle</strong>
          <span>{sourceLabel ? 'Aktive Quelle' : `${job.files.length} Datei(en)`}</span>
        </div>
        {sourceLabel ? (
          <p className="helper ai-source-callout">
            Dieser Vorschlag stammt aus <strong>{sourceLabel}</strong>.
          </p>
        ) : null}
        {isImage && previewSrc ? (
          <img className="ai-file-preview" src={previewSrc} alt={sourceFile?.fileName || 'Beleg'} />
        ) : (
          <div className="ai-file-list">
            {job.files.map((file) => (
              <div
                key={file.id}
                className={`ai-file-row ${file.fileName === candidate.source?.fileName ? 'is-source' : ''}`}
              >
                <strong>
                  {file.fileName}
                  {file.fileName === candidate.source?.fileName ? (
                    <span className="ai-file-source-badge">Aktive Quelle</span>
                  ) : null}
                </strong>
                <span>
                  {file.mimeType || 'Datei'} · {Math.round(file.size / 1024)} KB
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ai-candidate-panel">
        <div className="ai-section-head">
          <strong>Vorschlag {candidateIndex + 1}</strong>
          <span>{candidateSourceStateLabel(candidate, job)}</span>
        </div>
        <div className="ai-form-grid">
          <label className="field">
            <span>Datum</span>
            <input
              className="input"
              type="date"
              disabled={isApproved}
              value={candidate.date || ''}
              onChange={(event) => update('date', event.target.value)}
            />
          </label>
          <label className="field">
            <span>Art</span>
            <select
              className="input"
              disabled={isApproved}
              value={candidate.type}
              onChange={(event) =>
                update('type', event.target.value as TAiBookingCandidate['type'])
              }
            >
              <option value="OUT">Ausgabe</option>
              <option value="IN">Einnahme</option>
            </select>
          </label>
          <label className="field">
            <span>Sphäre</span>
            <select
              className="input"
              disabled={isApproved}
              value={candidate.sphere}
              onChange={(event) =>
                update('sphere', event.target.value as TAiBookingCandidate['sphere'])
              }
            >
              <option value="IDEELL">IDEELL</option>
              <option value="ZWECK">ZWECK</option>
              <option value="VERMOEGEN">VERMÖGEN</option>
              <option value="WGB">WGB</option>
            </select>
          </label>
          <label className="field">
            <span>Betrag</span>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              disabled={isApproved}
              value={candidate.grossAmount || 0}
              onChange={(event) => update('grossAmount', Number(event.target.value || 0))}
            />
          </label>
          <label className="field">
            <span>MwSt %</span>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              disabled={isApproved}
              value={candidate.vatRate || 0}
              onChange={(event) => update('vatRate', Number(event.target.value || 0))}
            />
          </label>
          <label className="field ai-field-wide">
            <span>Zahlungskonto</span>
            <select
              className="input"
              disabled={isApproved}
              value={candidate.paymentAccountId ? String(candidate.paymentAccountId) : ''}
              style={{
                color: accountById.get(Number(candidate.paymentAccountId || 0))?.color || undefined
              }}
              onChange={(event) => updatePaymentAccount(event.target.value)}
            >
              <option value="">Kein Konto ausgewählt</option>
              {activePaymentAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.kind}
                </option>
              ))}
            </select>
          </label>
          <label className="field ai-field-wide">
            <span>Beschreibung</span>
            <input
              className="input"
              disabled={isApproved}
              value={candidate.description || ''}
              onChange={(event) => update('description', event.target.value)}
            />
          </label>
          <label className="field ai-field-wide">
            <span>Tags</span>
            <input
              className="input"
              disabled={isApproved}
              value={(candidate.tags || []).join(', ')}
              onChange={(event) =>
                update(
                  'tags',
                  event.target.value
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                )
              }
            />
          </label>
        </div>

        {candidate.warnings?.length || candidate.evidence?.length ? (
          <div className="ai-evidence">
            {candidate.warnings?.map((warning, idx) => (
              <span key={`w-${idx}`} className={warningClassName(warning)}>
                {warning}
              </span>
            ))}
            {candidate.evidence?.map((item, idx) => (
              <span key={`e-${idx}`}>{item}</span>
            ))}
          </div>
        ) : null}

        <footer className="ai-review-actions">
          <span className="ai-amount-preview">
            {candidate.type === 'OUT' ? '-' : '+'}
            {euro.format(Number(candidate.grossAmount || 0))}
          </span>
          <button className="btn" disabled={busy || isApproved} onClick={onOpenDraft}>
            {isApproved ? 'Bereits gebucht' : 'Buchungsentwurf'}
          </button>
          <button className="btn primary" disabled={busy || isApproved} onClick={onApprove}>
            {isApproved
              ? `Gebucht${candidate.review?.voucherNo ? ` · ${candidate.review.voucherNo}` : ''}`
              : busy
                ? 'Buche...'
                : 'Jetzt buchen'}
          </button>
        </footer>
      </section>
    </div>
  )
}

export default function AIView({ notify, onBooked, onBusyChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null)
  const historyButtonRef = useRef<HTMLButtonElement | null>(null)
  const agentContextButtonRef = useRef<HTMLButtonElement | null>(null)
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null)
  const historyDrawerRef = useRef<HTMLElement | null>(null)
  const agentContextDrawerRef = useRef<HTMLElement | null>(null)
  const settingsDrawerRef = useRef<HTMLElement | null>(null)
  const dragDepthRef = useRef(0)
  const [initialChat] = useState(readAiChatSnapshot)
  const [settings, setSettings] = useState<TAiSettingsGetOutput>(DEFAULT_AI_SETTINGS)
  const [apiKey, setApiKey] = useState('')
  const [connectionTest, setConnectionTest] = useState<Awaited<
    ReturnType<typeof window.api.ai.settings.testConnection>
  > | null>(null)
  const [jobs, setJobs] = useState<TAiJobsListOutput['rows']>([])
  const [selectedJob, setSelectedJob] = useState<TAiJobsGetOutput | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<number | null>(
    initialChat.selectedJobId || null
  )
  const [selectedCandidate, setSelectedCandidate] = useState(initialChat.selectedCandidate || 0)
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccountOption[]>([])
  const [mentionOptions, setMentionOptions] = useState<AiMentionOption[]>(STATIC_AI_MENTIONS)
  const [promptCursor, setPromptCursor] = useState(0)
  const [files, setFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<AiAttachmentPreview[]>([])
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<AiMessage[]>(initialChat.messages || [])
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
  const [pendingContributionLinks, setPendingContributionLinks] =
    useState<AiContributionLinkState | null>(initialChat.pendingContributionLinks || null)
  const [pendingTagActions, setPendingTagActions] = useState<AiTagActionState | null>(
    initialChat.pendingTagActions || null
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
  const [agentMemory, setAgentMemory] = useState<TAiAgentMemoryListOutput['rows']>([])
  const [agentAutoRules, setAgentAutoRules] = useState<TAiAgentAutoRulesListOutput['rows']>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showAgentContext, setShowAgentContext] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const [avatarFrame, setAvatarFrame] = useState<AiAvatarFrame>('default')
  const [assistantReactionUntil, setAssistantReactionUntil] = useState(0)
  const lastAssistantMessageIdRef = useRef<string | null>(null)
  const streamingMessageTimersRef = useRef<Record<string, number>>({})

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  useEffect(
    () => () => {
      Object.values(streamingMessageTimersRef.current).forEach((timer) =>
        window.clearTimeout(timer)
      )
      streamingMessageTimersRef.current = {}
    },
    []
  )

  const streamAssistantMessage = useCallback((id: string, fullBody: string, initialLength = 0) => {
    if (streamingMessageTimersRef.current[id]) return
    const charsPerTick = Math.max(1, Math.ceil(fullBody.length / AI_MESSAGE_STREAM_TARGET_TICKS))
    let streamedLength = Math.min(fullBody.length, initialLength)
    const step = () => {
      streamedLength = Math.min(fullBody.length, streamedLength + charsPerTick)
      setMessages((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                displayBody: fullBody.slice(0, streamedLength),
                isStreaming: streamedLength < fullBody.length
              }
            : item
        )
      )

      if (streamedLength < fullBody.length) {
        const timer = window.setTimeout(step, AI_MESSAGE_STREAM_TICK_MS)
        streamingMessageTimersRef.current[id] = timer
      } else {
        delete streamingMessageTimersRef.current[id]
      }
    }

    const timer = window.setTimeout(step, AI_MESSAGE_STREAM_TICK_MS)
    streamingMessageTimersRef.current[id] = timer
  }, [])

  useEffect(() => {
    messages.forEach((message) => {
      if (message.role !== 'assistant' || !message.isStreaming || !message.body) return
      streamAssistantMessage(message.id, message.body, message.displayBody?.length || 0)
    })
  }, [messages, streamAssistantMessage])

  const pushMessage = (message: Omit<AiMessage, 'id' | 'displayBody' | 'isStreaming'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const hasAssistantBody = message.role === 'assistant' && Boolean(message.body)
    setMessages((current) => [
      ...current,
      {
        ...message,
        id,
        displayBody: hasAssistantBody ? '' : message.body,
        isStreaming: hasAssistantBody
      }
    ])

    if (!hasAssistantBody) return

    streamAssistantMessage(id, message.body)
  }

  const hasOpenReviewWorkflow = () =>
    !!selectedJob ||
    !!bankReview ||
    (!!pendingMembers && pendingMembers.status !== 'CREATED') ||
    (!!pendingMemberUpdates && pendingMemberUpdates.status !== 'APPLIED') ||
    (!!pendingContributionPayment && pendingContributionPayment.status !== 'CREATED') ||
    (!!pendingContributionLinks && pendingContributionLinks.status !== 'APPLIED') ||
    (!!pendingTagActions && pendingTagActions.status !== 'APPLIED') ||
    (!!pendingVoucherTagActions && pendingVoucherTagActions.status !== 'APPLIED') ||
    (!!pendingVoucherUpdates && pendingVoucherUpdates.status !== 'APPLIED') ||
    (!!pendingVoucherReverse && pendingVoucherReverse.status !== 'APPLIED') ||
    (!!pendingVoucherRebook && pendingVoucherRebook.status !== 'APPLIED') ||
    (!!pendingBankLinks && pendingBankLinks.status !== 'APPLIED') ||
    (!!pendingInvoiceActions && pendingInvoiceActions.status !== 'APPLIED') ||
    (!!pendingBudgetActions && pendingBudgetActions.status !== 'APPLIED') ||
    (!!pendingEarmarkActions && pendingEarmarkActions.status !== 'APPLIED') ||
    (!!pendingPlannerQuestion && pendingPlannerQuestion.status === 'OPEN')

  const prepareAgentDraft = (draft: TAiAgentRunOutput['drafts'][number], userPrompt: string) => {
    const payload = draft.payload as any
    const autoMeta = draft.autoApproval
      ? ` · Auto-Regel: ${draft.autoApproval.ruleNames.join(', ')}`
      : ''
    if (draft.kind === 'voucherReverse') {
      const vouchers = payload?.vouchers || []
      if (!vouchers.length) return
      setPendingVoucherReverse({
        vouchers,
        reason: payload?.reason || draft.title,
        sourcePrompt: userPrompt,
        status: 'DRAFT'
      })
      pushMessage({
        role: 'assistant',
        title: 'Storno-Review vorbereitet',
        body: `${vouchers.length} Buchung(en) wurden zum Stornieren vorbereitet. Bitte prüfe die Storno-Vorschau unten.`,
        meta: `Agent-Review${autoMeta}`
      })
      return
    }
    if (draft.kind === 'voucherRebook') {
      if (!payload?.original || !payload?.replacement) return
      setPendingVoucherRebook({
        original: payload.original,
        replacement: payload.replacement,
        reason: payload.reason || draft.title,
        sourcePrompt: userPrompt,
        status: 'DRAFT'
      })
      pushMessage({
        role: 'assistant',
        title: 'Storno & Ersatzbuchung vorbereitet',
        body: `Ich habe einen Review vorbereitet: Beleg ${payload.original.voucherNo || `#${payload.original.id}`} wird storniert und als ${payload.replacement.type} neu angelegt.`,
        meta: `Agent-Review${autoMeta}`
      })
      return
    }
    if (draft.kind === 'bankLink') {
      const changes = (payload?.changes || []) as AiBankLinkChange[]
      if (!changes.length) return
      setPendingBankLinks({
        changes: changes.map((change) => ({ ...change, selected: change.selected !== false })),
        reason: payload?.reason || draft.title,
        warnings: payload?.warnings || [],
        sourcePrompt: userPrompt,
        status: 'DRAFT'
      })
      pushMessage({
        role: 'assistant',
        title: 'Bankbeleg-Verknüpfung vorbereitet',
        body: `${changes.length} Bankbeleg(e) werden mit bestehenden Buchungen verknüpft. Es wird nichts storniert und keine Ersatzbuchung angelegt.`,
        meta: `Agent-Review${autoMeta}`
      })
      return
    }
    if (draft.kind === 'voucherUpdate') {
      const changes = (payload?.changes || []) as AiVoucherUpdateChange[]
      if (!changes.length) return
      setPendingVoucherUpdates({
        changes: changes.map((change) => ({ ...change, selected: change.selected !== false })),
        reason: payload?.reason || draft.title,
        sourcePrompt: userPrompt,
        status: 'DRAFT'
      })
      pushMessage({
        role: 'assistant',
        title: 'Buchungsänderungen vorbereitet',
        body: `${changes.length} Änderung(en) wurden als Review vorbereitet. Bitte prüfe die Vorschau unten und übernimm sie erst danach.`,
        meta: `Agent-Review${autoMeta}`
      })
      return
    }
    if (draft.kind === 'memberUpdate') {
      const changes = (payload?.changes || []) as AiMemberUpdateChange[]
      if (!changes.length) return
      setPendingMemberUpdates({
        changes: changes.map((change) => ({ ...change, selected: change.selected !== false })),
        sourcePrompt: userPrompt,
        status: 'DRAFT'
      })
      pushMessage({
        role: 'assistant',
        title: 'Mitgliederänderungen vorbereitet',
        body: `${changes.length} Mitgliederänderung(en) wurden als Review vorbereitet.`,
        meta: `Agent-Review${autoMeta}`
      })
      return
    }
    if (draft.kind === 'contributionPaymentLink') {
      const changes = (payload?.changes || []) as AiContributionLinkChange[]
      if (!changes.length) return
      setPendingContributionLinks({
        changes: changes.map((change) => ({
          ...change,
          selected: change.selected !== false,
          warnings: change.warnings || []
        })),
        reason: payload?.reason || draft.title,
        sourcePrompt: userPrompt,
        status: 'DRAFT'
      })
      pushMessage({
        role: 'assistant',
        title: 'Beitrags-Verknüpfung vorbereitet',
        body: `${changes.length} vorhandene Buchung(en) wurden zur Verknüpfung mit Mitgliedsbeiträgen vorbereitet. Bitte prüfe die Vorschau unten.`,
        meta: `Agent-Review${autoMeta}`
      })
      return
    }
    if (draft.kind === 'invoiceAction') {
      const rawChanges = Array.isArray(payload?.changes)
        ? payload.changes
        : payload?.invoice
          ? [{ action: payload.action || 'CREATE', invoice: payload.invoice }]
          : []
      const changes: AiInvoiceActionChange[] = rawChanges
        .filter((change: any) => change?.action === 'CREATE' && change?.invoice)
        .map((change: any, index: number) => ({
          id: change.id || `invoice-action-${Date.now()}-${index}`,
          action: 'CREATE',
          invoice: change.invoice as TInvoiceCreateInput,
          selected: change.selected !== false
        }))
      if (!changes.length) return
      setPendingInvoiceActions({
        changes,
        reason: payload?.reason || draft.title,
        sourcePrompt: userPrompt,
        status: 'DRAFT'
      })
      pushMessage({
        role: 'assistant',
        title: 'Forderung/Verbindlichkeit vorbereitet',
        body: `${changes.length} offene(r) Posten wurde als Review vorbereitet. Bitte prüfe die Vorschau unten.`,
        meta: `Agent-Review${autoMeta}`
      })
      return
    }
    if (draft.kind === 'tagChange') {
      const changes = (payload?.changes || []) as AiTagActionChange[]
      if (!changes.length) return
      setPendingTagActions({
        changes: changes.map((change) => ({ ...change, selected: change.selected !== false })),
        sourcePrompt: userPrompt,
        status: 'DRAFT'
      })
      pushMessage({
        role: 'assistant',
        title: 'Tag-Änderungen vorbereitet',
        body: `${changes.length} Tag-Änderung(en) wurden als Review vorbereitet.`,
        meta: `Agent-Review${autoMeta}`
      })
      return
    }
    if (draft.kind === 'budgetChange') {
      const changes = (payload?.changes || []) as AiBudgetActionChange[]
      if (!changes.length) return
      setPendingBudgetActions({
        changes: changes.map((change) => ({ ...change, selected: change.selected !== false })),
        reason: payload?.reason || draft.title,
        sourcePrompt: userPrompt,
        status: 'DRAFT'
      })
      pushMessage({
        role: 'assistant',
        title: 'Budget-Änderungen vorbereitet',
        body: `${changes.length} Budget-Änderung(en) wurden als Review vorbereitet. Bitte prüfe die Vorschau unten.`,
        meta: `Agent-Review${autoMeta}`
      })
      return
    }
    if (draft.kind === 'earmarkChange') {
      const changes = (payload?.changes || []) as AiEarmarkActionChange[]
      if (!changes.length) return
      setPendingEarmarkActions({
        changes: changes.map((change) => ({ ...change, selected: change.selected !== false })),
        reason: payload?.reason || draft.title,
        sourcePrompt: userPrompt,
        status: 'DRAFT'
      })
      pushMessage({
        role: 'assistant',
        title: 'Zweckbindungs-Änderungen vorbereitet',
        body: `${changes.length} Zweckbindungs-Änderung(en) wurden als Review vorbereitet. Bitte prüfe die Vorschau unten.`,
        meta: `Agent-Review${autoMeta}`
      })
      return
    }
    if (draft.kind === 'reportExport') {
      if (!payload?.filePath) return
      const isContentPdf = payload?.type === 'CONTENT'
      pushMessage({
        role: 'assistant',
        title: isContentPdf ? 'PDF erstellt' : 'Report exportiert',
        body: [
          `${draft.title} wurde erstellt.`,
          !isContentPdf && payload.rowCount != null
            ? `${payload.rowCount} Buchung(en) im Export.`
            : null,
          payload.filePath
        ]
          .filter(Boolean)
          .join('\n'),
        meta: 'Agent-Export',
        filePath: payload.filePath
      })
      return
    }
    pushMessage({
      role: 'assistant',
      title: 'Agent-Draft vorbereitet',
      body: `Der Agent hat einen ${draft.kind}-Draft vorbereitet: ${draft.title}. Für diese Draft-Art fehlt noch eine spezialisierte Review-Karte.`,
      meta: `Agent-Review${autoMeta}`
    })
  }

  const loadAgentKnowledge = useCallback(async () => {
    try {
      const [memory, rules] = await Promise.all([
        window.api.ai.agent.memory.list({ activeOnly: true, limit: 80 }),
        window.api.ai.agent.autoRules.list({ enabledOnly: true, limit: 80 })
      ])
      setAgentMemory(memory.rows || [])
      setAgentAutoRules(rules.rows || [])
    } catch {
      setAgentMemory([])
      setAgentAutoRules([])
    }
  }, [])

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
    pendingContributionLinks,
    pendingEarmarkActions,
    pendingInvoiceActions,
    pendingMembers,
    pendingMemberUpdates,
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

  const { agentSessionId, resetAgentSession, shouldUseAgentRuntime, runAgentRuntime } =
    useAiAgentWorkflow({
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

  const loadSettings = useCallback(async () => {
    try {
      const next = await window.api.ai.settings.get()
      setSettings(normalizeAiSettings(next))
    } catch (error: any) {
      notify('error', error?.message || String(error))
    }
  }, [notify])

  const loadJobs = useCallback(async () => {
    try {
      const result = await window.api.ai.jobs.list({ limit: 100 })
      setJobs(result.rows)
    } catch (error: any) {
      notify('error', error?.message || String(error))
    }
  }, [notify])

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
      const dynamic: AiMentionOption[] = [
        ...(tags.rows || []).slice(0, 80).map((tag: TagRow) => ({
          id: `tag-${tag.id}`,
          label: tag.name,
          insert: `Tag:${tag.name}`,
          scope: 'Tag' as const,
          description: tag.usage != null ? `${tag.usage} Nutzung(en)` : 'VereinO-Tag',
          plannerHint: `Tag "${tag.name}" gezielt als Filter oder Änderung verwenden.`
        })),
        ...(budgets.rows || []).slice(0, 80).map((budget: any) => {
          const label =
            budget.categoryName || budget.projectName || budget.name || `Budget ${budget.id}`
          return {
            id: `budget-${budget.id}`,
            label,
            insert: `Budget:${label}`,
            scope: 'Kategorie' as const,
            description: budget.archived ? 'Archiviertes Budget/Kategorie' : 'Budget/Kategorie',
            plannerHint: `Budget/Kategorie "${label}" gezielt verwenden.`
          }
        }),
        ...(bindings.rows || []).slice(0, 80).map((binding: any) => ({
          id: `binding-${binding.id}`,
          label: binding.code ? `${binding.code} · ${binding.name}` : binding.name,
          insert: `Zweck:${binding.code || binding.name}`,
          scope: 'Zweckbindung' as const,
          description: binding.isActive ? 'Aktive Zweckbindung' : 'Inaktive Zweckbindung',
          plannerHint: `Zweckbindung "${binding.code || binding.name}" gezielt verwenden.`
        })),
        ...(accounts.rows || []).slice(0, 40).map((account: PaymentAccountOption) => ({
          id: `account-${account.id}`,
          label: account.name,
          insert: `Konto:${account.name}`,
          scope: 'Zahlungskonto' as const,
          description: account.kind,
          plannerHint: `Zahlungskonto "${account.name}" mit paymentAccountId ${account.id} gezielt verwenden.`
        }))
      ]
      setMentionOptions([...STATIC_AI_MENTIONS, ...dynamic])
    } catch {
      setMentionOptions(STATIC_AI_MENTIONS)
    }
  }, [])

  const selectJob = useCallback((job: TAiJobsGetOutput | null, candidateIndex?: number) => {
    setSelectedJob(job)
    setSelectedJobId(job?.id || null)
    if (candidateIndex !== undefined) setSelectedCandidate(candidateIndex)
    else if (job) setSelectedCandidate(firstOpenCandidateIndex(job))
    else setSelectedCandidate(0)
  }, [])

  const appendFiles = useCallback(
    (incoming: FileList | File[] | null) => {
      const nextFiles = Array.from(incoming || [])
      if (!nextFiles.length) return
      const accepted = nextFiles.filter(isAiAttachmentFile)
      const skipped = nextFiles.length - accepted.length
      if (skipped > 0) {
        notify(
          'info',
          `${skipped} Datei(en) wurden übersprungen. Erlaubt sind PDF, PNG, JPG, XLSX, XLS, CSV und TSV.`
        )
      }
      if (!accepted.length) return
      setFiles((current) => {
        const existingKeys = new Set(current.map(filePreviewKey))
        const additions = accepted.filter((file) => !existingKeys.has(filePreviewKey(file)))
        return additions.length ? [...current, ...additions] : current
      })
    },
    [notify]
  )

  const handleComposerDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.types?.includes('Files')) return
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDraggingFiles(true)
  }, [])

  const handleComposerDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.types?.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDraggingFiles(true)
  }, [])

  const handleComposerDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.types?.includes('Files')) return
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDraggingFiles(false)
  }, [])

  const handleComposerDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer?.files?.length) return
      event.preventDefault()
      dragDepthRef.current = 0
      setIsDraggingFiles(false)
      appendFiles(event.dataTransfer.files)
    },
    [appendFiles]
  )

  useEffect(() => {
    void loadSettings()
    void loadJobs()
    void loadPaymentAccounts()
    void loadMentionOptions()
    void loadAgentKnowledge()
  }, [loadAgentKnowledge, loadJobs, loadMentionOptions, loadPaymentAccounts, loadSettings])

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
    if (!showHistory && !showAgentContext && !showSettings) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      const inHistory =
        !!historyDrawerRef.current?.contains(target) || !!historyButtonRef.current?.contains(target)
      const inAgentContext =
        !!agentContextDrawerRef.current?.contains(target) ||
        !!agentContextButtonRef.current?.contains(target)
      const inSettings =
        !!settingsDrawerRef.current?.contains(target) ||
        !!settingsButtonRef.current?.contains(target)
      if (showHistory && !inHistory) setShowHistory(false)
      if (showAgentContext && !inAgentContext) setShowAgentContext(false)
      if (showSettings && !inSettings) setShowSettings(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowHistory(false)
        setShowAgentContext(false)
        setShowSettings(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showAgentContext, showHistory, showSettings])

  useEffect(() => {
    if (messages.some((message) => message.isStreaming)) return
    writeAiChatSnapshot({
      messages,
      agentSessionId,
      selectedJobId,
      selectedCandidate,
      bankReview,
      pendingMembers,
      pendingMemberUpdates,
      pendingContributionPayment,
      pendingContributionLinks,
      pendingTagActions,
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
    })
  }, [
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
    pendingPlannerQuestion,
    pendingTagActions,
    pendingVoucherRebook,
    pendingVoucherReverse,
    pendingVoucherTagActions,
    pendingVoucherUpdates,
    selectedCandidate,
    selectedJobId
  ])

  useEffect(() => {
    const previews = files.map((file) => ({
      key: filePreviewKey(file),
      name: file.name,
      url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      badge: attachmentBadge(file)
    }))
    setFilePreviews(previews)
    return () => {
      previews.forEach((preview) => {
        if (preview.url) URL.revokeObjectURL(preview.url)
      })
    }
  }, [files])

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
  const bankSuggestionGroups = useMemo(() => {
    const suggestions = bankReview?.suggestions || []
    return {
      matches: suggestions.filter(
        (suggestion) => !suggestion.resolved && suggestion.action === 'LINK_EXISTING'
      ),
      create: suggestions.filter(
        (suggestion) => !suggestion.resolved && suggestion.action === 'CREATE_BOOKING'
      ),
      manual: suggestions.filter(
        (suggestion) =>
          !suggestion.resolved &&
          (suggestion.action === 'NEEDS_MANUAL_REVIEW' || suggestion.action === 'MARK_CHECKED')
      ),
      done: suggestions.filter((suggestion) => !!suggestion.resolved)
    }
  }, [bankReview])
  const agentReviewQueueItems = useMemo<AgentReviewQueueItem[]>(() => {
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
  }, [
    analysis,
    bankReview,
    pendingBankLinks,
    pendingBudgetActions,
    pendingContributionPayment,
    pendingContributionLinks,
    pendingEarmarkActions,
    pendingInvoiceActions,
    pendingMembers,
    pendingMemberUpdates,
    pendingPlannerQuestion,
    pendingTagActions,
    pendingVoucherRebook,
    pendingVoucherReverse,
    pendingVoucherTagActions,
    pendingVoucherUpdates,
    selectedJob
  ])
  const activeMention = useMemo(
    () => activeMentionTrigger(prompt, promptCursor),
    [prompt, promptCursor]
  )
  const visibleMentions = useMemo(() => {
    if (!activeMention) return []
    const query = normalizeLookup(activeMention.query)
    return mentionOptions
      .filter((option) => {
        if (!query) return true
        return normalizeLookup(`${option.label} ${option.insert} ${option.scope}`).includes(query)
      })
      .slice(0, 9)
  }, [activeMention, mentionOptions])
  const chatStarted =
    messages.length > 0 ||
    !!selectedJob ||
    !!bankReview ||
    !!pendingMembers ||
    !!pendingMemberUpdates ||
    !!pendingContributionPayment ||
    !!pendingContributionLinks ||
    !!pendingTagActions ||
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
  const latestMessage = messages.at(-1) || null

  useEffect(() => {
    if (!latestMessage || latestMessage.role !== 'assistant') return
    if (lastAssistantMessageIdRef.current === latestMessage.id) return
    lastAssistantMessageIdRef.current = latestMessage.id
    setAssistantReactionUntil(Date.now() + 2200)
  }, [latestMessage])

  useEffect(() => {
    let blinkTimeoutId: number | null = null
    let reactionTimeoutId: number | null = null
    const isAssistantReacting = assistantReactionUntil > Date.now()

    if (busy) {
      setAvatarFrame('thinking')
      return () => {
        if (reactionTimeoutId != null) window.clearTimeout(reactionTimeoutId)
      }
    }

    if (isAssistantReacting) {
      setAvatarFrame('success')

      reactionTimeoutId = window.setTimeout(
        () => {
          setAssistantReactionUntil(0)
        },
        Math.max(0, assistantReactionUntil - Date.now())
      )

      return () => {
        if (reactionTimeoutId != null) window.clearTimeout(reactionTimeoutId)
      }
    }

    const restingFrame: AiAvatarFrame = isComposingPrompt
      ? 'thinking'
      : hasPlannerQuestionOpen || hasPendingReview
        ? 'smirk'
        : 'default'
    setAvatarFrame(restingFrame)

    const blinkIntervalId = window.setInterval(
      () => {
        setAvatarFrame('blink')
        blinkTimeoutId = window.setTimeout(() => {
          setAvatarFrame(restingFrame)
        }, 160)
      },
      hasPlannerQuestionOpen ? 3200 : chatStarted ? 4200 : 5200
    )

    return () => {
      window.clearInterval(blinkIntervalId)
      if (blinkTimeoutId != null) window.clearTimeout(blinkTimeoutId)
      if (reactionTimeoutId != null) window.clearTimeout(reactionTimeoutId)
    }
  }, [
    assistantReactionUntil,
    busy,
    chatStarted,
    hasPendingReview,
    hasPlannerQuestionOpen,
    isComposingPrompt
  ])

  const removeFile = (key: string) => {
    setFiles((current) => current.filter((file) => filePreviewKey(file) !== key))
  }

  const syncPromptCursor = () => {
    const element = promptInputRef.current
    if (element) setPromptCursor(element.selectionStart || 0)
  }

  const insertMention = (option: AiMentionOption) => {
    const trigger = activeMention || activeMentionTrigger(prompt, promptCursor)
    const token = mentionInsertToken(option)
    const start = trigger?.start ?? promptCursor
    const end = trigger?.end ?? promptCursor
    const nextPrompt = `${prompt.slice(0, start)}${token} ${prompt.slice(end)}`
    const nextCursor = start + token.length + 1
    setPrompt(nextPrompt)
    setPromptCursor(nextCursor)
    window.setTimeout(() => {
      promptInputRef.current?.focus()
      promptInputRef.current?.setSelectionRange(nextCursor, nextCursor)
    }, 0)
  }

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

  const buildConversationPrompt = (userPrompt: string) => {
    const aiContext = JSON.stringify(agentUiContext, null, 2)
    if (!messages.length && !chatStarted) return userPrompt
    const history = messages
      .slice(-8)
      .map((message) => {
        const speaker = message.role === 'user' ? 'Nutzer' : 'VereinO KI'
        return `${speaker}${message.title ? ` (${message.title})` : ''}: ${message.body}`
      })
      .join('\n\n')
    return [
      'Dies ist eine Folgefrage in der VereinO-KI. Beziehe dich auf die bisherige Unterhaltung und bleibe im VereinO-Kontext.',
      '',
      'Bisherige Unterhaltung:',
      history || '-',
      '',
      'Aktueller VereinO-KI-Kontext aus der UI:',
      aiContext,
      '',
      'Aktuelle Nutzernachricht:',
      userPrompt,
      '',
      'Antworte konkret auf die aktuelle Nutzernachricht und führe gewünschte VereinO-Schritte als Review-Vorschlag aus, wenn möglich.'
    ].join('\n')
  }

  const startNewChat = () => {
    setMessages([])
    resetAgentSession()
    selectJob(null)
    setBankReview(null)
    setPendingMembers(null)
    setPendingMemberUpdates(null)
    setPendingContributionPayment(null)
    setPendingContributionLinks(null)
    setPendingTagActions(null)
    setPendingVoucherTagActions(null)
    setPendingVoucherUpdates(null)
    setPendingVoucherReverse(null)
    setPendingVoucherRebook(null)
    setPendingBankLinks(null)
    setPendingInvoiceActions(null)
    setPendingBudgetActions(null)
    setPendingEarmarkActions(null)
    setPendingPlannerQuestion(null)
    setAgentTrace([])
    setFiles([])
    setPrompt('')
    setShowHistory(false)
    setShowAgentContext(false)
    setShowSettings(false)
    clearAiChatSnapshot()
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

  const loadReportVouchers = async (from: string, to: string) => {
    const rows: VoucherRow[] = []
    let offset = 0
    const limit = 100
    while (true) {
      const result = await window.api.vouchers.list({
        from,
        to,
        limit,
        offset,
        sortBy: 'date',
        sort: 'ASC'
      })
      rows.push(...(result.rows || []))
      if ((result.rows || []).length < limit) break
      offset += limit
    }
    return rows
  }

  const buildReportKpiData = async (
    request: ReturnType<typeof parseReportExportRequest>,
    filePath: string
  ) => {
    const [summary, monthly, cashBalance, vouchers, tags, contributionData] = await Promise.all([
      window.api.reports.summary({ from: request.payload.from, to: request.payload.to }),
      window.api.reports.monthly({ from: request.payload.from, to: request.payload.to }),
      window.api.reports.cashBalance({ to: request.payload.to }),
      loadReportVouchers(request.payload.from, request.payload.to),
      loadTags(),
      buildContributionDueData()
    ])

    const incomeGross = Number(summary.byType.find((row) => row.key === 'IN')?.gross || 0)
    const expenseGross = Math.abs(
      Number(summary.byType.find((row) => row.key === 'OUT')?.gross || 0)
    )
    const resultGross = incomeGross - expenseGross
    const donationGross = vouchers
      .filter((voucher) => voucher.type === 'IN')
      .filter(
        (voucher) =>
          (voucher.tags || []).some((tag) => /spende/i.test(tag)) ||
          /spende|zuwendung|donation/i.test(voucher.description || '')
      )
      .reduce((sum, voucher) => sum + Math.abs(Number(voucher.grossAmount || 0)), 0)

    const expenseTagTotals = new Map<string, { tag: string; gross: number; count: number }>()
    vouchers
      .filter((voucher) => voucher.type === 'OUT')
      .forEach((voucher) => {
        const voucherTags = (voucher.tags || []).length ? voucher.tags || [] : ['Ohne Tag']
        voucherTags.forEach((tag) => {
          const current = expenseTagTotals.get(normalizeLookup(tag)) || { tag, gross: 0, count: 0 }
          current.gross += Math.abs(Number(voucher.grossAmount || 0))
          current.count += 1
          expenseTagTotals.set(normalizeLookup(tag), current)
        })
      })

    return {
      export: {
        filePath,
        label: request.label,
        payload: request.payload
      },
      period: {
        from: request.payload.from,
        to: request.payload.to
      },
      kpis: {
        incomeGross,
        expenseGross,
        resultGross,
        donationGross,
        donationShareOfIncome: incomeGross ? donationGross / incomeGross : null,
        voucherCount: vouchers.length,
        openContributionCount: contributionData.openContributions.length,
        openContributionAmount: contributionData.summary.openAmount
      },
      summary,
      monthly,
      cashBalance,
      paymentAccountBalances: cashBalance.accounts || summary.byPaymentAccount || [],
      topExpenseTags: Array.from(expenseTagTotals.values())
        .sort((a, b) => b.gross - a.gross)
        .slice(0, 5),
      openContributions: contributionData.openContributions,
      tags,
      sampleVouchers: vouchers.slice(0, 80)
    }
  }

  const processReportExport = async (userPrompt: string) => {
    const request = parseReportExportRequest(userPrompt)
    const result = await window.api.reports.export(request.payload)
    if (!result?.filePath) throw new Error('Report-Export wurde nicht erstellt.')
    if (settings.hasApiKey) {
      const reportData = await buildReportKpiData(request, result.filePath)
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
          ...(change.newTags ? { tags: change.newTags } : {})
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
          const linked = await window.api.bankTransactions.link({
            id: change.bankTransactionId,
            voucherId: change.voucherId
          })
          appliedIds.add(change.id)
          updateBankSuggestion(change.bankTransactionId, {
            resolved: 'LINKED',
            resolvedVoucherId: change.voucherId,
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
            : `${appliedIds.size} Bankbeleg(e) wurden mit bestehenden Buchungen verknüpft.`,
          meta: 'VereinO-Daten geändert'
        })
        dispatchDataChanged(['bank-imports', 'vouchers'])
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

  const hasRecentReportContext = () =>
    messages.slice(-8).some((message) => {
      const text = normalizeLookup(
        `${message.title || ''}\n${message.body || ''}\n${message.meta || ''}`
      )
      return /(report|bericht|controlling|reports export|jahresergebnis|kpi|kennzahl|pdf controllingbericht)/.test(
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

    if (
      (plan.entity === 'reports' && plan.operation === 'export') ||
      wantsReportExport(userPrompt) ||
      (hasRecentReportContext() && wantsReportFollowup(userPrompt))
    ) {
      await processReportExport(userPrompt)
      return true
    }

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
            notify(
              'error',
              'Bitte zuerst einen KI-API-Key in den KI-Einstellungen hinterlegen.'
            )
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
            notify(
              'error',
              'Bitte zuerst einen KI-API-Key in den KI-Einstellungen hinterlegen.'
            )
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
            notify(
              'error',
              'Bitte zuerst einen KI-API-Key in den KI-Einstellungen hinterlegen.'
            )
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
            notify(
              'error',
              'Bitte zuerst einen KI-API-Key in den KI-Einstellungen hinterlegen.'
            )
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
            notify(
              'error',
              'Bitte zuerst einen KI-API-Key in den KI-Einstellungen hinterlegen.'
            )
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
            notify(
              'error',
              'Bitte zuerst einen KI-API-Key in den KI-Einstellungen hinterlegen.'
            )
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
      } else if (files.length) {
        if (shouldProcessFilesAsBookingDocuments(userPrompt, files))
          await processDocuments(userPrompt)
        else await processFileTextTask(userPrompt)
      } else if (wantsBankImportReview(userPrompt)) {
        await processBankImport(userPrompt)
      } else {
        await processText(userPrompt)
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

  const saveSettings = async () => {
    setBusy(true)
    try {
      const next = await window.api.ai.settings.set({
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        model: settings.model,
        textModel: settings.textModel,
        defaultReasoningEffort: settings.defaultReasoningEffort,
        provider: settings.provider,
        proxyMode: settings.proxyMode,
        proxyUrl: settings.proxyUrl,
        proxyBypassRules: settings.proxyBypassRules
      })
      setSettings(
        normalizeAiSettings({
          hasApiKey: next.hasApiKey,
          model: next.model,
          textModel: next.textModel,
          defaultReasoningEffort: next.defaultReasoningEffort,
          provider: next.provider,
          apiBaseUrl: next.apiBaseUrl,
          proxyMode: next.proxyMode,
          proxyUrl: next.proxyUrl,
          proxyBypassRules: next.proxyBypassRules
        })
      )
      setApiKey('')
      notify('success', 'KI-Einstellungen gespeichert.')
    } catch (error: any) {
      notify('error', error?.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  const testConnection = async () => {
    setBusy(true)
    try {
      const res = await window.api.ai.settings.testConnection()
      setConnectionTest(res)
      if (res.ok) notify('success', 'KI-Verbindung funktioniert.')
      else notify('error', res.error || 'KI-Verbindung fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const providerConfig = getAiProviderConfig(settings.provider)
  const handleProviderChange = (provider: TAiSettingsGetOutput['provider']) => {
    const nextConfig = getAiProviderConfig(provider)
    const allowedModels = new Set<string>(nextConfig.modelOptions.map((option) => option.value))
    setSettings((current) => ({
      ...current,
      provider,
      apiBaseUrl: nextConfig.apiBaseUrl,
      model: allowedModels.has(current.model) ? current.model : nextConfig.defaultModel,
      textModel: allowedModels.has(current.textModel)
        ? current.textModel
        : nextConfig.defaultTextModel
    }))
  }

  const markHistoryJobDone = async (
    event: React.MouseEvent,
    job: TAiJobsListOutput['rows'][number]
  ) => {
    event.stopPropagation()
    setBusy(true)
    try {
      await window.api.ai.jobs.reject({
        id: job.id,
        reason: 'Im KI-Verlauf als erledigt markiert.'
      })
      if (selectedJob?.id === job.id) selectJob(null)
      await loadJobs()
      notify('success', 'Buchungsreview als erledigt markiert.')
    } catch (error: any) {
      notify('error', error?.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  const deleteHistoryJob = async (
    event: React.MouseEvent,
    job: TAiJobsListOutput['rows'][number]
  ) => {
    event.stopPropagation()
    setBusy(true)
    try {
      await window.api.ai.jobs.delete({ id: job.id })
      if (selectedJob?.id === job.id) selectJob(null)
      await loadJobs()
      notify('success', 'KI-Auftrag gelöscht.')
    } catch (error: any) {
      notify('error', error?.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  const renderHistoryJobButton = (
    job: TAiJobsListOutput['rows'][number],
    tone: 'open' | 'done' | 'task',
    metaItems?: Array<string | null | undefined>
  ) => {
    const fallbackTitle =
      job.type === 'BOOKING_FROM_DOCUMENTS'
        ? `Buchungsvorschlag #${job.id}`
        : `KI-Aufgabe #${job.id}`
    const defaultMeta = [
      job.type === 'BOOKING_FROM_DOCUMENTS' ? bookingProgress(job) : typeLabel(job.type),
      statusLabel(job.status),
      job.createdAt?.slice(0, 10),
      formatAiUsage(job.usage)
    ]
    const canResolve = tone === 'open' && job.type === 'BOOKING_FROM_DOCUMENTS'
    return (
      <article
        key={`${tone}-${job.id}`}
        className={`ai-history-item ai-history-item--${tone} ${selectedJob?.id === job.id ? 'active' : ''} ${canResolve ? 'ai-history-item--actionable' : ''}`}
      >
        <button
          className="ai-history-item-main"
          type="button"
          onClick={() => {
            void openJob(job.id)
            setShowHistory(false)
          }}
        >
          <span className="ai-history-item-icon" aria-hidden="true" />
          <span className="ai-history-item-copy">
            <strong>{job.title || fallbackTitle}</strong>
            <small>{(metaItems || defaultMeta).filter(Boolean).join(' · ')}</small>
          </span>
        </button>
        {canResolve && (
          <span className="ai-history-item-actions" aria-label="Buchungsreview Aktionen">
            <button
              type="button"
              className="ai-history-item-action ai-history-item-action--done"
              disabled={busy}
              onClick={(event) => void markHistoryJobDone(event, job)}
              aria-label="Buchungsreview als erledigt markieren"
              title="Als erledigt markieren"
            >
              ✓
            </button>
            <button
              type="button"
              className="ai-history-item-action ai-history-item-action--delete"
              disabled={busy}
              onClick={(event) => void deleteHistoryJob(event, job)}
              aria-label="Buchungsreview löschen"
              title="Löschen"
            >
              ×
            </button>
          </span>
        )}
      </article>
    )
  }

  const renderBankSuggestionActions = (suggestion: AiBankReviewSuggestion) => {
    if (suggestion.resolved) {
      return (
        <span className="ai-bank-resolved">
          {suggestion.resolvedVoucherNo ? `Erledigt · ${suggestion.resolvedVoucherNo}` : 'Erledigt'}
        </span>
      )
    }
    if (suggestion.action === 'LINK_EXISTING') {
      return (
        <button
          className="btn primary"
          type="button"
          disabled={busy || !suggestion.voucherId}
          onClick={() => void linkBankSuggestion(suggestion)}
        >
          Treffer verknüpfen
        </button>
      )
    }
    if (suggestion.action === 'CREATE_BOOKING') {
      return (
        <>
          <button
            className="btn"
            type="button"
            disabled={busy || !suggestion.bookingCandidate}
            onClick={() => openBankSuggestionBookingModal(suggestion)}
          >
            Im Modal prüfen
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={busy || !suggestion.bookingCandidate}
            onClick={() => void createBankSuggestionBooking(suggestion)}
          >
            Direkt buchen
          </button>
        </>
      )
    }
    if (suggestion.action === 'MARK_CHECKED') {
      return (
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={() => void checkBankSuggestion(suggestion)}
        >
          Als geprüft markieren
        </button>
      )
    }
    return (
      <span className="ai-bank-resolved ai-bank-resolved--muted">
        Bitte im Bankimport manuell prüfen
      </span>
    )
  }

  const renderBankSuggestion = (suggestion: AiBankReviewSuggestion) => {
    const transaction = suggestion.transaction || {}
    const voucherLabel =
      suggestion.voucherNo ||
      suggestion.resolvedVoucherNo ||
      (suggestion.voucherId ? `#${suggestion.voucherId}` : '')
    return (
      <article
        key={suggestion.transactionId}
        className={`ai-bank-suggestion ai-bank-suggestion--${bankSuggestionTone(suggestion)}`}
      >
        <div className="ai-bank-suggestion-main">
          <div className="ai-bank-suggestion-title">
            <span className="ai-bank-suggestion-badge">{bankSuggestionLabel(suggestion)}</span>
            <strong>Bankbeleg #{suggestion.transactionId}</strong>
            {bankSuggestionAmount(suggestion) && <em>{bankSuggestionAmount(suggestion)}</em>}
          </div>
          <p>{bankSuggestionTitle(suggestion)}</p>
          <small>
            {transaction.bookingDate || ''}
            {voucherLabel ? ` · Buchung ${voucherLabel}` : ''}
          </small>
        </div>
        <div className="ai-bank-suggestion-detail">
          <span>{suggestion.reason}</span>
          {suggestion.warnings?.length ? <small>{suggestion.warnings.join(' · ')}</small> : null}
        </div>
        <div className="ai-bank-suggestion-actions">{renderBankSuggestionActions(suggestion)}</div>
      </article>
    )
  }

  const renderBankSuggestionGroup = (
    title: string,
    subtitle: string,
    suggestions: AiBankReviewSuggestion[]
  ) => {
    if (!suggestions.length) return null
    return (
      <section className="ai-bank-group">
        <div className="ai-bank-group-head">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <div className="ai-bank-suggestion-list">{suggestions.map(renderBankSuggestion)}</div>
      </section>
    )
  }

  const renderComposer = (placement: 'initial' | 'followup') => (
    <section
      className={`card ai-composer-card ${placement === 'followup' ? 'ai-composer-card--followup' : ''}`}
    >
      {filePreviews.length > 0 && (
        <div className="ai-attachment-strip">
          {filePreviews.map((file) => (
            <span key={file.key} className="ai-attachment-preview">
              <button
                className="ai-attachment-remove"
                type="button"
                onClick={() => removeFile(file.key)}
                aria-label={`${file.name} entfernen`}
              >
                ×
              </button>
              {file.url ? (
                <img src={file.url} alt={file.name} />
              ) : (
                <i aria-hidden="true">{file.badge}</i>
              )}
              <strong>{file.name}</strong>
            </span>
          ))}
        </div>
      )}

      <div
        className={`ai-prompt-box ${busy ? 'is-busy' : ''} ${isDraggingFiles ? 'is-dragover' : ''}`}
        aria-busy={busy}
        onDragEnter={handleComposerDragEnter}
        onDragOver={handleComposerDragOver}
        onDragLeave={handleComposerDragLeave}
        onDrop={handleComposerDrop}
      >
        {!busy && (
          <button
            className="btn ai-icon-btn"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Anhänge hinzufügen"
          >
            +
          </button>
        )}
        <textarea
          ref={promptInputRef}
          className="input ai-prompt-input"
          value={prompt}
          disabled={busy}
          onChange={(event) => {
            setPrompt(event.target.value)
            setPromptCursor(event.target.selectionStart || 0)
          }}
          onClick={syncPromptCursor}
          onKeyUp={syncPromptCursor}
          onSelect={syncPromptCursor}
          placeholder={
            placement === 'followup'
              ? 'Nachfrage oder nächste Aufgabe...'
              : 'Was möchtest du erledigen?'
          }
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !(event.nativeEvent as any).isComposing
            ) {
              event.preventDefault()
              void submitPrompt()
            }
          }}
        />
        {!busy && visibleMentions.length > 0 && (
          <div className="ai-mention-menu">
            {visibleMentions.map((option) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMention(option)}
              >
                <span>{option.scope}</span>
                <strong>@{option.insert}</strong>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
        )}
        {!busy && isDraggingFiles && (
          <div className="ai-prompt-drop-hint" aria-hidden="true">
            Dateien hier ablegen, um sie an die Anfrage anzuhängen
          </div>
        )}
        <button
          className="btn primary ai-send-btn"
          type="button"
          disabled={busy || (!prompt.trim() && !files.length)}
          onClick={() => void submitPrompt()}
        >
          {busy ? <span className="ai-send-spinner" aria-hidden="true" /> : 'Senden'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.xlsx,.xls,.csv,.tsv,image/png,image/jpeg"
          hidden
          onChange={(event) => {
            appendFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </div>
    </section>
  )

  const renderAvatar = () => (
    <div
      className={`ai-header-avatar ${busy ? 'is-busy' : ''} ${hasPendingReview ? 'is-reviewing' : ''} ${avatarFrame === 'thinking' || avatarFrame === 'success' ? 'is-replacement-state' : ''}`}
      aria-hidden="true"
    >
      <img
        src={VEREINI_DEFAULT_SRC}
        alt=""
        className="ai-header-avatar__layer ai-header-avatar__layer--base"
      />
      <img
        src={VEREINI_BLINK_SRC}
        alt=""
        className={`ai-header-avatar__layer ai-header-avatar__layer--overlay ${avatarFrame === 'blink' ? 'is-active' : ''}`}
      />
      <img
        src={VEREINI_SMIRK_SRC}
        alt=""
        className={`ai-header-avatar__layer ai-header-avatar__layer--overlay ${avatarFrame === 'smirk' ? 'is-active' : ''}`}
      />
      <img
        src={VEREINI_THINKING_SRC}
        alt=""
        className={`ai-header-avatar__layer ai-header-avatar__layer--replacement ${avatarFrame === 'thinking' ? 'is-active' : ''}`}
      />
      <img
        src={VEREINI_SUCCESS_SRC}
        alt=""
        className={`ai-header-avatar__layer ai-header-avatar__layer--replacement ${avatarFrame === 'success' ? 'is-active' : ''}`}
      />
    </div>
  )

  return (
    <div className="page-content ai-page ai-assistant-page">
      <header className="ai-header ai-assistant-header">
        <div className="ai-header-brand">
          {renderAvatar()}
          <div className="ai-header-title">
            <h1>KI</h1>
          </div>
        </div>
        <div className="ai-header-actions">
          {chatStarted && (
            <button className="btn ai-header-new-chat" type="button" onClick={startNewChat}>
              + Neuer Chat
            </button>
          )}
          <span className={`ai-key-state ${settings.hasApiKey ? 'is-ready' : 'is-missing'}`}>
            {settings.hasApiKey ? 'API-Key aktiv' : 'API-Key fehlt'}
          </span>
          <button
            ref={historyButtonRef}
            className="btn ai-icon-btn"
            type="button"
            onClick={() => {
              setShowHistory((open) => !open)
              setShowAgentContext(false)
              setShowSettings(false)
            }}
            aria-label="KI-Verlauf"
          >
            ☰
          </button>
          <button
            ref={agentContextButtonRef}
            className="btn ai-icon-btn ai-agent-context-toggle"
            type="button"
            onClick={() => {
              setShowAgentContext((open) => !open)
              setShowHistory(false)
              setShowSettings(false)
            }}
            aria-label="Agent-Kontext"
            title="Agent-Kontext"
          >
            ◈
          </button>
          <button
            ref={settingsButtonRef}
            className="btn ai-icon-btn"
            type="button"
            onClick={() => {
              setShowSettings((open) => !open)
              setShowHistory(false)
              setShowAgentContext(false)
            }}
            aria-label="KI-Einstellungen"
          >
            ⚙
          </button>
        </div>
      </header>

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

          {messages.length > 0 && (
            <section className="card ai-conversation-card">
              <div className="ai-conversation-toolbar">
                <span>Unterhaltung</span>
              </div>
              <div className="ai-message-list">
                {messages.map((message) => {
                  const messageBody = message.displayBody ?? message.body
                  return (
                    <article
                      key={message.id}
                      className={`ai-message ai-message--${message.role} ${message.role === 'assistant' && message.isStreaming ? 'is-streaming' : ''}`}
                    >
                      <div className="ai-message-head">
                        <strong>
                          {message.title || (message.role === 'user' ? 'Du' : 'VereinO KI')}
                        </strong>
                        {message.meta && <span>{message.meta}</span>}
                      </div>
                      {message.role === 'assistant' ? (
                        message.isStreaming ? (
                          <p className="ai-message-stream-text">{messageBody}</p>
                        ) : (
                          <AiMarkdown
                            text={messageBody}
                            onOpenVoucher={(mention) => void openVoucherMention(mention)}
                          />
                        )
                      ) : (
                        <p>{message.body}</p>
                      )}
                      {message.jobId && message.reviewable && (
                        <>
                          <button
                            className="btn"
                            type="button"
                            onClick={() => void openJob(message.jobId!)}
                          >
                            Review öffnen
                          </button>
                          <button
                            className="btn"
                            type="button"
                            onClick={() => void openBookingDraftFromJobId(message.jobId!)}
                          >
                            Buchungsentwurf
                          </button>
                        </>
                      )}
                      {message.bookingDraft && (
                        <button
                          className="btn"
                          type="button"
                          disabled={message.bookingDraft.status === 'SAVED'}
                          onClick={() => openMessageBookingDraft(message.bookingDraft!)}
                        >
                          {message.bookingDraft.status === 'SAVED'
                            ? message.bookingDraft.voucherNo
                              ? `Erstellt · ${message.bookingDraft.voucherNo}`
                              : 'Erstellt'
                            : 'Buchungsentwurf öffnen'}
                        </button>
                      )}
                      {message.filePath && (
                        <button
                          className="btn"
                          type="button"
                          onClick={() => void window.api.shell.showItemInFolder(message.filePath!)}
                        >
                          Im Ordner anzeigen
                        </button>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          <AgentReviewQueue items={agentReviewQueueItems} onOpen={openAgentReviewQueueItem} />

          {pendingPlannerQuestion?.status === 'OPEN' && (
            <section id="ai-review-planner-question" className="card ai-planner-question-card">
              <div className="ai-section-head">
                <strong>{pendingPlannerQuestion.question}</strong>
                <span>Planer</span>
              </div>
              <p>{pendingPlannerQuestion.body}</p>
              <div className="ai-planner-options">
                {pendingPlannerQuestion.options.map((option) => (
                  <button
                    key={option.id}
                    className={option.id === 'CREATE_TAGS_AND_BOOK_ALL' ? 'primary' : ''}
                    type="button"
                    disabled={busy}
                    onClick={() => void resolvePlannerQuestion(option)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {pendingMembers && (
            <section id="ai-review-members" className="card ai-member-review-card">
              <div className="ai-section-head">
                <strong>Mitgliederanlage</strong>
                <span>
                  {pendingMembers.status === 'CREATED'
                    ? 'angelegt'
                    : `${pendingMembers.members.length} vorbereitet`}
                </span>
              </div>
              <div className="ai-member-review-list">
                {pendingMembers.members.map((member, idx) => (
                  <article
                    key={`${member.name}-${idx}`}
                    className={`ai-member-review-row ${member.createdId ? 'is-created' : ''}`}
                  >
                    <div>
                      <strong>
                        {member.createdMemberNo ? `${member.createdMemberNo} · ` : ''}
                        {member.name}
                      </strong>
                      <span>
                        {member.boardRole === 'V1'
                          ? 'Vorsitzender'
                          : member.boardRole || 'Mitglied'}
                      </span>
                    </div>
                    <dl>
                      <div>
                        <dt>Geburt</dt>
                        <dd>{formatIsoDate(member.birthDate)}</dd>
                      </div>
                      <div>
                        <dt>Eintritt</dt>
                        <dd>{formatIsoDate(member.joinDate)}</dd>
                      </div>
                      <div>
                        <dt>Beitrag</dt>
                        <dd>
                          {member.contributionAmount
                            ? euro.format(member.contributionAmount)
                            : 'fehlt'}{' '}
                          {member.contributionInterval === 'YEARLY'
                            ? 'jährlich'
                            : member.contributionInterval || ''}
                        </dd>
                      </div>
                      <div>
                        <dt>Erste Frist</dt>
                        <dd>{formatIsoDate(member.nextDueDate)}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
              <div className="ai-review-actions">
                <span className="helper">
                  {pendingMembers.status === 'CREATED'
                    ? 'Diese Mitglieder wurden bereits angelegt.'
                    : 'Bitte vor dem Anlegen prüfen.'}
                </span>
                <button
                  className="btn primary"
                  type="button"
                  disabled={busy || pendingMembers.status === 'CREATED'}
                  onClick={() => void createPendingMembers()}
                >
                  {pendingMembers.status === 'CREATED' ? 'Angelegt' : 'Mitglieder anlegen'}
                </button>
              </div>
            </section>
          )}

          {pendingMemberUpdates && (
            <section
              id="ai-review-member-updates"
              className="card ai-member-review-card ai-member-update-card"
            >
              <div className="ai-section-head">
                <strong>Mitgliederänderungen</strong>
                <span>
                  {pendingMemberUpdates.status === 'APPLIED'
                    ? 'übernommen'
                    : `${pendingMemberUpdates.changes.filter((change) => change.selected && !change.applied).length} ausgewählt`}
                </span>
              </div>
              <div className="ai-member-update-list">
                {pendingMemberUpdates.changes.map((change) => (
                  <article
                    key={change.id}
                    className={`ai-member-update-row ${change.applied ? 'is-created' : ''}`}
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={change.selected || change.applied}
                        disabled={
                          busy || change.applied || pendingMemberUpdates.status === 'APPLIED'
                        }
                        onChange={() => toggleMemberUpdateChange(change.id)}
                      />
                      <span>
                        <strong>{change.memberName}</strong>
                        <em>{change.label}</em>
                      </span>
                    </label>
                    <div className="ai-member-update-values">
                      <span>{change.oldDisplay}</span>
                      <b aria-hidden="true">→</b>
                      <strong>{change.newDisplay}</strong>
                    </div>
                    {change.applied && <small>übernommen</small>}
                  </article>
                ))}
              </div>
              <div className="ai-review-actions">
                <span className="helper">
                  {pendingMemberUpdates.status === 'APPLIED'
                    ? 'Diese Änderungen wurden bereits übernommen.'
                    : 'Bitte vor dem Übernehmen prüfen.'}
                </span>
                <button
                  className="btn primary"
                  type="button"
                  disabled={
                    busy ||
                    pendingMemberUpdates.status === 'APPLIED' ||
                    !pendingMemberUpdates.changes.some(
                      (change) => change.selected && !change.applied
                    )
                  }
                  onClick={() => void applyPendingMemberUpdates()}
                >
                  {pendingMemberUpdates.status === 'APPLIED'
                    ? 'Übernommen'
                    : 'Änderungen übernehmen'}
                </button>
              </div>
            </section>
          )}

          {pendingContributionPayment && (
            <section
              id="ai-review-contribution-payment"
              className="card ai-contribution-payment-card"
            >
              <div className="ai-section-head">
                <strong>Beitragsbuchung</strong>
                <span>
                  {pendingContributionPayment.status === 'CREATED'
                    ? 'gebucht'
                    : 'Review erforderlich'}
                </span>
              </div>
              <div
                className={`ai-contribution-payment-row ${pendingContributionPayment.status === 'CREATED' ? 'is-created' : ''}`}
              >
                <div>
                  <strong>{pendingContributionPayment.description}</strong>
                  <span>
                    {pendingContributionPayment.status === 'CREATED' &&
                    pendingContributionPayment.voucherNo
                      ? `Buchung ${pendingContributionPayment.voucherNo}`
                      : 'Wird nach Freigabe erstellt und verknüpft'}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>Mitglied</dt>
                    <dd>{pendingContributionPayment.memberName}</dd>
                  </div>
                  <div>
                    <dt>Zeitraum</dt>
                    <dd>{pendingContributionPayment.periodKey}</dd>
                  </div>
                  <div>
                    <dt>Betrag</dt>
                    <dd>{euro.format(pendingContributionPayment.amount)}</dd>
                  </div>
                  <div>
                    <dt>Offen</dt>
                    <dd>{euro.format(pendingContributionPayment.dueAmount)}</dd>
                  </div>
                  <div>
                    <dt>Datum</dt>
                    <dd>{formatIsoDate(pendingContributionPayment.date)}</dd>
                  </div>
                  <div>
                    <dt>Konto</dt>
                    <dd>{pendingContributionPayment.paymentAccountName || 'kein Konto'}</dd>
                  </div>
                </dl>
                {pendingContributionPayment.warnings.length ? (
                  <div className="ai-evidence">
                    {pendingContributionPayment.warnings.map((warning, idx) => (
                      <span key={idx} className={warningClassName(warning)}>
                        {warning}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="ai-review-actions">
                <span className="helper">
                  {pendingContributionPayment.status === 'CREATED'
                    ? 'Diese Beitragsbuchung wurde bereits erstellt und verknüpft.'
                    : 'Erstellt eine Einnahmebuchung und markiert den Beitragszeitraum als bezahlt.'}
                </span>
                <button
                  className="btn primary"
                  type="button"
                  disabled={busy || pendingContributionPayment.status === 'CREATED'}
                  onClick={() => void createContributionPayment()}
                >
                  {pendingContributionPayment.status === 'CREATED'
                    ? 'Gebucht'
                    : 'Buchung erstellen & verknüpfen'}
                </button>
              </div>
            </section>
          )}

          {pendingContributionLinks && (
            <section
              id="ai-review-contribution-links"
              className="card ai-contribution-payment-card"
            >
              <div className="ai-section-head">
                <strong>Beitrags-Verknüpfungen</strong>
                <span>
                  {pendingContributionLinks.status === 'APPLIED'
                    ? 'übernommen'
                    : `${pendingContributionLinks.changes.filter((change) => change.selected && !change.applied).length} ausgewählt`}
                </span>
              </div>
              <div className="ai-member-update-list">
                {pendingContributionLinks.changes.map((change) => (
                  <article
                    key={change.id}
                    className={`ai-member-update-row ${change.applied ? 'is-created' : ''}`}
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={change.selected || !!change.applied}
                        disabled={
                          busy || change.applied || pendingContributionLinks.status === 'APPLIED'
                        }
                        onChange={() => toggleContributionLink(change.id)}
                      />
                      <span>
                        <strong>{change.memberName}</strong>
                        <em>{change.periodKey}</em>
                      </span>
                    </label>
                    <div className="ai-member-update-values">
                      <span>{change.voucherNo || `#${change.voucherId}`}</span>
                      <b aria-hidden="true">→</b>
                      <strong>{euro.format(change.amount)}</strong>
                    </div>
                    {change.voucherDate && <small>{formatIsoDate(change.voucherDate)}</small>}
                    {change.applied && <small>verknüpft</small>}
                    {change.warnings.length ? (
                      <div className="ai-evidence">
                        {change.warnings.map((warning, idx) => (
                          <span key={idx} className={warningClassName(warning)}>
                            {warning}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
              <div className="ai-review-actions">
                <span className="helper">
                  {pendingContributionLinks.status === 'APPLIED'
                    ? 'Diese Beitragszeiträume wurden bereits verknüpft.'
                    : 'Markiert die ausgewählten Beitragszeiträume mit vorhandenen Buchungen als bezahlt.'}
                </span>
                <button
                  className="btn primary"
                  type="button"
                  disabled={
                    busy ||
                    pendingContributionLinks.status === 'APPLIED' ||
                    !pendingContributionLinks.changes.some(
                      (change) => change.selected && !change.applied
                    )
                  }
                  onClick={() => void applyContributionLinks()}
                >
                  {pendingContributionLinks.status === 'APPLIED'
                    ? 'Verknüpft'
                    : 'Verknüpfungen übernehmen'}
                </button>
              </div>
            </section>
          )}

          {pendingTagActions && (
            <section id="ai-review-tag-actions" className="card ai-tag-action-card">
              <div className="ai-section-head">
                <strong>Tag-Änderungen</strong>
                <span>
                  {pendingTagActions.status === 'APPLIED'
                    ? 'übernommen'
                    : `${pendingTagActions.changes.filter((change) => change.selected && !change.applied).length} ausgewählt`}
                </span>
              </div>
              <div className="ai-tag-action-list">
                {pendingTagActions.changes.map((change) => (
                  <article
                    key={change.id}
                    className={`ai-tag-action-row ${change.applied ? 'is-created' : ''}`}
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={change.selected || change.applied}
                        disabled={busy || change.applied || pendingTagActions.status === 'APPLIED'}
                        onChange={() => toggleTagAction(change.id)}
                      />
                      <span
                        className={`ai-tag-action-kind ai-tag-action-kind--${change.action.toLowerCase()}`}
                      >
                        {change.action === 'CREATE'
                          ? 'Neu'
                          : change.action === 'UPDATE'
                            ? 'Ändern'
                            : 'Löschen'}
                      </span>
                      <strong>{change.name}</strong>
                    </label>
                    <div className="ai-tag-action-values">
                      <span>{change.oldDisplay}</span>
                      <b aria-hidden="true">→</b>
                      <strong>{change.newDisplay}</strong>
                    </div>
                    {change.color && <i style={{ background: change.color }} aria-hidden="true" />}
                  </article>
                ))}
              </div>
              <div className="ai-review-actions">
                <span className="helper">
                  {pendingTagActions.status === 'APPLIED'
                    ? 'Diese Tag-Änderungen wurden bereits übernommen.'
                    : 'Bitte vor dem Übernehmen prüfen.'}
                </span>
                <button
                  className="btn primary"
                  type="button"
                  disabled={
                    busy ||
                    pendingTagActions.status === 'APPLIED' ||
                    !pendingTagActions.changes.some((change) => change.selected && !change.applied)
                  }
                  onClick={() => void applyPendingTagActions()}
                >
                  {pendingTagActions.status === 'APPLIED'
                    ? 'Übernommen'
                    : 'Tag-Änderungen übernehmen'}
                </button>
              </div>
            </section>
          )}

          {pendingVoucherTagActions && (
            <section id="ai-review-voucher-tags" className="card ai-voucher-action-card">
              <div className="ai-section-head">
                <strong>Buchungsänderungen</strong>
                <span>
                  {pendingVoucherTagActions.status === 'APPLIED'
                    ? 'übernommen'
                    : `${pendingVoucherTagActions.changes.filter((change) => change.selected && !change.applied).length} ausgewählt`}
                </span>
              </div>
              <div className="ai-voucher-action-summary">
                <span>Filter: Tag „{pendingVoucherTagActions.sourceTag}“</span>
                <strong>Ergänzen: {pendingVoucherTagActions.addedTags.join(', ')}</strong>
              </div>
              <div className="ai-voucher-action-list">
                {pendingVoucherTagActions.changes.length ? (
                  pendingVoucherTagActions.changes.map((change) => (
                    <article
                      key={change.id}
                      className={`ai-voucher-action-row ${change.applied ? 'is-created' : ''}`}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={change.selected || change.applied}
                          disabled={
                            busy || change.applied || pendingVoucherTagActions.status === 'APPLIED'
                          }
                          onChange={() => toggleVoucherTagAction(change.id)}
                        />
                        <span>
                          <strong>{change.voucherNo}</strong>
                          <em>
                            {formatIsoDate(change.date)} ·{' '}
                            {change.description || 'ohne Beschreibung'}
                          </em>
                        </span>
                      </label>
                      <div className="ai-voucher-tag-diff">
                        <span>
                          {change.oldTags.length ? change.oldTags.join(', ') : 'keine Tags'}
                        </span>
                        <b aria-hidden="true">→</b>
                        <strong>{change.newTags.join(', ')}</strong>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="ai-empty">Keine Buchung benötigt eine Änderung.</div>
                )}
              </div>
              <div className="ai-review-actions">
                <span className="helper">
                  {pendingVoucherTagActions.status === 'APPLIED'
                    ? 'Diese Buchungsänderungen wurden bereits übernommen.'
                    : 'Bitte vor dem Übernehmen prüfen.'}
                </span>
                <button
                  className="btn primary"
                  type="button"
                  disabled={
                    busy ||
                    pendingVoucherTagActions.status === 'APPLIED' ||
                    !pendingVoucherTagActions.changes.some(
                      (change) => change.selected && !change.applied
                    )
                  }
                  onClick={() => void applyPendingVoucherTagActions()}
                >
                  {pendingVoucherTagActions.status === 'APPLIED'
                    ? 'Übernommen'
                    : 'Buchungen aktualisieren'}
                </button>
              </div>
            </section>
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
            <section id="ai-review-bank-links" className="card ai-review-card">
              <div className="ai-section-head">
                <strong>Bankbelege verknüpfen</strong>
                <span>
                  {pendingBankLinks.status === 'APPLIED'
                    ? 'Erledigt'
                    : `${pendingBankLinks.changes.filter((change) => change.selected && !change.applied).length} offen`}
                </span>
              </div>
              {pendingBankLinks.reason && <p>{pendingBankLinks.reason}</p>}
              {pendingBankLinks.warnings?.length ? (
                <div className="ai-warning">{pendingBankLinks.warnings.join(' ')}</div>
              ) : null}
              <div className="ai-voucher-action-list">
                {pendingBankLinks.changes.map((change) => (
                  <article
                    key={change.id}
                    className={`ai-voucher-action-row ${change.applied ? 'is-created' : ''}`}
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={change.selected || change.applied}
                        disabled={busy || change.applied || pendingBankLinks.status === 'APPLIED'}
                        onChange={() => toggleBankLink(change.id)}
                      />
                      <span>
                        <strong>Bankbeleg #{change.bankTransactionId}</strong>
                        <em>
                          {formatIsoDate(change.bankBookingDate)} ·{' '}
                          {[change.bankCounterparty, change.bankPurpose]
                            .filter(Boolean)
                            .join(' - ') || 'ohne Beschreibung'}{' '}
                          · {euro.format(Number(change.bankAmount || 0))}
                        </em>
                      </span>
                    </label>
                    <div className="ai-voucher-tag-diff">
                      <span>
                        {change.voucherNo || `#${change.voucherId}`} ·{' '}
                        {change.voucherDescription || 'ohne Beschreibung'}
                      </span>
                      <b aria-hidden="true">→</b>
                      <strong>verknüpfen</strong>
                    </div>
                    {change.error && <small className="ai-warning">{change.error}</small>}
                  </article>
                ))}
              </div>
              <div className="ai-review-actions">
                <span className="helper">
                  {pendingBankLinks.status === 'APPLIED'
                    ? 'Diese Bankbelege wurden bereits verknüpft.'
                    : 'Es werden nur Bankbelege mit bestehenden Buchungen verknüpft; es wird nichts storniert.'}
                </span>
                <button
                  className="btn primary"
                  type="button"
                  disabled={
                    busy ||
                    pendingBankLinks.status === 'APPLIED' ||
                    !pendingBankLinks.changes.some((change) => change.selected && !change.applied)
                  }
                  onClick={() => void applyPendingBankLinks()}
                >
                  {pendingBankLinks.status === 'APPLIED' ? 'Verknüpft' : 'Bankbelege verknüpfen'}
                </button>
              </div>
            </section>
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
            <section id="ai-review-bank" className="card ai-bank-review-card">
              <div className="ai-section-head">
                <strong>Bankimport-Vorschläge</strong>
                <span>
                  {bankReview.suggestions.filter((suggestion) => !suggestion.resolved).length} offen
                  {bankReview.sourceTotal ? ` · ${bankReview.sourceTotal} geprüft` : ''}
                </span>
              </div>
              {bankReview.filterSummary && (
                <div className="ai-bank-filter-note">{bankReview.filterSummary}</div>
              )}
              {renderBankSuggestionGroup(
                'Sichere Treffer',
                'Bestehende Buchungen verknüpfen',
                bankSuggestionGroups.matches
              )}
              {renderBankSuggestionGroup(
                'Neue Buchungen vorbereiten',
                'Kein Treffer gefunden',
                bankSuggestionGroups.create
              )}
              {renderBankSuggestionGroup(
                'Manuell klären',
                'Unklare oder nicht buchungsrelevante Belege',
                bankSuggestionGroups.manual
              )}
              {renderBankSuggestionGroup(
                'Erledigt',
                'Bereits aus dieser Prüfung übernommen',
                bankSuggestionGroups.done
              )}
            </section>
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
        <section
          ref={historyDrawerRef}
          className="card ai-assistant-sidebar ai-history-drawer"
          role="dialog"
          aria-label="KI-Verlauf"
        >
          <div className="ai-history-drawer-head">
            <div>
              <strong>Verlauf</strong>
              <span>Schneller zurück in Reviews, gebuchte Vorschläge und alte Agent-Läufe.</span>
            </div>
            <button
              className="btn ghost ai-history-close"
              type="button"
              onClick={() => setShowHistory(false)}
              aria-label="Schließen"
            >
              ×
            </button>
          </div>
          <div className="ai-history-stats">
            <span>
              <strong>{openBookingJobs.length}</strong> offen
            </span>
            <span>
              <strong>{completedBookingJobs.length}</strong> gebucht
            </span>
            <span>
              <strong>{jobs.length}</strong> Aufgaben
            </span>
          </div>
          <div className="ai-history-layout">
            <div className="ai-history-column ai-history-column--reviews">
              <div className="ai-history-group ai-history-group--open">
                <div className="ai-history-group-title">
                  <strong>Offene Buchungsreviews</strong>
                  <span>{openBookingJobs.length}</span>
                </div>
                <div className="ai-history-list">
                  {openBookingJobs.map((job) => renderHistoryJobButton(job, 'open'))}
                  {!openBookingJobs.length && (
                    <div className="ai-empty">Keine offenen Buchungsvorschläge.</div>
                  )}
                </div>
              </div>
              <div className="ai-history-group ai-history-group--done">
                <div className="ai-history-group-title">
                  <strong>Gebuchte Vorschläge</strong>
                  <span>{completedBookingJobs.length}</span>
                </div>
                <div className="ai-history-list ai-history-list--compact">
                  {completedBookingJobs
                    .slice(0, 10)
                    .map((job) =>
                      renderHistoryJobButton(job, 'done', [
                        bookingProgress(job),
                        statusLabel(job.status),
                        job.createdAt?.slice(0, 10),
                        job.voucherId ? `Buchung #${job.voucherId}` : null
                      ])
                    )}
                  {!completedBookingJobs.length && (
                    <div className="ai-empty">Noch keine gebuchten Vorschläge.</div>
                  )}
                </div>
              </div>
            </div>
            <div className="ai-history-column">
              <div className="ai-history-group ai-history-group--all">
                <div className="ai-history-group-title">
                  <strong>Alle KI-Aufgaben</strong>
                  <span>{jobs.length}</span>
                </div>
                <div className="ai-history-list">
                  {jobs.map((job) => renderHistoryJobButton(job, 'task'))}
                  {!jobs.length && (
                    <div className="ai-empty">Noch keine gespeicherten KI-Aufgaben.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
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

      {showSettings && (
        <section ref={settingsDrawerRef} className="card ai-settings-card ai-settings-drawer">
          <div className="ai-section-head">
            <strong>Einstellungen</strong>
            <button
              className="btn ghost"
              onClick={() => setShowSettings(false)}
              aria-label="Schließen"
            >
              ×
            </button>
          </div>
          <div className="ai-form-grid">
            <label className="field ai-field-wide">
              <span>API-Key</span>
              <input
                className="input"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  settings.hasApiKey ? 'Gespeichert - leer lassen zum Beibehalten' : 'sk-...'
                }
              />
            </label>
            <label className="field">
              <span>Anbieter</span>
              <select
                className="input"
                value={settings.provider}
                onChange={(event) =>
                  handleProviderChange(event.target.value as typeof settings.provider)
                }
              >
                {AI_PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Beleganalyse-Modell</span>
              <select
                className="input"
                value={settings.model}
                onChange={(event) => setSettings({ ...settings, model: event.target.value })}
              >
                {providerConfig.modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.hint}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Textmodell</span>
              <select
                className="input"
                value={settings.textModel}
                onChange={(event) => setSettings({ ...settings, textModel: event.target.value })}
              >
                {providerConfig.modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.hint}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Reasoning</span>
              <select
                className="input"
                value={settings.defaultReasoningEffort}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    defaultReasoningEffort: event.target
                      .value as typeof settings.defaultReasoningEffort
                  })
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <p className="helper ai-settings-note">
              VereinO setzt den passenden API-Endpunkt für den gewählten Anbieter automatisch und
              zeigt nur die dafür freigegebenen Modelle an. Für Minimax ist MiniMax-M3 direkt
              auswählbar.
            </p>
            <div className="ai-settings-divider ai-field-wide">
              <strong>Netzwerk &amp; Proxy</strong>
              <span>Gilt nur für KI-Anfragen.</span>
            </div>
            <label className="field">
              <span>Verbindungsmodus</span>
              <select
                className="input"
                value={settings.proxyMode}
                onChange={(event) => {
                  setConnectionTest(null)
                  setSettings({
                    ...settings,
                    proxyMode: event.target.value as typeof settings.proxyMode
                  })
                }}
              >
                <option value="system">Systemproxy (empfohlen)</option>
                <option value="direct">Direkt, ohne Proxy</option>
                <option value="manual">Manueller Proxy</option>
              </select>
            </label>
            <p className="helper ai-network-help">
              Der Systemmodus übernimmt Betriebssystem, PAC und Firmenrichtlinien. Zugangsdaten
              bleiben in der Systemanmeldung und werden nicht in VereinO gespeichert.
            </p>
            {settings.proxyMode === 'manual' && (
              <>
                <label className="field ai-field-wide">
                  <span>Proxy-Adresse</span>
                  <input
                    className="input"
                    value={settings.proxyUrl}
                    onChange={(event) => {
                      setConnectionTest(null)
                      setSettings({ ...settings, proxyUrl: event.target.value })
                    }}
                    placeholder="http://proxy.firma.local:8080"
                    spellCheck={false}
                  />
                </label>
                <label className="field ai-field-wide">
                  <span>Proxy-Ausnahmen</span>
                  <input
                    className="input"
                    value={settings.proxyBypassRules}
                    onChange={(event) => {
                      setConnectionTest(null)
                      setSettings({ ...settings, proxyBypassRules: event.target.value })
                    }}
                    placeholder="<local>;localhost;*.firma.local"
                    spellCheck={false}
                  />
                </label>
              </>
            )}
            {connectionTest && (
              <div
                className={`ai-network-result ai-field-wide ${connectionTest.ok ? 'is-success' : 'is-error'}`}
                role="status"
              >
                <strong>
                  {connectionTest.ok ? 'Verbindung erfolgreich' : 'Verbindung fehlgeschlagen'}
                </strong>
                {!connectionTest.ok && <span>{connectionTest.error}</span>}
                <small>
                  Ziel: {connectionTest.targetUrl || settings.apiBaseUrl} · Route:{' '}
                  {connectionTest.resolvedProxy || 'nicht ermittelt'}
                  {connectionTest.errorCode ? ` · ${connectionTest.errorCode}` : ''}
                </small>
              </div>
            )}
          </div>
          <div className="ai-settings-actions">
            <button className="btn primary" disabled={busy} onClick={saveSettings}>
              Speichern
            </button>
            <button className="btn" disabled={busy || !settings.hasApiKey} onClick={testConnection}>
              Verbindung testen
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
