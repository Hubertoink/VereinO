import { z } from 'zod'
import { FileDataFields, hasFileData, PaymentMethod, Sphere, VoucherType } from './primitives'

// AI jobs and OpenAI-backed helpers
export const AiJobType = z.enum(['BOOKING_FROM_DOCUMENTS', 'MEMBER_TEXT', 'REPORT_TEXT'])
export const AiJobStatus = z.enum([
  'DRAFT',
  'QUEUED',
  'PROCESSING',
  'NEEDS_REVIEW',
  'APPROVED',
  'REJECTED',
  'FAILED'
])
export const AiResultKind = z.enum(['BOOKING_CANDIDATE', 'TEXT_DRAFT'])

export const AiJobFileInput = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().nullable().optional(),
  dataBase64: z.string().min(1)
})

export const AiBookingAssignment = z.object({
  id: z.number().int().positive(),
  amount: z.number().nonnegative()
})

export const AiBookingCandidateReview = z.object({
  status: z.enum(['OPEN', 'APPROVED']).default('OPEN'),
  voucherId: z.number().int().positive().nullable().optional(),
  voucherNo: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional()
})

export const AiBookingSource = z.object({
  fileName: z.string().min(1),
  pageNumber: z.number().int().positive().nullable().optional(),
  pageCount: z.number().int().positive().nullable().optional(),
  label: z.string().min(1)
})

export const AiBookingSourceStructured = z.object({
  fileName: z.string().min(1),
  pageNumber: z.number().int().positive().nullable(),
  pageCount: z.number().int().positive().nullable(),
  label: z.string().min(1)
})

export const AiBookingCandidate = z.object({
  date: z.string().min(4),
  type: VoucherType.exclude(['TRANSFER', 'INTERNAL']),
  sphere: Sphere,
  primaryClassificationValueId: z.number().int().positive().nullable().optional(),
  description: z.string().min(1),
  grossAmount: z.number().positive(),
  vatRate: z.number().min(0).max(100).default(0),
  paymentMethod: PaymentMethod.nullable().optional(),
  paymentAccountId: z.number().int().positive().nullable().optional(),
  counterparty: z.string().nullable().optional(),
  budgets: z.array(AiBookingAssignment).default([]),
  earmarks: z.array(AiBookingAssignment).default([]),
  tags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  warnings: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  source: AiBookingSource.optional(),
  review: AiBookingCandidateReview.optional()
})

export const AiBookingAnalysisResult = z.object({
  candidates: z.array(AiBookingCandidate).min(1),
  summary: z.string().nullable().optional(),
  warnings: z.array(z.string()).default([])
})

export const AiTextDraftResult = z.object({
  title: z.string(),
  body: z.string(),
  notes: z.array(z.string()).default([])
})

export const AiBookingCandidateStructured = z.object({
  date: z.string().min(4),
  type: VoucherType.exclude(['TRANSFER', 'INTERNAL']),
  sphere: Sphere,
  primaryClassificationValueId: z.number().int().positive().nullable().optional(),
  description: z.string().min(1),
  grossAmount: z.number().positive(),
  vatRate: z.number().min(0).max(100),
  paymentMethod: PaymentMethod.nullable(),
  paymentAccountId: z.number().int().positive().nullable(),
  counterparty: z.string().nullable(),
  budgets: z.array(AiBookingAssignment),
  earmarks: z.array(AiBookingAssignment),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  evidence: z.array(z.string()),
  source: AiBookingSourceStructured
})

export const AiBookingAnalysisResultStructured = z.object({
  candidates: z.array(AiBookingCandidateStructured).min(1),
  summary: z.string().nullable(),
  warnings: z.array(z.string())
})

export const AiInvoiceExtractionResult = z.object({
  supplier: z.string().nullable(),
  // A matching entry from the central business-partner registry, never a new suggestion.
  partyId: z.number().int().positive().nullable().optional(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  grossAmount: z.number().nonnegative().nullable(),
  netAmount: z.number().nonnegative().nullable(),
  taxAmount: z.number().nonnegative().nullable(),
  vatRate: z.number().min(0).max(100).nullable(),
  iban: z.string().nullable(),
  description: z.string().nullable(),
  type: z.enum(['IN', 'OUT']),
  sphere: Sphere,
  primaryClassificationValueId: z.number().int().positive().nullable().optional(),
  paymentMethod: PaymentMethod.nullable(),
  paymentAccountId: z.number().int().positive().nullable(),
  budgets: z.array(AiBookingAssignment),
  earmarks: z.array(AiBookingAssignment),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  evidence: z.array(z.string())
})

export const AiInvoiceExtractionResultStructured = AiInvoiceExtractionResult

export const AiTextDraftResultStructured = z.object({
  title: z.string(),
  body: z.string(),
  notes: z.array(z.string())
})

export const AiBankImportAction = z.enum([
  'LINK_EXISTING',
  'APPLY_RECURRING',
  'CREATE_BOOKING',
  'MARK_CHECKED',
  'NEEDS_MANUAL_REVIEW'
])
export const AiBankImportReviewSuggestion = z
  .object({
    transactionId: z.number().int().positive(),
    action: AiBankImportAction,
    confidence: z.number().min(0).max(1).default(0.5),
    reason: z.string().min(1),
    voucherId: z.number().int().positive().nullable().optional(),
    voucherNo: z.string().nullable().optional(),
    recurringBookingId: z.number().int().positive().nullable().optional(),
    recurringBookingName: z.string().nullable().optional(),
    occurrenceId: z.number().int().positive().nullable().optional(),
    scheduledDate: z.string().nullable().optional(),
    bookingCandidate: AiBookingCandidate.nullable().optional(),
    warnings: z.array(z.string()).default([]),
    evidence: z.array(z.string()).default([]),
    transaction: z.record(z.any()).optional()
  })
  .superRefine((value, ctx) => {
    if (value.action === 'LINK_EXISTING' && !value.voucherId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LINK_EXISTING requires voucherId',
        path: ['voucherId']
      })
    }
    if (value.action === 'CREATE_BOOKING' && !value.bookingCandidate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CREATE_BOOKING requires bookingCandidate',
        path: ['bookingCandidate']
      })
    }
    if (value.action === 'APPLY_RECURRING' && (!value.recurringBookingId || (!value.occurrenceId && !value.scheduledDate))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'APPLY_RECURRING requires recurringBookingId and occurrenceId or scheduledDate',
        path: ['recurringBookingId']
      })
    }
  })

export const AiBankImportReviewResult = z.object({
  suggestions: z.array(AiBankImportReviewSuggestion).default([]),
  summary: z.string().optional(),
  warnings: z.array(z.string()).default([])
})

export const AiBankImportReviewSuggestionStructured = z
  .object({
    transactionId: z.number().int().positive(),
    action: AiBankImportAction,
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1),
    voucherId: z.number().int().positive().nullable(),
    voucherNo: z.string().nullable(),
    recurringBookingId: z.number().int().positive().nullable(),
    recurringBookingName: z.string().nullable(),
    occurrenceId: z.number().int().positive().nullable(),
    scheduledDate: z.string().nullable(),
    bookingCandidate: AiBookingCandidateStructured.nullable(),
    warnings: z.array(z.string()),
    evidence: z.array(z.string())
  })
  .superRefine((value, ctx) => {
    if (value.action === 'LINK_EXISTING' && !value.voucherId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LINK_EXISTING requires voucherId',
        path: ['voucherId']
      })
    }
    if (value.action === 'CREATE_BOOKING' && !value.bookingCandidate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CREATE_BOOKING requires bookingCandidate',
        path: ['bookingCandidate']
      })
    }
    if (value.action === 'APPLY_RECURRING' && (!value.recurringBookingId || (!value.occurrenceId && !value.scheduledDate))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'APPLY_RECURRING requires recurringBookingId and occurrenceId or scheduledDate',
        path: ['recurringBookingId']
      })
    }
  })

export const AiBankImportReviewResultStructured = z.object({
  suggestions: z.array(AiBankImportReviewSuggestionStructured),
  summary: z.string().nullable(),
  warnings: z.array(z.string())
})

export const AiActionEntity = z.enum([
  'vouchers',
  'parties',
  'members',
  'payments',
  'tags',
  'budgets',
  'earmarks',
  'reports',
  'bankImport',
  'recurringBookings',
  'text',
  'unknown'
])
export const AiActionOperation = z.enum([
  'read',
  'create',
  'update',
  'delete',
  'export',
  'reviewBankImport',
  'linkExisting',
  'generateText',
  'none'
])
export const AiActionSafety = z.enum(['READ_ONLY', 'REVIEW_REQUIRED', 'DIRECT_SAFE', 'BLOCKED'])
export const AiActionFilter = z.object({
  field: z.string(),
  operator: z
    .enum(['eq', 'contains', 'in', 'date_gte', 'date_lte', 'amount_gte', 'amount_lte'])
    .default('eq'),
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string(), z.number(), z.boolean()]))
    ])
    .nullable()
})
export const AiActionChange = z.object({
  field: z.string(),
  mode: z.enum(['set', 'add', 'remove', 'append']).default('set'),
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string(), z.number(), z.boolean()]))
    ])
    .nullable()
})
export const AiActionArg = z.object({
  key: z.string(),
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string(), z.number(), z.boolean()]))
    ])
    .nullable()
})
export const AiActionItem = z.object({
  values: z.array(AiActionArg)
})
export const AiActionPlan = z.object({
  title: z.string(),
  summary: z.string(),
  entity: AiActionEntity,
  operation: AiActionOperation,
  safety: AiActionSafety,
  filters: z.array(AiActionFilter).default([]),
  changes: z.array(AiActionChange).default([]),
  args: z.array(AiActionArg).default([]),
  items: z.array(AiActionItem).default([]),
  requiresReview: z.boolean().default(true),
  confidence: z.number().min(0).max(1).default(0.5),
  answer: z.string().nullable().optional(),
  warnings: z.array(z.string()).default([])
})
export const AiActionPlanStructured = z.object({
  title: z.string(),
  summary: z.string(),
  entity: AiActionEntity,
  operation: AiActionOperation,
  safety: AiActionSafety,
  filters: z.array(AiActionFilter),
  changes: z.array(AiActionChange),
  args: z.array(AiActionArg),
  items: z.array(AiActionItem),
  requiresReview: z.boolean(),
  confidence: z.number().min(0).max(1),
  answer: z.string().nullable(),
  warnings: z.array(z.string())
})

export const AiUsageSchema = z.object({
  inputTokens: z.number().default(0),
  cachedInputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  reasoningTokens: z.number().default(0),
  totalTokens: z.number().default(0),
  estimatedCostUsd: z.number().nullable().optional(),
  pricingNote: z.string().optional()
})

const AiInvoiceMimeType = z.enum(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
const MAX_AI_INVOICE_BASE64_LENGTH = 4 * Math.ceil((10 * 1024 * 1024) / 3)
const MAX_LOCAL_INVOICE_BASE64_LENGTH = 4 * Math.ceil((25 * 1024 * 1024) / 3)
const MAX_LOCAL_OCR_BASE64_LENGTH = 4 * Math.ceil((12 * 1024 * 1024) / 3)
export const LocalOcrExtractInput = z.object({
  images: z.array(
    z.object({
      ...FileDataFields
    })
      .refine(hasFileData, { message: 'OCR-Bilddaten fehlen.' })
      .refine(
        (image) =>
          (image.dataBytes?.byteLength ?? 0) <= 12 * 1024 * 1024 &&
          (image.dataBase64?.length ?? 0) <= MAX_LOCAL_OCR_BASE64_LENGTH,
        { message: 'Eine OCR-Seite ist zu groß.' }
      )
      .refine((image) => !image.dataBase64 || /^[A-Za-z0-9+/]+={0,2}$/.test(image.dataBase64), {
        message: 'Ungültige Base64-Datei'
      })
  ).min(1).max(3)
})
export const LocalOcrExtractOutput = z.object({
  text: z.string(),
  pages: z.array(z.object({
    text: z.string(),
    confidence: z.number().min(0).max(100),
    words: z.array(z.object({
      text: z.string().max(200),
      x: z.number().nonnegative(),
      y: z.number().nonnegative(),
      width: z.number().positive(),
      height: z.number().positive()
    })).max(10_000)
  })).min(1).max(3),
  confidence: z.number().int().min(0).max(100)
})
export const AiInvoiceBookingDefaults = z.object({
  type: z.enum(['IN', 'OUT']).optional(),
  sphere: Sphere.optional(),
  paymentMethod: PaymentMethod.optional(),
  paymentAccountId: z.number().int().positive().nullable().optional()
})
export const AiInvoiceGuidance = z.object({
  instructions: z.string().trim().max(2_000).optional(),
  defaults: AiInvoiceBookingDefaults.optional()
})
export const AiInvoiceExtractInput = z.object({
  file: z
    .object({
      fileName: z.string().trim().min(1).max(255),
      mimeType: AiInvoiceMimeType,
      ...FileDataFields
    })
    .refine(hasFileData, { message: 'Dateidaten fehlen.' })
    .refine(
      (file) =>
        (file.dataBytes?.byteLength ?? 0) <= 10 * 1024 * 1024 &&
        (file.dataBase64?.length ?? 0) <= MAX_AI_INVOICE_BASE64_LENGTH,
      { message: 'Die Datei ist zu groß.' }
    )
    .refine((file) => !file.dataBase64 || /^[A-Za-z0-9+/]+={0,2}$/.test(file.dataBase64), {
      message: 'Ungültige Base64-Datei'
    }),
  localDocumentText: z.string().max(250_000).optional(),
  guidance: AiInvoiceGuidance.optional()
})
export const AiInvoiceExtractOutput = z.object({
  model: z.string(),
  result: AiInvoiceExtractionResult,
  usage: AiUsageSchema,
  timings: z.object({
    totalMs: z.number().int().nonnegative(),
    doclingMs: z.number().int().nonnegative().nullable(),
    ocrMs: z.number().int().nonnegative().nullable(),
    analysisMs: z.number().int().nonnegative()
  })
})
export const AiInvoiceDuplicateCheckInput = z.object({
  file: z
    .object({
      fileName: z.string().trim().min(1).max(255),
      mimeType: AiInvoiceMimeType,
      ...FileDataFields
    })
    .refine(hasFileData, { message: 'Dateidaten fehlen.' })
    .refine(
      (file) =>
        (file.dataBytes?.byteLength ?? 0) <= 25 * 1024 * 1024 &&
        (file.dataBase64?.length ?? 0) <= MAX_LOCAL_INVOICE_BASE64_LENGTH,
      { message: 'Die Datei ist zu groß.' }
    )
    .refine((file) => !file.dataBase64 || /^[A-Za-z0-9+/]+={0,2}$/.test(file.dataBase64), {
      message: 'Ungültige Base64-Datei'
    })
})
export const AiInvoiceDuplicateCheckOutput = z.object({
  isDuplicate: z.boolean(),
  duplicateVoucherId: z.number().int().positive().nullable(),
  duplicateVoucherNo: z.string().nullable()
})

export const AiInvoiceBatchFileInput = z
  .object({
    fileName: z.string().min(1).max(255),
    ...FileDataFields
  })
  .refine(hasFileData, { message: 'Dateidaten fehlen.' })
export const AiInvoiceBatchImportInput = z.object({
  files: z.array(AiInvoiceBatchFileInput).min(1).max(50),
  guidance: AiInvoiceGuidance.optional()
})
export const AiInvoiceBatchItem = z.object({
  id: z.number().int().positive(),
  fileName: z.string(),
  status: AiJobStatus,
  error: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  result: AiInvoiceExtractionResult.nullable().optional(),
  isDuplicate: z.boolean().default(false),
  duplicateVoucherId: z.number().int().positive().nullable().optional(),
  duplicateVoucherNo: z.string().nullable().optional(),
  guidance: AiInvoiceGuidance.nullable().optional(),
  packet: z
    .object({
      index: z.number().int().positive(),
      total: z.number().int().positive(),
      pageNumbers: z.array(z.number().int().positive()).min(1),
      confidence: z.number().min(0).max(1),
      warnings: z.array(z.string())
    })
    .nullable()
    .optional()
})
export const AiInvoiceBatchListOutput = z.object({
  rows: z.array(AiInvoiceBatchItem),
  submitDirectory: z.string(),
  aiAvailable: z.boolean(),
  doclingAvailable: z.boolean().default(false)
})
export const AiInvoiceBatchGetOutput = AiInvoiceBatchItem.extend({
  file: z
    .object({
      fileName: z.string(),
      mimeType: z.string().nullable().optional(),
      dataBase64: z.string().optional()
    })
    .nullable()
})
export const AiInvoiceBatchActionOutput = z.object({ ok: z.boolean() })
export const AiInvoiceBatchIdInput = z.object({ id: z.number().int().positive() })
export const AiInvoiceBatchApproveInput = AiInvoiceBatchIdInput.extend({
  voucherId: z.number().int().positive()
})

export const AiAgentDraft = z.object({
  kind: z.enum([
    'booking',
    'recurringBooking',
    'partyChange',
    'voucherUpdate',
    'voucherReverse',
    'voucherRebook',
    'memberCreate',
    'memberUpdate',
    'contributionPaymentLink',
    'tagChange',
    'budgetChange',
    'earmarkChange',
    'bankLink',
    'invoiceAction',
    'reportExport'
  ]),
  title: z.string(),
  payload: z.any(),
  autoApproval: z
    .object({
      action: z.enum(['AUTO_PRESELECT', 'AUTO_APPLY_SAFE']),
      ruleIds: z.array(z.number()),
      ruleNames: z.array(z.string())
    })
    .nullable()
    .optional()
})
export const AiAgentToolCall = z.object({
  name: z.string(),
  args: z.any().optional(),
  ok: z.boolean(),
  summary: z.string().nullable().optional()
})
export const AiAgentTraceEvent = z.object({
  id: z.string(),
  kind: z.enum(['tool_call', 'tool_result', 'draft', 'memory', 'rule', 'message']),
  title: z.string(),
  detail: z.string().nullable().optional(),
  ok: z.boolean().optional(),
  payload: z.any().optional()
})
export const AiAgentRunInput = z.object({
  sessionId: z.string().min(1).nullable().optional(),
  prompt: z.string().min(1),
  uiContext: z.any().optional(),
  model: z.string().optional(),
  maxSteps: z.number().int().min(1).max(8).optional()
})
export const AiAgentRunOutput = z.object({
  sessionId: z.string(),
  title: z.string().nullable().optional(),
  answer: z.string(),
  model: z.string(),
  toolCalls: z.array(AiAgentToolCall).default([]),
  trace: z.array(AiAgentTraceEvent).default([]),
  drafts: z.array(AiAgentDraft).default([]),
  usage: AiUsageSchema
})

export const AiAgentMemorySchema = z.object({
  id: z.number(),
  scope: z.enum(['ORG', 'USER', 'SESSION']),
  key: z.string(),
  value: z.string(),
  source: z.string().nullable().optional(),
  confidence: z.number(),
  isActive: z.number(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export const AiAgentMemoryListInput = z
  .object({
    activeOnly: z.boolean().optional(),
    scope: z.enum(['ORG', 'USER', 'SESSION']).optional(),
    limit: z.number().optional()
  })
  .optional()
export const AiAgentMemoryListOutput = z.object({ rows: z.array(AiAgentMemorySchema) })
export const AiAgentMemoryUpsertInput = z.object({
  scope: z.enum(['ORG', 'USER', 'SESSION']).optional(),
  key: z.string().min(1),
  value: z.string().min(1),
  source: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional()
})

export const AiAgentAutoRuleSchema = z.object({
  id: z.number(),
  name: z.string(),
  draftKind: z.string(),
  conditions: z.record(z.string(), z.any()),
  action: z.enum(['AUTO_PRESELECT', 'AUTO_APPLY_SAFE']),
  enabled: z.number(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export const AiAgentAutoRulesListInput = z
  .object({
    enabledOnly: z.boolean().optional(),
    draftKind: z.string().optional(),
    limit: z.number().optional()
  })
  .optional()
export const AiAgentAutoRulesListOutput = z.object({ rows: z.array(AiAgentAutoRuleSchema) })
export const AiAgentAutoRuleUpsertInput = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  draftKind: z.string().min(1),
  conditions: z.record(z.string(), z.any()).optional(),
  action: z.enum(['AUTO_PRESELECT', 'AUTO_APPLY_SAFE']).optional(),
  enabled: z.boolean().optional()
})

export const AiKnowledgeRuleScope = z.enum(['ALL', 'BOOKINGS', 'INVOICES'])
export const AiKnowledgeRuleSchema = z.object({
  id: z.number(),
  name: z.string(),
  scope: AiKnowledgeRuleScope,
  instruction: z.string(),
  enabled: z.number(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export const AiKnowledgeRulesListInput = z
  .object({
    enabledOnly: z.boolean().optional(),
    scope: AiKnowledgeRuleScope.optional(),
    limit: z.number().int().positive().max(200).optional()
  })
  .optional()
export const AiKnowledgeRulesListOutput = z.object({ rows: z.array(AiKnowledgeRuleSchema) })
export const AiKnowledgeRuleUpsertInput = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120),
  scope: AiKnowledgeRuleScope.optional(),
  instruction: z.string().trim().min(1).max(4000),
  enabled: z.boolean().optional()
})
export const AiKnowledgeRuleDeleteInput = z.object({ id: z.number().int().positive() })
export const AiKnowledgeRuleDeleteOutput = z.object({ ok: z.boolean() })

export const AiJobSchema = z.object({
  id: z.number(),
  type: AiJobType,
  status: AiJobStatus,
  title: z.string().nullable().optional(),
  prompt: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  usage: AiUsageSchema.nullable().optional(),
  error: z.string().nullable().optional(),
  voucherId: z.number().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  processedAt: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  fileCount: z.number(),
  resultKind: AiResultKind.nullable().optional(),
  result: z.any().optional()
})

export const AiJobDetailSchema = AiJobSchema.extend({
  files: z.array(
    z.object({
      id: z.number(),
      jobId: z.number(),
      fileName: z.string(),
      mimeType: z.string().nullable().optional(),
      size: z.number(),
      createdAt: z.string(),
      dataBase64: z.string().optional()
    })
  )
})

export const AiProvider = z.enum(['openai', 'minimax', 'mittwald'])
export const AiProxyMode = z.enum(['system', 'direct', 'manual'])
export const AiTaskProfile = z.enum(['auto', 'fast', 'quality', 'custom'])
export const AiSettingsGetOutput = z.object({
  hasApiKey: z.boolean(),
  model: z.string(),
  textModel: z.string(),
  defaultReasoningEffort: z.enum(['low', 'medium', 'high']).default('medium'),
  provider: AiProvider.default('openai'),
  apiBaseUrl: z.string().url().default('https://api.openai.com/v1'),
  invoiceProfile: AiTaskProfile.default('auto'),
  textProfile: AiTaskProfile.default('auto'),
  proxyMode: AiProxyMode.default('system'),
  proxyUrl: z.string().default(''),
  proxyBypassRules: z.string().default('<local>')
})
export const AiSettingsSetInput = z.object({
  apiKey: z.string().optional(),
  model: z.string().min(1).max(200).optional(),
  textModel: z.string().min(1).max(200).optional(),
  defaultReasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
  provider: AiProvider.optional(),
  apiBaseUrl: z.string().url().optional(),
  invoiceProfile: AiTaskProfile.optional(),
  textProfile: AiTaskProfile.optional(),
  proxyMode: AiProxyMode.optional(),
  proxyUrl: z.string().max(2048).optional(),
  proxyBypassRules: z.string().max(4096).optional()
})
export const AiSettingsSetOutput = z.object({
  ok: z.boolean(),
  hasApiKey: z.boolean(),
  model: z.string(),
  textModel: z.string(),
  defaultReasoningEffort: z.enum(['low', 'medium', 'high']),
  provider: AiProvider,
  apiBaseUrl: z.string().url(),
  invoiceProfile: AiTaskProfile,
  textProfile: AiTaskProfile,
  proxyMode: AiProxyMode,
  proxyUrl: z.string(),
  proxyBypassRules: z.string()
})
export const AiSettingsTestOutput = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  errorCode: z.string().optional(),
  availableModels: z.array(z.string().min(1).max(200)).optional(),
  proxyMode: AiProxyMode.optional(),
  resolvedProxy: z.string().optional(),
  targetUrl: z.string().optional()
})
export const AiMcpStatusOutput = z.object({
  localhostEnabled: z.boolean(),
  running: z.boolean(),
  port: z.number().int().nullable(),
  url: z.string().nullable(),
  token: z.string().nullable(),
  externalConnections: z.number().int().default(0)
})
export const AiMcpConfigureInput = z.object({
  localhostEnabled: z.boolean(),
  port: z.number().int().min(1).max(65535).nullable().optional()
})
export const AiMcpConfigureOutput = AiMcpStatusOutput
export const AiBankImportReviewInput = z
  .object({
    limit: z.number().int().min(1).max(50).default(20).optional(),
    transactionIds: z.array(z.number().int().positive()).min(1).max(50).optional()
  })
  .optional()
export const AiBankImportReviewOutput = AiBankImportReviewResult
export const AiJobsCreateInput = z.object({
  type: AiJobType,
  title: z.string().optional(),
  prompt: z.string().optional(),
  model: z.string().optional(),
  files: z.array(AiJobFileInput).max(20).optional()
})
export const AiJobsCreateOutput = AiJobDetailSchema
export const AiJobsListInput = z
  .object({
    status: z.union([AiJobStatus, z.literal('ALL')]).optional(),
    type: AiJobType.optional(),
    limit: z.number().min(1).max(200).default(100).optional(),
    offset: z.number().min(0).default(0).optional()
  })
  .optional()
export const AiJobsListOutput = z.object({ rows: z.array(AiJobSchema), total: z.number() })
export const AiJobIdInput = z.object({ id: z.number().int().positive() })
export const AiJobsGetOutput = AiJobDetailSchema
export const AiJobsProcessOutput = AiJobDetailSchema
export const AiJobsUpdateCandidateInput = z.object({
  id: z.number().int().positive(),
  result: AiBookingAnalysisResult
})
export const AiJobsApproveCandidateInput = z.object({
  id: z.number().int().positive(),
  candidateIndex: z.number().int().min(0).default(0)
})
export const AiJobsApproveCandidateOutput = z.object({
  ok: z.boolean(),
  voucherId: z.number(),
  voucherNo: z.string()
})
export const AiJobsRejectInput = z.object({
  id: z.number().int().positive(),
  reason: z.string().optional()
})
export const AiJobsDeleteOutput = z.object({ ok: z.boolean() })
export const AiTextGenerateInput = z.object({
  type: z.enum(['INVITATION', 'MEMBER_MESSAGE', 'REPORT_TEXT']),
  prompt: z.string().min(1),
  tone: z.string().optional(),
  audience: z.string().optional(),
  model: z.string().optional()
})
export const AiTextGenerateOutput = AiTextDraftResult
export const AiActionPlanInput = z.object({
  prompt: z.string().min(1),
  conversation: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        title: z.string().optional(),
        body: z.string()
      })
    )
    .default([])
    .optional(),
  model: z.string().optional()
})
export const AiActionPlanOutput = z.object({
  model: z.string(),
  plan: AiActionPlan,
  usage: AiUsageSchema
})

export type TAiJobType = z.infer<typeof AiJobType>
export type TAiJobStatus = z.infer<typeof AiJobStatus>
export type TAiResultKind = z.infer<typeof AiResultKind>
export type TAiTaskProfile = z.infer<typeof AiTaskProfile>
export type TAiJobFileInput = z.infer<typeof AiJobFileInput>
export type TAiBookingCandidate = z.infer<typeof AiBookingCandidate>
export type TAiBookingAnalysisResult = z.infer<typeof AiBookingAnalysisResult>
export type TAiInvoiceExtractionResult = z.infer<typeof AiInvoiceExtractionResult>
export type TLocalOcrExtractInput = z.infer<typeof LocalOcrExtractInput>
export type TLocalOcrExtractOutput = z.infer<typeof LocalOcrExtractOutput>
export type TAiTextDraftResult = z.infer<typeof AiTextDraftResult>
export type TAiActionPlan = z.infer<typeof AiActionPlan>
export type TAiBankImportReviewSuggestion = z.infer<typeof AiBankImportReviewSuggestion>
export type TAiBankImportReviewResult = z.infer<typeof AiBankImportReviewResult>
export type TAiAgentDraft = z.infer<typeof AiAgentDraft>
export type TAiAgentTraceEvent = z.infer<typeof AiAgentTraceEvent>
export type TAiAgentRunInput = z.infer<typeof AiAgentRunInput>
export type TAiAgentRunOutput = z.infer<typeof AiAgentRunOutput>
export type TAiAgentMemoryListInput = z.infer<typeof AiAgentMemoryListInput>
export type TAiAgentMemoryListOutput = z.infer<typeof AiAgentMemoryListOutput>
export type TAiAgentMemoryUpsertInput = z.infer<typeof AiAgentMemoryUpsertInput>
export type TAiAgentAutoRulesListInput = z.infer<typeof AiAgentAutoRulesListInput>
export type TAiAgentAutoRulesListOutput = z.infer<typeof AiAgentAutoRulesListOutput>
export type TAiAgentAutoRuleUpsertInput = z.infer<typeof AiAgentAutoRuleUpsertInput>
export type TAiKnowledgeRulesListInput = z.infer<typeof AiKnowledgeRulesListInput>
export type TAiKnowledgeRulesListOutput = z.infer<typeof AiKnowledgeRulesListOutput>
export type TAiKnowledgeRuleUpsertInput = z.infer<typeof AiKnowledgeRuleUpsertInput>
export type TAiKnowledgeRuleDeleteInput = z.infer<typeof AiKnowledgeRuleDeleteInput>
export type TAiKnowledgeRuleDeleteOutput = z.infer<typeof AiKnowledgeRuleDeleteOutput>
export type TAiUsage = z.infer<typeof AiUsageSchema>
export type TAiInvoiceExtractInput = z.infer<typeof AiInvoiceExtractInput>
export type TAiInvoiceExtractOutput = z.infer<typeof AiInvoiceExtractOutput>
export type TAiInvoiceDuplicateCheckInput = z.infer<typeof AiInvoiceDuplicateCheckInput>
export type TAiInvoiceDuplicateCheckOutput = z.infer<typeof AiInvoiceDuplicateCheckOutput>
export type TAiInvoiceBatchImportInput = z.infer<typeof AiInvoiceBatchImportInput>
export type TAiInvoiceBatchListOutput = z.infer<typeof AiInvoiceBatchListOutput>
export type TAiInvoiceBatchGetOutput = z.infer<typeof AiInvoiceBatchGetOutput>
export type TAiInvoiceBatchApproveInput = z.infer<typeof AiInvoiceBatchApproveInput>
export type TAiSettingsGetOutput = z.infer<typeof AiSettingsGetOutput>
export type TAiSettingsSetInput = z.infer<typeof AiSettingsSetInput>
export type TAiSettingsSetOutput = z.infer<typeof AiSettingsSetOutput>
export type TAiSettingsTestOutput = z.infer<typeof AiSettingsTestOutput>
export type TAiMcpStatusOutput = z.infer<typeof AiMcpStatusOutput>
export type TAiMcpConfigureInput = z.infer<typeof AiMcpConfigureInput>
export type TAiMcpConfigureOutput = z.infer<typeof AiMcpConfigureOutput>
export type TAiBankImportReviewInput = z.infer<typeof AiBankImportReviewInput>
export type TAiBankImportReviewOutput = z.infer<typeof AiBankImportReviewOutput>
export type TAiJobsCreateInput = z.infer<typeof AiJobsCreateInput>
export type TAiJobsCreateOutput = z.infer<typeof AiJobsCreateOutput>
export type TAiJobsListInput = z.infer<typeof AiJobsListInput>
export type TAiJobsListOutput = z.infer<typeof AiJobsListOutput>
export type TAiJobIdInput = z.infer<typeof AiJobIdInput>
export type TAiJobsGetOutput = z.infer<typeof AiJobsGetOutput>
export type TAiJobsProcessOutput = z.infer<typeof AiJobsProcessOutput>
export type TAiJobsUpdateCandidateInput = z.infer<typeof AiJobsUpdateCandidateInput>
export type TAiJobsApproveCandidateInput = z.infer<typeof AiJobsApproveCandidateInput>
export type TAiJobsApproveCandidateOutput = z.infer<typeof AiJobsApproveCandidateOutput>
export type TAiJobsRejectInput = z.infer<typeof AiJobsRejectInput>
export type TAiJobsDeleteOutput = z.infer<typeof AiJobsDeleteOutput>
export type TAiTextGenerateInput = z.infer<typeof AiTextGenerateInput>
export type TAiTextGenerateOutput = z.infer<typeof AiTextGenerateOutput>
export type TAiActionPlanInput = z.infer<typeof AiActionPlanInput>
export type TAiActionPlanOutput = z.infer<typeof AiActionPlanOutput>
