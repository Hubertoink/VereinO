import { registerJournalHandlers } from './journal'
import { assertPublicSetting } from '../services/aiCredentials'
import { MemberHistoryInput, MemberHistoryOutput } from '../../../shared/memberHistory'
import { getMemberHistory } from '../repositories/memberHistory'
import { GroupChangeSchema, MemberAudienceSchema } from '../../../shared/memberGroups'
import { changeMemberGroup, listMemberGroups } from '../repositories/memberGroups'
import { normalizeLookup as normalizeAiLookup } from '../../../shared/textLookup'
import { withBankAiReviewLock } from '../services/bankAiReviewLock'
import { AiImportFileSchema, AiImportCreateSchema, AiImportIdentitySchema, AiImportSaveSchema } from '../../../shared/aiImport'
import type { BankAiReviewProgress } from '../../../shared/bankAiReviewProgress'

import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron'
import { getWidgetAutostart, setWidgetAutostart, type createReceiptWidgetController } from '../services/receiptWidget'
import { DATA_CHANGE_SCOPES, type DataChangeScope } from '../../../shared/dataChange'
import type { DashboardSnapshotInput } from '../../../shared/dashboard'
import { ORGANIZATION_PROFILES, type OrganizationProfile } from '../../../shared/classification'
import { filePayloadToBase64, filePayloadToBuffer } from '../services/filePayload'
import { memberLetterContributionParagraphs } from '../services/memberLetter'
import { getDashboardTasks } from '../services/dashboardTasks'
import { z } from 'zod'
import { currentAiBookingComment } from '../services/aiBookingPolicy'
import { applyBankAiBatchRow, BankAiBatchApplySchema, BankAiBatchPreviewInput, previewBankAiBatch, validateBankAiBatchDraft } from '../services/bankAiBatch'
import {
  clearDashboardSnapshotCache,
  getDashboardSnapshot
} from '../services/dashboardSnapshot'
import {
  VoucherCreateInput,
  VoucherCreateOutput,
  VoucherReverseInput,
  VoucherReverseOutput,
  FiscalReportInput,
  FiscalReportOutput,
  VoucherDeleteInput,
  VoucherDeleteOutput,
  ReportsSummaryInput,
  ReportsSummaryOutput,
  ReportsMonthlyInput,
  ReportsMonthlyOutput,
  ReportsCashBalanceInput,
  ReportsCashBalanceOutput,
  BindingUpsertInput,
  BindingUpsertOutput,
  BindingListInput,
  BindingListOutput,
  BindingDeleteInput,
  BindingDeleteOutput,
  BindingUsageInput,
  BindingUsageOutput,
  BudgetUpsertInput,
  BudgetUpsertOutput,
  BudgetListInput,
  BudgetListOutput,
  BudgetDeleteInput,
  BudgetDeleteOutput,
  QuoteWeeklyInput,
  QuoteWeeklyOutput,
  ImportPreviewInput,
  ImportPreviewOutput,
  ImportExecuteInput,
  ImportExecuteOutput,
  ImportAnalyzeInput,
  ImportAnalyzeOutput,
  ImportCommitDraftInput,
  ImportCreateMissingInput,
  ImportCreateMissingOutput,
  ImportTemplateInput,
  ImportTemplateOutput,
  ImportTestDataInput,
  ImportTestDataOutput,
  ImportEditableExportInput,
  ImportEditableExportOutput,
  AttachmentsListInput,
  AttachmentsListOutput,
  AttachmentOpenInput,
  AttachmentOpenOutput,
  AttachmentSaveAsInput,
  AttachmentSaveAsOutput,
  AttachmentReadInput,
  AttachmentReadOutput,
  AttachmentAddInput,
  AttachmentAddOutput,
  AttachmentDeleteInput,
  AttachmentDeleteOutput,
  VouchersClearAllInput,
  VouchersClearAllOutput,
  TagsListInput,
  TagsListOutput,
  TagUpsertInput,
  TagUpsertOutput,
  TagDeleteInput,
  TagDeleteOutput,
  TagUsageInput,
  TagUsageOutput,
  ReportsYearsOutput,
  BudgetUsageInput,
  BudgetUsageOutput,
  SettingsGetInput,
  SettingsGetOutput,
  SettingsSetInput,
  SettingsSetOutput,
  VouchersRecentInput,
  VouchersRecentOutput,
  VouchersBatchAssignEarmarkInput,
  VouchersBatchAssignEarmarkOutput,
  VouchersBatchAssignBudgetInput,
  VouchersBatchAssignBudgetOutput,
  VouchersBatchAssignTagsInput,
  VouchersBatchAssignTagsOutput,
  InvoiceCreateInput,
  InvoiceCreateOutput,
  InvoiceUpdateInput,
  InvoiceUpdateOutput,
  InvoiceDeleteInput,
  InvoiceDeleteOutput,
  InvoicesListInput,
  InvoicesListOutput,
  InvoiceByIdInput,
  InvoiceByIdOutput,
  InvoiceAddPaymentInput,
  InvoiceAddPaymentOutput,
  InvoicePostToVoucherInput,
  InvoicePostToVoucherOutput,
  InvoiceFilesListInput,
  InvoiceFilesListOutput,
  InvoiceFileAddInput,
  InvoiceFileAddOutput,
  InvoiceFileDeleteInput,
  InvoiceFileDeleteOutput,
  YearEndPreviewInput,
  YearEndPreviewOutput,
  YearEndExportInput,
  YearEndExportOutput,
  YearEndCloseInput,
  YearEndCloseOutput,
  YearEndReopenInput,
  YearEndReopenOutput,
  YearEndStatusOutput,
  InvoicesSummaryInput,
  InvoicesSummaryOutput,
  MembersListInput,
  MembersListOutput,
  MemberCreateInput,
  MemberCreateOutput,
  MemberUpdateInput,
  MemberUpdateOutput,
  MemberDeleteInput,
  MemberDeleteOutput,
  MemberGetInput,
  MemberGetOutput,
  PaymentsListDueInput,
  ContributionPaymentInput,
  PaymentsListDueOutput,
  ContributionBookingInput,
  PaymentsMarkPaidInput,
  PaymentsMarkPaidOutput,
  PaymentsUnmarkInput,
  PaymentsUnmarkOutput,
  PaymentsSuggestVouchersInput,
  PaymentsSuggestVouchersOutput,
  PaymentsDueSummaryOutput,
  TaxExemptionGetOutput,
  TaxExemptionSaveInput,
  TaxExemptionSaveOutput,
  TaxExemptionDeleteOutput,
  TaxExemptionUpdateValidityInput,
  TaxExemptionUpdateValidityOutput,
  DonationsExportMoneyReceiptInput,
  DonationsExportMoneyReceiptOutput,
  CashChecksListInput,
  CashChecksListOutput,
  CashChecksCreateInput,
  CashChecksCreateOutput,
  CashChecksSetInspectorsInput,
  CashChecksSetInspectorsOutput,
  CashChecksExportPdfInput,
  CashChecksExportPdfOutput,
  CashChecksGetInspectorDefaultsOutput,
  LocalOcrExtractInput,
  LocalOcrExtractOutput
} from './schemas'
import {
  RecurringBookingActionInput,
  RecurringBookingBookInput,
  RecurringBookingBookOutput,
  RecurringBookingLinkInput,
  RecurringBookingLinkOutput,
  RecurringBookingSkipOutput,
  RecurringBookingsListInput,
  RecurringBookingsListOutput,
  RecurringBookingsSummaryOutput,
  RecurringBookingStatusInput,
  RecurringBookingStatusOutput,
  RecurringBookingUpsertInput,
  RecurringBookingUpsertOutput
} from './schemas'
import {
  AiActionPlanInput,
  AiActionPlanOutput,
  AiAgentAutoRuleUpsertInput,
  AiAgentAutoRulesListInput,
  AiAgentAutoRulesListOutput,
  AiAgentMemoryListInput,
  AiAgentMemoryListOutput,
  AiAgentMemoryUpsertInput,
  AiAgentRunInput,
  AiAgentRunOutput,
  AiKnowledgeRuleDeleteInput,
  AiKnowledgeRuleDeleteOutput,
  AiKnowledgeRulesListInput,
  AiKnowledgeRulesListOutput,
  AiKnowledgeRuleUpsertInput,
  AiBankImportReviewInput,
  AiBankImportReviewOutput,
  AiBookingAnalysisResult,
  AiInvoiceDuplicateCheckInput,
  AiInvoiceDuplicateCheckOutput,
  AiInvoiceExtractInput,
  AiInvoiceExtractOutput,
  AiInvoiceBatchActionOutput,
  AiInvoiceBatchApproveInput,
  AiInvoiceBatchGetOutput,
  AiInvoiceBatchIdInput,
  AiInvoiceBatchImportInput,
  AiInvoiceBatchListOutput,
  AiJobIdInput,
  AiJobsApproveCandidateInput,
  AiJobsApproveCandidateOutput,
  AiJobsCreateInput,
  AiJobsCreateOutput,
  AiJobsDeleteOutput,
  AiJobsGetOutput,
  AiJobsListInput,
  AiJobsListOutput,
  AiJobsProcessOutput,
  AiJobsRejectInput,
  AiJobsUpdateCandidateInput,
  AiMcpConfigureInput,
  AiMcpConfigureOutput,
  AiMcpStatusOutput,
  AiProvider,
  AiSettingsGetOutput,
  AiSettingsSetInput,
  AiSettingsSetOutput,
  AiSettingsTestOutput,
  AiTextGenerateInput,
  AiTextGenerateOutput
} from './schemas'
import {
  getDb,
  getAppDataDir,
  closeDb,
  getCurrentDbInfo,
  migrateToRoot,
  assertStorageMoveIdle,
  readAppConfig,
  listOrganizations,
  getActiveOrganization,
  createOrganization,
  setOrganizationConfigProfile,
  switchOrganization,
  renameOrganization,
  deleteOrganization,
  getOrganizationAppearance,
  setOrganizationAppearance,
  getActiveOrganizationAppearance
} from '../db/database'
import { validateOrganizationStorageTarget } from '../db/organizationStorage'
import {
  createVoucher,
  reverseVoucher,
  listRecentVouchers,
  deleteVoucher,
  summarizeVouchers,
  monthlyVouchers,
  dailyVouchers,
  cashBalance,
  listFilesForVoucher,
  getFileById,
  addFileToVoucher,
  deleteVoucherFile,
  clearAllVouchers,
  listVoucherYears,
  batchAssignEarmark,
  batchAssignBudget,
  batchAssignTags
} from '../repositories/vouchers'
import {
  createInvoice,
  updateInvoice,
  deleteInvoice,
  listInvoicesPaged,
  summarizeInvoices,
  getInvoiceById,
  addPayment,
  markPaid,
  postInvoiceToVoucher,
  getInvoiceFileById,
  listFilesForInvoice,
  addFileToInvoice,
  deleteInvoiceFile
} from '../repositories/invoices'
import { listTags, upsertTag, deleteTag, tagUsage } from '../repositories/tags'
import {
  listMembers,
  memberAudience,
  createMember,
  updateMember,
  deleteMember,
  getMemberById
} from '../repositories/members'
import type { MembersExportOptions } from '../services/membersExport'
import { listBindings, upsertBinding, deleteBinding, bindingUsage } from '../repositories/bindings'
import { upsertBudget, listBudgets, deleteBudget, budgetUsage } from '../repositories/budgets'
import {
  bookRecurringOccurrence,
  linkRecurringOccurrence,
  listRecurringBookings,
  recurringBookingsSummary,
  setRecurringBookingStatus,
  skipRecurringOccurrence,
  upsertRecurringBooking
} from '../repositories/recurringBookings'
import {
  listAdvances,
  createAdvance,
  getAdvanceById,
  settleAdvance,
  deleteAdvance,
  addAdvancePurchase,
  deleteAdvancePurchase,
  updateAdvancePurchase,
  resolveAdvance
} from '../repositories/advances'
import {
  listCashChecks,
  createCashCheck,
  setCashCheckInspectors,
  getCashCheckInspectorDefaults
} from '../repositories/cashChecks'
import { generateCashCheckPDF } from '../services/cashCheckReport'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { getSetting, setSetting } from '../services/settings'
import {
  getTaxExemptionCertificate,
  saveTaxExemptionCertificate,
  deleteTaxExemptionCertificate,
  updateTaxExemptionValidity
} from '../services/taxExemption'
import { getWeeklyQuote } from '../services/quotes'

import { storeAccountOpening, previewOpeningVoucher } from '../repositories/accountOpenings'
import { DbExportInput, DbExportOutput, DbImportInput, DbImportFromPathInput, DbImportFromPathOutput } from './schemas';
import {
  AccountOpeningChanges,
  SetupAccountsInput,
  OpeningVoucherInput,
  PaymentAccountsListInput,
  PaymentAccountsListOutput,
  PaymentAccountUpsertInput,
  PaymentAccountUpsertOutput,
  PaymentAccountDeleteInput,
  PaymentAccountDeleteOutput,
  PartiesListInput,
  PartiesListOutput,
  PartyGetInput,
  PartyGetOutput,
  PartyUpsertInput,
  PartyUpsertOutput,
  PartyArchiveInput,
  PartyArchiveOutput
} from './schemas'
import {
  applyMigrations,
  ensureAdvanceTables,
  ensureAiTables,
  ensureInvoiceTables,
  ensureVoucherColumns,
  ensureVoucherForeignKeyTargets
} from '../db/migrations'
import { listRecentAudit } from '../repositories/audit'
import {
  createGeneralClassificationValue,
  getOrganizationProfile,
  canChangeOrganizationProfile,
  getOrganizationProfileDefinition,
  getPrimaryClassificationScheme,
  listPrimaryClassificationValues,
  setOrganizationProfile,
  updateGeneralClassificationValue
} from '../repositories/classifications'
import {
  AuditRecentInput,
  AuditRecentOutput,
} from './schemas'
import * as backup from '../services/backup'
import { bookContribution } from '../repositories/contributionBooking'
import * as mp from '../repositories/members_payments'
import { membershipBankCandidates } from '../services/bankMembership'
import {
  previewContributionPayment,
  allocateContributionPayment,
  contributionPeriods,
  removeContributionReceipt,
  availableContributionVouchers
} from '../repositories/membershipLedger'
import { exportMoneyDonationReceiptPdf } from '../services/donationReceipt'
import {
  AdvancesListInput,
  AdvancesListOutput,
  AdvanceCreateInput,
  AdvanceCreateOutput,
  AdvanceGetInput,
  AdvanceGetOutput,
  AdvanceSettleInput,
  AdvanceSettleOutput,
  AdvanceDeleteInput,
  AdvanceDeleteOutput,
  AdvancePurchaseCreateInput,
  AdvancePurchaseCreateOutput,
  AdvancePurchaseDeleteInput,
  AdvancePurchaseDeleteOutput,
  AdvancePurchaseUpdateInput,
  AdvancePurchaseUpdateOutput,
  AdvanceResolveInput,
  AdvanceResolveOutput
} from './schemas'
import {
  ActivityReportDeleteInput,
  ActivityReportDeleteOutput,
  ActivityReportGetInput,
  ActivityReportGetOutput,
  ActivityReportListInput,
  ActivityReportListOutput,
  ActivityReportSaveInput,
  ActivityReportSaveOutput
} from './schemas'
import {
  deleteActivityReport,
  getActivityReport,
  listActivityReports,
  saveActivityReport,
  validateActivityReport
} from '../repositories/activityReports'
import {
  checkForAppUpdates,
  downloadAppUpdate,
  getUpdateState,
  installAppUpdate
} from '../updateManager'
import {
  deletePaymentAccount,
  listPaymentAccounts,
  configureSetupAccounts,
  upsertPaymentAccount
} from '../repositories/paymentAccounts'
import { archiveParty, getParty, listParties, upsertParty } from '../repositories/parties'
import { requireSafetyBackup } from '../services/safetyBackup'
import { registerBackupAndShellHandlers } from './backupAndShellHandlers'
import {
  BankImportCommitInput,
  BankImportCommitOutput,
  BankImportHistoryInput,
  BankImportHistoryOutput,
  BankImportPreviewInput,
  BankImportPreviewOutput,
  BankImportRemapPreviewInput,
  BankImportRemapPreviewOutput,
  BankImportRemapApplyInput,
  BankImportRemapApplyOutput,
  BankImportStatusOutput,
  BankTransactionCheckInput,
  BankTransactionIdInput,
  BankTransactionLinkInput,
  BankTransactionMatchesInput,
  BankTransactionMatchesOutput,
  BankTransactionOutput,
  BankTransactionsListInput,
  BankTransactionsListOutput
} from './schemas'
import {
  commitBankImport,
  findBankTransactionMatches,
  getBankImportStatus,
  listBankImportHistory,
  getBankTransaction,
  linkBankTransaction,
  listBankTransactions,
  markBankTransactionChecked,
  previewBankImport,
  reopenBankTransaction,
  saveBankTransactionAiSuggestions
} from '../repositories/bankTransactions'
import { applyBankImportRemap, previewBankImportRemap } from '../repositories/bankImportRemap'
import {
  createAiJob,
  deleteAiJob,
  getAiJob,
  listAiJobs,
  rejectAiJob,
  saveAiJobResult,
  setAiJobStatus,
  updateAiJobCandidate
} from '../repositories/aiJobs'
import {
  deleteAiKnowledgeRule,
  listAiAgentAutoRules,
  listAiAgentMemory,
  listAiKnowledgeRules,
  upsertAiAgentAutoRule,
  upsertAiAgentMemory,
  upsertAiKnowledgeRule
} from '../repositories/aiAgentKnowledge'

const loadAiService = () => import('../services/ai')
const loadAiContextService = () => import('../services/aiContext')
const loadAiAgentService = () => import('../services/aiAgent')
const loadAiMcpService = () => import('../services/aiMcp')
const loadImportsService = () => import('../services/imports')
const loadMembersExportService = () => import('../services/membersExport')
const loadYearEndService = () => import('../services/yearEnd')

function isMissingSchemaError(error: unknown, identifiers: string[]): boolean {
  const message = String((error as any)?.message ?? '')
  if (message.includes('no such table:')) {
    return identifiers.some((identifier) => message.includes(`no such table: ${identifier}`))
  }
  if (message.includes('no such column:') || message.includes('has no column named')) {
    return identifiers.some((identifier) => {
      const bareIdentifier = identifier.includes('.')
        ? (identifier.split('.').pop() ?? identifier)
        : identifier
      return (
        message.includes(`no such column: ${identifier}`) ||
        message.includes(`no such column: ${bareIdentifier}`) ||
        message.includes(`has no column named ${bareIdentifier}`) ||
        message.includes(`no such column: v.${bareIdentifier}`)
      )
    })
  }
  return false
}

async function withSchemaHealRetry<T>(run: () => T, schemaIdentifiers: string[]): Promise<T> {
  try {
    return run()
  } catch (error) {
    if (!isMissingSchemaError(error, schemaIdentifiers)) throw error
    try {
      const db = getDb()
      ensureVoucherColumns(db as any)
      ensureAdvanceTables(db as any)
      ensureAiTables(db as any)
      ensureInvoiceTables(db as any)
      applyMigrations(db as any)
    } catch {}

    try {
      return run()
    } catch (retryError) {
      if (isMissingSchemaError(retryError, schemaIdentifiers)) {
        throw new Error(
          'Die Datenbankstruktur war unvollständig und konnte nicht automatisch repariert werden. Bitte App neu starten und erneut versuchen.'
        )
      }
      throw retryError
    }
  }
}

function normalizeAiSourceLookup(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function extractCandidateSourceIndex(candidate: any) {
  const candidates = [candidate?.source?.fileName, candidate?.source?.label]
  for (const value of candidates) {
    const match = String(value || '').match(/\bquelle\s*(\d+)\b/i)
    if (match) {
      const index = Number(match[1]) - 1
      if (Number.isInteger(index) && index >= 0) return index
    }
  }
  return null
}

function resolveAiSourceFile(
  jobFiles: Array<{ fileName: string; dataBase64?: string; mimeType?: string | null }>,
  candidate: any,
  candidateIndex?: number
) {
  const sourceFileName = String(candidate?.source?.fileName || '').trim()
  if (sourceFileName) {
    const exact = jobFiles.find((file) => file.fileName === sourceFileName)
    if (exact) return exact
    const normalized = normalizeAiSourceLookup(sourceFileName)
    const fuzzy = normalized
      ? jobFiles.find((file) => normalizeAiSourceLookup(file.fileName) === normalized)
      : null
    if (fuzzy) return fuzzy
  }
  const sourceIndex = extractCandidateSourceIndex(candidate)
  if (sourceIndex != null && jobFiles[sourceIndex]) return jobFiles[sourceIndex]
  if (!candidate?.source?.fileName && !candidate?.source?.label && jobFiles.length === 1)
    return jobFiles[0]
  if (
    !candidate?.source?.fileName &&
    !candidate?.source?.label &&
    candidateIndex != null &&
    jobFiles.length > candidateIndex
  )
    return jobFiles[candidateIndex]
  return null
}

function normalizeAiCandidateSources(
  jobFiles: Array<{ fileName: string; dataBase64?: string; mimeType?: string | null }>,
  result: any
) {
  if (!Array.isArray(result?.candidates)) return result
  return {
    ...result,
    candidates: result.candidates.map((candidate: any, candidateIndex: number) => {
      const matchedFile = resolveAiSourceFile(jobFiles, candidate, candidateIndex)
      if (!matchedFile) return candidate
      const pageNumber = candidate?.source?.pageNumber ?? null
      const pageCount = candidate?.source?.pageCount ?? null
      return {
        ...candidate,
        source: {
          fileName: matchedFile.fileName,
          pageNumber,
          pageCount,
          label:
            pageNumber && pageCount
              ? `${matchedFile.fileName} · Seite ${pageNumber} von ${pageCount}`
              : matchedFile.fileName
        }
      }
    })
  }
}

function filesForAiCandidate(
  jobFiles: Array<{ fileName: string; dataBase64?: string; mimeType?: string | null }>,
  candidate: any
) {
  const matchedFile = resolveAiSourceFile(jobFiles, candidate)
  return matchedFile ? [matchedFile] : jobFiles
}

type RegisterIpcHandlersOptions = {
  receiptWidget?: ReturnType<typeof createReceiptWidgetController>
  showMainWindow?: () => { ok: boolean }
  openDetachedQuickAdd?: (initialState?: any) => Promise<{ ok: boolean; token: string }>
  focusDetachedQuickAdd?: (draftId: string) => { ok: boolean }
  closeDetachedQuickAdd?: (draftId: string) => { ok: boolean }
  hasDetachedQuickAdds?: () => boolean
  requestCloseDetachedQuickAdds?: (
    mainWindow?: BrowserWindow | null,
    confirmed?: boolean
  ) => { ok: boolean; count: number }
  cancelPendingMainClose?: () => { ok: boolean }
  getDetachedQuickAddInitial?: (token: string) => any
  notifyQuickAddSaved?: (payload?: any) => void
}



function paymentMethodForAiAccountKind(kind?: string | null): 'BAR' | 'BANK' | null {
  if (kind === 'CASH') return 'BAR'
  if (kind === 'BANK' || kind === 'PAYPAL' || kind === 'CARD' || kind === 'OTHER') return 'BANK'
  return null
}

function findAiPaymentAccountHint(prompt: string, paymentAccounts: any[]) {
  const normalizedPrompt = normalizeAiLookup(prompt)
  if (!normalizedPrompt) return null
  const candidates = (paymentAccounts || [])
    .filter((account) => account?.isActive !== 0)
    .map((account) => ({ account, normalizedName: normalizeAiLookup(account.name) }))
    .filter((item) => item.normalizedName && normalizedPrompt.includes(item.normalizedName))
    .sort((a, b) => b.normalizedName.length - a.normalizedName.length)
  return candidates[0]?.account || null
}

function shouldApplyPaymentHintToAll(prompt: string) {
  const normalizedPrompt = normalizeAiLookup(prompt)
  return /(alle|allen|jede|jeden|saemtliche|samtliche|immer|standard|default|grundsaetzlich|grundsatzlich|nicht anders angegeben|gehen diese auf|sollen auf|soll bei allen)/.test(
    normalizedPrompt
  )
}

function applyPaymentAccountHintToAiAnalysis(result: any, prompt: string, paymentAccounts: any[]) {
  const account = findAiPaymentAccountHint(prompt, paymentAccounts)
  if (!account || !Array.isArray(result?.candidates)) return result
  const paymentMethod = paymentMethodForAiAccountKind(account.kind)
  const applyAll = shouldApplyPaymentHintToAll(prompt)
  let changed = false
  const nextCandidates = result.candidates.map((candidate: any) => {
    if (!applyAll && candidate.paymentAccountId) return candidate
    changed = true
    return {
      ...candidate,
      paymentAccountId: Number(account.id),
      paymentMethod,
      warnings: (candidate.warnings || []).filter(
        (warning: string) =>
          !/kein konto|kein zahlungsweg|zahlung.*platzhalter/i.test(String(warning))
      )
    }
  })
  if (!changed) return result
  return {
    ...result,
    candidates: nextCandidates,
    warnings: [
      ...(result.warnings || []),
      `Zahlungskonto aus Nutzerhinweis gesetzt: ${account.name}.`
    ]
  }
}

function notifyDataChanged(scopes?: DataChangeScope[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('app:data-changed', scopes)
    } catch {}
  }
}

import { registerReimbursementHandlers } from './reimbursements'
import { registerMembersImportHandlers } from './membersImport'

export function registerIpcHandlers(options: RegisterIpcHandlersOptions = {}) {
  registerReimbursementHandlers()
  registerMembersImportHandlers(() => notifyDataChanged(['members']))
  ipcMain.handle('receiptWidget.open', () => options.receiptWidget?.open() ?? { ok: false })
  ipcMain.handle('receiptWidget.close', () => options.receiptWidget?.close() ?? { ok: false })
  ipcMain.handle('receiptWidget.showMain', () => options.showMainWindow?.() ?? { ok: false })
  ipcMain.handle('receiptWidget.state', () => options.receiptWidget?.state() ?? { expanded: false, edge: 'right' })
  ipcMain.handle('receiptWidget.setExpanded', (event, expanded: unknown) => {
    if (typeof expanded !== 'boolean' || event.sender !== options.receiptWidget?.window?.webContents) throw new Error('Ungültige Widget-Anfrage.')
    return options.receiptWidget.setExpanded(expanded)
  })
  ipcMain.handle('receiptWidget.move', (event, finished: unknown) => {
    if (typeof finished !== 'boolean' || event.sender !== options.receiptWidget?.window?.webContents) throw new Error('Ungültige Widget-Anfrage.')
    return finished ? options.receiptWidget.finishMove() : options.receiptWidget.moveToCursor()
  })
  ipcMain.handle('receiptWidget.getAutostart', () => getWidgetAutostart())
  ipcMain.handle('receiptWidget.setAutostart', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('Ungültige Autostart-Einstellung.')
    return setWidgetAutostart(enabled)
  })
  registerBackupAndShellHandlers()
  const getCurrentWindow = () =>
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null

  // App info
  ipcMain.handle('app.version', async () => {
    try {
      return { version: app.getVersion(), name: app.getName() }
    } catch {
      return { version: '0.0.0', name: 'VereinO' }
    }
  })
  ipcMain.handle('app.bootstrap', async () => withSchemaHealRetry(() => {
    const bankImports = listBankTransactions({ status: 'OPEN', limit: 1, page: 1 }) as any
    const openInvoices = listInvoicesPaged({ status: 'OPEN', limit: 1 })
    const partialInvoices = listInvoicesPaged({ status: 'PARTIAL', limit: 1 })
    const membership = mp.dueSummary()
    const recurring = recurringBookingsSummary()
    const lock = getSetting<{ closedUntil?: string | null }>('period_lock')

    return {
      counts: {
        openBankImports: Number(bankImports?.stats?.open || bankImports?.total || 0),
        dueMembershipFees: Number(membership?.dueMembers || 0),
        openInvoices: Number(openInvoices.total || 0) + Number(partialInvoices.total || 0),
        dueRecurringBookings: recurring.due
      },
      years: listVoucherYears(),
      earmarks: listBindings({ activeOnly: true }),
      paymentAccounts: listPaymentAccounts(),
      tags: listTags({ includeUsage: true }),
      periodLock: { closedUntil: lock?.closedUntil ?? null },
      backup: {
        mode: String(getSetting<string>('backup.auto') || 'PROMPT').toUpperCase(),
        intervalDays: Number(getSetting<number>('backup.intervalDays') || 7),
        lastAuto: Number(getSetting<number>('backup.lastAuto') || 0)
      }
    }
  }, ['invoices', 'i.party_id']))
  ipcMain.handle('app.dashboardSnapshot', async (_event, payload: DashboardSnapshotInput) => {
    return getDashboardSnapshot(payload)
  })
  ipcMain.handle('app.dashboardTasks', async (_event, payload: { today: string }) => {
    const today = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(payload?.today)
    return getDashboardTasks(today)
  })
  ipcMain.handle('updates.getState', async () => getUpdateState())
  ipcMain.handle('updates.check', async () => checkForAppUpdates())
  ipcMain.handle('updates.download', async () => downloadAppUpdate())
  ipcMain.handle('updates.install', async () => installAppUpdate())
  // Window controls (frameless)
  ipcMain.handle('window.minimize', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
    return { ok: true }
  })
  ipcMain.handle('window.toggleMaximize', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
      return { ok: true, isMaximized: win.isMaximized() }
    }
    return { ok: false }
  })
  ipcMain.handle('window.close', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
    return { ok: true }
  })
  ipcMain.handle('window.confirmClose', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { ok: false }
    if (!(win as any).__isDetachedQuickAddWindow && options.hasDetachedQuickAdds?.()) {
      const requested = options.requestCloseDetachedQuickAdds?.(win, true)
      if (requested?.count) return { ok: true, pendingDetached: requested.count }
    }
    try {
      ;(win as any).__allowRendererClose?.()
    } catch {}
    win.close()
    return { ok: true }
  })
  ipcMain.handle('window.cancelClose', async () => {
    return options.cancelPendingMainClose?.() ?? { ok: true }
  })
  ipcMain.handle('window.setInvoiceScanExpanded', async (event, expanded: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !(win as any).__isDetachedQuickAddWindow) return { ok: false }
    win.setSize(expanded ? 1240 : 760, expanded ? 760 : 600, true)
    win.center()
    return { ok: true }
  })
  ipcMain.handle('window.isMaximized', async () => {
    const win = getCurrentWindow()
    return { isMaximized: !!win?.isMaximized() }
  })
  ipcMain.handle('quickAdd.openDetached', async (_e, payload) => {
    if (!options.openDetachedQuickAdd) return { ok: false, error: 'Abdocken ist nicht verfügbar.' }
    return options.openDetachedQuickAdd(payload || null)
  })
  ipcMain.handle('quickAdd.detachedInitial', async (_e, payload: { token?: string }) => {
    const token = String(payload?.token || '')
    return {
      initial:
        token && options.getDetachedQuickAddInitial
          ? options.getDetachedQuickAddInitial(token)
          : null
    }
  })
  ipcMain.handle('quickAdd.focusDetached', async (_e, payload: { draftId?: string }) => {
    const draftId = String(payload?.draftId || '')
    return draftId && options.focusDetachedQuickAdd
      ? options.focusDetachedQuickAdd(draftId)
      : { ok: false }
  })
  ipcMain.handle('quickAdd.closeDetached', async (_e, payload: { draftId?: string }) => {
    const draftId = String(payload?.draftId || '')
    return draftId && options.closeDetachedQuickAdd
      ? options.closeDetachedQuickAdd(draftId)
      : { ok: false }
  })
  ipcMain.handle('quickAdd.notifySaved', async (_e, payload) => {
    try {
      options.notifyQuickAddSaved?.(payload || {})
    } catch {}
    return { ok: true }
  })
  ipcMain.handle('quickAdd.syncDraft', async (_e, payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send('quickAdd:detachedDraftSync', payload || {})
      } catch {}
    }
    return { ok: true }
  })
  ipcMain.on('app.notifyDataChanged', async (_event, scopes?: unknown) => {
    const validScopes = Array.isArray(scopes)
      ? scopes.filter((scope): scope is DataChangeScope => DATA_CHANGE_SCOPES.includes(scope as DataChangeScope))
      : undefined
    clearDashboardSnapshotCache(validScopes)
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send('app:data-changed', validScopes)
      } catch {}
    }
  })
  ipcMain.handle('ai.settings.get', async (_event, provider) => {
    const { getAiSettings } = await loadAiService()
    return AiSettingsGetOutput.parse(getAiSettings(AiProvider.optional().parse(provider)))
  })
  ipcMain.handle('clipboard.readImage', async (event) => {
    if (!BrowserWindow.fromWebContents(event.sender)?.isFocused()) return null
    const { readClipboardImage } = await import('../services/clipboardImage')
    return readClipboardImage()
  })
  ipcMain.handle('ai.settings.set', async (_e, payload) => {
    const parsed = AiSettingsSetInput.parse(payload)
    const { setAiSettings } = await loadAiService()
    return AiSettingsSetOutput.parse(setAiSettings(parsed))
  })
  ipcMain.handle('ai.settings.testConnection', async () => {
    const { testAiConnection } = await loadAiService()
    return AiSettingsTestOutput.parse(await testAiConnection())
  })
  ipcMain.handle('ai.invoice.extract', async (event, payload) => {
    const startedAt = Date.now()
    const senderFrame = event.senderFrame
    const senderUrl = senderFrame?.url || ''
    const isTrustedRenderer =
      senderFrame === event.sender.mainFrame &&
      (senderUrl.startsWith('file:') ||
        /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(senderUrl))
    if (!isTrustedRenderer) throw new Error('Nicht erlaubter KI-Aufruf.')

    const parsed = AiInvoiceExtractInput.parse(payload)
    const [{ analyzeInvoiceDocument }, { buildAiInvoiceContext }, { extractWithDocling, getDoclingStatus }] = await Promise.all([
      loadAiService(),
      loadAiContextService(),
      import('../services/docling')
    ])
    let localDocumentText = parsed.localDocumentText?.trim() || ''
    let doclingMs: number | null = null
    let doclingStartedAt: number | null = null
    try {
      if ((await getDoclingStatus()).enabled) {
        doclingStartedAt = Date.now()
        const doclingText = (await extractWithDocling({
          fileName: parsed.file.fileName,
          mimeType: parsed.file.mimeType,
          dataBase64: filePayloadToBase64(parsed.file)
        })).text.trim()
        localDocumentText = [localDocumentText, doclingText].filter(Boolean).join('\n\n')
      }
    } catch (error) {
      // Docling is supplementary. The normal document/OCR path can still
      // analyze the invoice when a local extraction fails.
      console.warn('[Invoice] Optionale Docling-Vorverarbeitung fehlgeschlagen:', error)
    } finally {
      if (doclingStartedAt !== null) doclingMs = Date.now() - doclingStartedAt
    }
    const analyzed = await analyzeInvoiceDocument({
      file: {
        fileName: parsed.file.fileName,
        mimeType: parsed.file.mimeType,
        dataBase64: filePayloadToBase64(parsed.file)
      },
      context: buildAiInvoiceContext(),
      localDocumentText,
      embeddedPdfPagesRead: parsed.embeddedPdfPagesRead,
      guidance: parsed.guidance
    })
    return AiInvoiceExtractOutput.parse({
      ...analyzed,
      timings: {
        ...analyzed.timings,
        totalMs: Date.now() - startedAt,
        doclingMs
      }
    })
  })
  ipcMain.handle('ai.invoice.checkDuplicate', async (event, payload) => {
    const senderFrame = event.senderFrame
    const senderUrl = senderFrame?.url || ''
    const isTrustedRenderer =
      senderFrame === event.sender.mainFrame &&
      (senderUrl.startsWith('file:') ||
        /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(senderUrl))
    if (!isTrustedRenderer) throw new Error('Nicht erlaubter KI-Aufruf.')

    const parsed = AiInvoiceDuplicateCheckInput.parse(payload)
    const { findSavedVoucherDuplicate } = await import('../services/invoiceBatchQueue')
    const duplicate = await findSavedVoucherDuplicate(filePayloadToBuffer(parsed.file))
    return AiInvoiceDuplicateCheckOutput.parse({
      isDuplicate: !!duplicate,
      duplicateVoucherId: duplicate?.voucherId ?? null,
      duplicateVoucherNo: duplicate?.voucherNo ?? null
    })
  })
  ipcMain.handle('ai.invoiceBatch.list', async () => {
    const { listInvoiceBatchItems, scanInvoiceSubmitDirectory } = await import('../services/invoiceBatchQueue')
    await scanInvoiceSubmitDirectory()
    return AiInvoiceBatchListOutput.parse(await listInvoiceBatchItems())
  })
  ipcMain.handle('ai.invoiceBatch.get', async (_event, payload) => {
    const parsed = AiInvoiceBatchIdInput.parse(payload)
    const { getInvoiceBatchItem } = await import('../services/invoiceBatchQueue')
    return AiInvoiceBatchGetOutput.parse(getInvoiceBatchItem(parsed.id))
  })
  ipcMain.handle('ai.invoiceBatch.import', async (_event, payload) => {
    const parsed = AiInvoiceBatchImportInput.parse(payload)
    const { importInvoiceBatchFiles } = await import('../services/invoiceBatchQueue')
    return importInvoiceBatchFiles(parsed.files, parsed.guidance)
  })
  ipcMain.handle('ai.invoiceBatch.retry', async (_event, payload) => {
    const parsed = AiInvoiceBatchIdInput.parse(payload)
    const { retryInvoiceBatchItem } = await import('../services/invoiceBatchQueue')
    return AiInvoiceBatchActionOutput.parse(retryInvoiceBatchItem(parsed.id))
  })
  ipcMain.handle('ai.invoiceBatch.approve', async (_event, payload) => {
    const parsed = AiInvoiceBatchApproveInput.parse(payload)
    const { approveInvoiceBatchItem } = await import('../services/invoiceBatchQueue')
    return AiInvoiceBatchActionOutput.parse(await approveInvoiceBatchItem(parsed.id, parsed.voucherId))
  })
  ipcMain.handle('ai.invoiceBatch.discard', async (_event, payload) => {
    const parsed = AiInvoiceBatchIdInput.parse(payload)
    const { discardInvoiceBatchItem } = await import('../services/invoiceBatchQueue')
    return AiInvoiceBatchActionOutput.parse(await discardInvoiceBatchItem(parsed.id))
  })
  ipcMain.handle('ai.invoiceBatch.openFolder', async () => {
    const { openInvoiceSubmitDirectory } = await import('../services/invoiceBatchQueue')
    return openInvoiceSubmitDirectory()
  })
  ipcMain.handle('ai.mcp.status', async () => {
    const { getAiMcpStatus } = await loadAiMcpService()
    return AiMcpStatusOutput.parse(await getAiMcpStatus())
  })
  ipcMain.handle('ai.mcp.configure', async (_e, payload) => {
    const parsed = AiMcpConfigureInput.parse(payload)
    const { configureAiMcpEndpoint } = await loadAiMcpService()
    return AiMcpConfigureOutput.parse(await configureAiMcpEndpoint(parsed))
  })
  ipcMain.handle('ai.bankImports.reviewOpen', async (event, payload) => {
    const parsed = AiBankImportReviewInput.parse(payload)
    const transactionIds = parsed?.transactionIds
    const limit = transactionIds?.length || Math.max(1, Math.min(50, Number(parsed?.limit || 20)))
    const openRows = (
      listBankTransactions({
        status: 'OPEN',
        ids: transactionIds,
        sortBy: 'date',
        sortDir: 'DESC',
        page: 1,
        limit
      }) as any
    ).rows as any[]
    if (!openRows.length) {
      return AiBankImportReviewOutput.parse({
        suggestions: [],
        summary: 'Keine offenen Bankbelege für die KI-Prüfung gefunden.',
        warnings: []
      })
    }
    const reviewDb = getDb()
    return withBankAiReviewLock(reviewDb, openRows.map(row => Number(row.id)), async () => {
      const ids = openRows.map(row => Number(row.id))
      const progress = (phase: BankAiReviewProgress['phase'], activeIds: number[] = [], completedIds: number[] = []) => {
        if (parsed?.requestId && !event.sender.isDestroyed()) {
          try {
            event.sender.send('ai.bankImports.reviewProgress', { requestId: parsed.requestId, phase, transactionIds: ids, activeIds, completedIds } satisfies BankAiReviewProgress)
          } catch { /* The renderer may have closed; progress delivery must not fail the review. */ }
        }
      }
      progress('preparing')
      const transactions = openRows.map((transaction) => {
        // Give the AI a wider candidate window, including weak local scores.
        // Type, amount, reversal and existing-link exclusions still apply.
        const matches = findBankTransactionMatches({ id: transaction.id, forAiReview: true })
          .slice(0, 20)
        return {
          id: transaction.id,
          bookingDate: transaction.bookingDate,
          valueDate: transaction.valueDate,
          direction: transaction.direction,
          amount: Number(transaction.amount),
          currency: transaction.currency,
          counterparty: transaction.counterparty,
          counterpartyIban: transaction.counterpartyIban,
          purpose: transaction.purpose,
          endToEndId: transaction.endToEndId,
          bankReference: transaction.bankReference,
          paymentAccountId: transaction.paymentAccountId,
          paymentAccountName: transaction.paymentAccountName,
          alreadyLinked: findBankTransactionMatches({ id: transaction.id, linkedOnly: true }),
          membershipCandidates: membershipBankCandidates(transaction),
          matches
        }
      })
      const [{ reviewBankImportTransactions }, { buildAiContext }] = await Promise.all([
        loadAiService(),
        loadAiContextService()
      ])
      const reviewed = await reviewBankImportTransactions({
        transactions,
        context: buildAiContext(),
        onProgress: parsed?.requestId ? update => progress('analyzing', update.activeIds, update.completedIds) : undefined
      })
      progress('validating', [], ids)
      const transactionById = new Map(openRows.map((row) => [Number(row.id), row]))
      const matchesByTransactionId = new Map(
        transactions.map((row) => [Number(row.id), row.matches || []])
      )
      const voucherSuggestionCounts = new Map<number, number>()
      for (const suggestion of reviewed.result.suggestions) {
        if (suggestion.action === 'LINK_EXISTING' && suggestion.voucherId) {
          voucherSuggestionCounts.set(suggestion.voucherId, (voucherSuggestionCounts.get(suggestion.voucherId) || 0) + 1)
        }
      }
      const suggestions = reviewed.result.suggestions
        .filter((suggestion) => transactionById.has(Number(suggestion.transactionId)))
        .map((suggestion) => {
          const transaction = transactionById.get(Number(suggestion.transactionId))
          const matches = matchesByTransactionId.get(Number(suggestion.transactionId)) || []
          const alreadyLinked = transactions.find((row) => row.id === Number(suggestion.transactionId))?.alreadyLinked || []
          if (alreadyLinked.length && (suggestion.action === 'CREATE_BOOKING' || suggestion.action === 'APPLY_RECURRING')) {
            return {
              ...suggestion,
              action: 'NEEDS_MANUAL_REVIEW' as const,
              bookingCandidate: null,
              reason: `Mögliche Doppelbuchung: ${alreadyLinked.map((match) => `${match.voucherNo} (Bankbeleg #${match.linkedBankTransactionId})`).join(', ')} bereits zugeordnet. Bitte bestehende Zuordnungen im Bankimport prüfen.`,
              transaction
            }
          }
          if (suggestion.action === 'LINK_EXISTING') {
            const match = matches.find(
              (item: any) => item.matchKind === 'VOUCHER' && Number(item.id) === Number(suggestion.voucherId)
            )
            if (!match || (voucherSuggestionCounts.get(Number(suggestion.voucherId)) || 0) > 1) {
              return {
                ...suggestion,
                action: 'NEEDS_MANUAL_REVIEW' as const,
                voucherId: null,
                voucherNo: null,
                reason: `${suggestion.reason} Die vorgeschlagene Buchung ist nicht eindeutig zuordenbar. Bitte manuell prüfen.`,
                transaction
              }
            }
            return {
              ...suggestion,
              voucherNo: match.voucherNo || null,
              matchedVoucher: {
                grossAmount: Number(match.grossAmount),
                date: match.date,
                description: match.description || null
              },
              warnings: [...suggestion.warnings, ...(match.paymentAccountWarning ? [match.paymentAccountWarning] : [])],
              transaction
            }
          }
          if (suggestion.action === 'APPLY_RECURRING') {
            const match = matches.find((item: any) =>
              item.matchKind === 'RECURRING' &&
              Number(item.recurringBookingId) === Number(suggestion.recurringBookingId) &&
              (suggestion.occurrenceId
                ? Number(item.occurrenceId) === Number(suggestion.occurrenceId)
                : item.scheduledDate === suggestion.scheduledDate)
            ) as any
            if (!match) {
              return {
                ...suggestion,
                action: 'NEEDS_MANUAL_REVIEW' as const,
                recurringBookingId: null,
                recurringBookingName: null,
                occurrenceId: null,
                scheduledDate: null,
                reason: `${suggestion.reason} Dauerbuchungs-Treffer konnte nicht sicher validiert werden.`,
                transaction
              }
            }
            return {
              ...suggestion,
              recurringBookingId: Number(match.recurringBookingId),
              recurringBookingName: match.recurringBookingName || null,
              occurrenceId: match.occurrenceId == null ? null : Number(match.occurrenceId),
              scheduledDate: match.scheduledDate || match.date,
              transaction
            }
          }
          return { ...suggestion, transaction }
        })
      const seen = new Set(suggestions.map((suggestion) => Number(suggestion.transactionId)))
      for (const transaction of openRows) {
        if (!seen.has(Number(transaction.id))) {
          suggestions.push({
            transactionId: Number(transaction.id),
            action: 'NEEDS_MANUAL_REVIEW',
            confidence: 0.2,
            reason: 'Die KI hat fuer diesen Bankbeleg keinen belastbaren Vorschlag geliefert.',
            warnings: ['Manuelle Pruefung empfohlen.'],
            evidence: [],
            transaction
          })
        }
      }
      const { resolveAiMasterData } = await import('../services/aiMasterData')
      if (getDb() !== reviewDb) throw new Error('Die Organisation wurde während der KI-Prüfung gewechselt. Bitte erneut prüfen.')
      for (const suggestion of suggestions) {
        if (suggestion.action !== 'CREATE_BOOKING' || !suggestion.bookingCandidate) continue
        const bank = transactionById.get(Number(suggestion.transactionId))!
        suggestion.bookingCandidate = resolveAiMasterData({ ...suggestion.bookingCandidate,
          counterparty: bank.counterparty?.trim() || suggestion.bookingCandidate.counterparty,
          date: bank.bookingDate, grossAmount: Number(bank.amount) })
        suggestion.warnings = [...new Set([...suggestion.warnings, ...suggestion.bookingCandidate.warnings])]
      }
      if (suggestions.some(suggestion => suggestion.bookingCandidate?.masterDataCreated?.length)) notifyDataChanged(['tags', 'budgets', 'earmarks', 'parties'])
      const output = AiBankImportReviewOutput.parse({
        ...reviewed.result,
        suggestions
      })
      saveBankTransactionAiSuggestions(suggestions)
      progress('complete', [], ids)
      return output
    })
  })
  ipcMain.handle('ai.jobs.create', async (_e, payload) => {
    const parsed = AiJobsCreateInput.parse(payload)
    const job = createAiJob(parsed)
    return AiJobsCreateOutput.parse(job)
  })
  ipcMain.handle('ai.jobs.list', async (_e, payload) => {
    const parsed = AiJobsListInput.parse(payload)
    return AiJobsListOutput.parse(listAiJobs(parsed as any))
  })
  ipcMain.handle('ai.jobs.get', async (_e, payload) => {
    const parsed = AiJobIdInput.parse(payload)
    return AiJobsGetOutput.parse(getAiJob(parsed.id))
  })
  ipcMain.handle('ai.jobs.process', async (_e, payload) => {
    const parsed = AiJobIdInput.parse(payload)
    const initial = setAiJobStatus(parsed.id, 'PROCESSING')
    try {
      const [{ analyzeBookingDocuments, generateAiText }, { buildAiContext }] = await Promise.all([
        loadAiService(),
        loadAiContextService()
      ])
      if (initial.type === 'BOOKING_FROM_DOCUMENTS') {
        const analysisDb = getDb()
        const context = buildAiContext()
        const analyzed = await analyzeBookingDocuments({
          files: initial.files.map((file) => ({
            fileName: file.fileName,
            mimeType: file.mimeType,
            dataBase64: file.dataBase64 || ''
          })),
          context,
          model: initial.model
        })
        const { resolveAiMasterData } = await import('../services/aiMasterData')
        if (getDb() !== analysisDb) throw new Error('Die Organisation wurde während der KI-Prüfung gewechselt. Bitte erneut prüfen.')
        const sourceNormalizedResult = normalizeAiCandidateSources(initial.files, {
          ...analyzed.result, candidates: analyzed.result.candidates.map(candidate => resolveAiMasterData(candidate))
        })
        if (sourceNormalizedResult.candidates.some((candidate: { masterDataCreated?: string[] }) => candidate.masterDataCreated?.length)) notifyDataChanged(['tags', 'budgets', 'earmarks', 'parties'])
        const hardenedResult = applyPaymentAccountHintToAiAnalysis(
          sourceNormalizedResult,
          initial.prompt || initial.title || '',
          context.paymentAccounts || []
        )
        saveAiJobResult(parsed.id, 'BOOKING_CANDIDATE', hardenedResult)
        const processed = setAiJobStatus(parsed.id, 'NEEDS_REVIEW', {
          model: analyzed.model,
          usage: analyzed.usage
        })
        return AiJobsProcessOutput.parse(processed)
      }
      const generated = await generateAiText({
        type: initial.type === 'REPORT_TEXT' ? 'REPORT_TEXT' : 'MEMBER_MESSAGE',
        prompt: initial.prompt || initial.title || '',
        model: initial.model || undefined,
        context: buildAiContext(),
        files: initial.files.map((file) => ({
          fileName: file.fileName,
          mimeType: file.mimeType,
          dataBase64: file.dataBase64 || ''
        }))
      })
      saveAiJobResult(parsed.id, 'TEXT_DRAFT', generated.result)
      const processed = setAiJobStatus(parsed.id, 'NEEDS_REVIEW', {
        model: generated.model,
        usage: generated.usage
      })
      return AiJobsProcessOutput.parse(processed)
    } catch (error: any) {
      const failed = setAiJobStatus(parsed.id, 'FAILED', { error: error?.message || String(error) })
      return AiJobsProcessOutput.parse(failed)
    }
  })
  ipcMain.handle('ai.jobs.updateCandidate', async (_e, payload) => {
    const parsed = AiJobsUpdateCandidateInput.parse(payload)
    const job = updateAiJobCandidate(parsed.id, parsed.result)
    return AiJobsGetOutput.parse(job)
  })
  ipcMain.handle('ai.jobs.approveCandidate', async (_e, payload) => {
    const parsed = AiJobsApproveCandidateInput.parse(payload)
    const job = getAiJob(parsed.id)
    const analysis = AiBookingAnalysisResult.parse(job.result)
    const candidate = analysis.candidates[parsed.candidateIndex]
    if (!candidate) throw new Error('KI-Buchungsvorschlag nicht gefunden.')
    const hasCandidateReviewState = analysis.candidates.some(
      (item) => item.review?.status === 'APPROVED' || item.review?.voucherId
    )
    if (job.status === 'APPROVED' && !hasCandidateReviewState) {
      throw new Error(
        'Dieser ältere KI-Vorschlag wurde bereits als gebucht markiert und kann nicht erneut gebucht werden.'
      )
    }
    if (candidate.review?.status === 'APPROVED' || candidate.review?.voucherId) {
      throw new Error('Dieser KI-Buchungsvorschlag wurde bereits gebucht.')
    }
    const voucherPayload = VoucherCreateInput.parse({
      note: currentAiBookingComment(candidate.note),
      counterparty: candidate.counterparty ?? null,
      partyId: candidate.partyId ?? null,
      date: candidate.date,
      type: candidate.type,
      sphere: candidate.sphere,
      primaryClassificationValueId: candidate.primaryClassificationValueId ?? undefined,
      description: candidate.description,
      grossAmount: candidate.grossAmount,
      vatRate: candidate.vatRate ?? 0,
      paymentMethod: candidate.paymentMethod ?? undefined,
      paymentAccountId: candidate.paymentAccountId ?? undefined,
      budgets: (candidate.budgets || []).map((budget) => ({
        budgetId: budget.id,
        amount: budget.amount
      })),
      earmarks: (candidate.earmarks || []).map((earmark) => ({
        earmarkId: earmark.id,
        amount: earmark.amount
      })),
      tags: candidate.tags || [],
      files: filesForAiCandidate(job.files, candidate).map((file) => ({
        name: file.fileName,
        dataBase64: file.dataBase64 || '',
        mime: file.mimeType || undefined
      }))
    })
    const voucher = createVoucher(voucherPayload)
    const nextAnalysis = {
      ...analysis,
      candidates: analysis.candidates.map((item, idx) =>
        idx === parsed.candidateIndex
          ? {
              ...item,
              review: {
                status: 'APPROVED' as const,
                voucherId: voucher.id,
                voucherNo: voucher.voucherNo,
                approvedAt: new Date().toISOString()
              }
            }
          : item
      )
    }
    saveAiJobResult(parsed.id, 'BOOKING_CANDIDATE', nextAnalysis)
    const allCandidatesApproved = nextAnalysis.candidates.every(
      (item) => item.review?.status === 'APPROVED' || item.review?.voucherId
    )
    setAiJobStatus(parsed.id, allCandidatesApproved ? 'APPROVED' : 'NEEDS_REVIEW', {
      voucherId: voucher.id
    })
    notifyDataChanged(['vouchers'])
    return AiJobsApproveCandidateOutput.parse({
      ok: true,
      voucherId: voucher.id,
      voucherNo: voucher.voucherNo
    })
  })
  ipcMain.handle('ai.jobs.reject', async (_e, payload) => {
    const parsed = AiJobsRejectInput.parse(payload)
    return AiJobsGetOutput.parse(rejectAiJob(parsed.id, parsed.reason))
  })
  ipcMain.handle('ai.jobs.delete', async (_e, payload) => {
    const parsed = AiJobIdInput.parse(payload)
    return AiJobsDeleteOutput.parse(deleteAiJob(parsed.id))
  })
  ipcMain.handle('ai.text.generate', async (_e, payload) => {
    const { includeOrganizationContext = true, ...input } = AiTextGenerateInput.parse(payload)
    const [{ generateAiText }, contextService] = await Promise.all([
      loadAiService(), includeOrganizationContext ? loadAiContextService() : undefined
    ])
    const generated = await generateAiText({ ...input, context: contextService?.buildAiContext() })
    return AiTextGenerateOutput.parse(generated.result)
  })
  ipcMain.handle('ai.actions.plan', async (_e, payload) => {
    const parsed = AiActionPlanInput.parse(payload)
    const [{ planAiAction }, { buildAiContext }] = await Promise.all([
      loadAiService(),
      loadAiContextService()
    ])
    const planned = await planAiAction({ ...parsed, context: buildAiContext() })
    return AiActionPlanOutput.parse(planned)
  })
  ipcMain.handle('ai.agent.run', async (_e, payload) => {
    const parsed = AiAgentRunInput.parse(payload)
    const [{ runAiAgent }, { buildAiContext }] = await Promise.all([
      loadAiAgentService(),
      loadAiContextService()
    ])
    const result = await runAiAgent({ ...parsed, context: buildAiContext() })
    if (result.toolCalls.some(call => call.ok && ['master_data_create', 'booking_draft_prepare'].includes(call.name))) notifyDataChanged(['tags', 'budgets', 'earmarks', 'parties'])
    return AiAgentRunOutput.parse(result)
  })
  ipcMain.handle('ai.agent.memory.list', async (_e, payload) => {
    const parsed = AiAgentMemoryListInput.parse(payload)
    return AiAgentMemoryListOutput.parse({ rows: listAiAgentMemory(parsed || {}) })
  })
  ipcMain.handle('ai.agent.memory.upsert', async (_e, payload) => {
    const parsed = AiAgentMemoryUpsertInput.parse(payload)
    return upsertAiAgentMemory(parsed)
  })
  ipcMain.handle('ai.agent.autoRules.list', async (_e, payload) => {
    const parsed = AiAgentAutoRulesListInput.parse(payload)
    return AiAgentAutoRulesListOutput.parse({ rows: listAiAgentAutoRules(parsed || {}) })
  })
  ipcMain.handle('ai.agent.autoRules.upsert', async (_e, payload) => {
    const parsed = AiAgentAutoRuleUpsertInput.parse(payload)
    return upsertAiAgentAutoRule(parsed)
  })
  ipcMain.handle('ai.rules.list', async (_e, payload) => {
    const parsed = AiKnowledgeRulesListInput.parse(payload)
    return AiKnowledgeRulesListOutput.parse({ rows: listAiKnowledgeRules(parsed || {}) })
  })
  ipcMain.handle('ai.rules.upsert', async (_e, payload) => {
    const parsed = AiKnowledgeRuleUpsertInput.parse(payload)
    return upsertAiKnowledgeRule(parsed)
  })
  ipcMain.handle('ai.rules.delete', async (_e, payload) => {
    const parsed = AiKnowledgeRuleDeleteInput.parse(payload)
    return AiKnowledgeRuleDeleteOutput.parse(deleteAiKnowledgeRule(parsed.id))
  })
  ipcMain.handle('vouchers.create', async (_e, payload) => {
    const parsed = VoucherCreateInput.parse(payload)
    const res = createVoucher(parsed)
    return VoucherCreateOutput.parse(res)
  })

  ipcMain.handle('vouchers.reverse', async (_e, payload) => {
    const parsed = VoucherReverseInput.parse(payload)
    const res = reverseVoucher(parsed.originalId, null)
    return VoucherReverseOutput.parse(res)
  })

  ipcMain.handle('reports.summary', async (_e, payload) => {
    const parsed = ReportsSummaryInput.parse(payload)
    const summary = summarizeVouchers({
      paymentMethod: parsed.paymentMethod as any,
      paymentAccountId: parsed.paymentAccountId ?? undefined,
      sphere: parsed.sphere as any,
      primaryClassificationValueId: parsed.primaryClassificationValueId,
      type: parsed.type as any,
      from: parsed.from,
      to: parsed.to,
      // extend filters with optional earmarkId
      ...(parsed.earmarkId != null ? ({ earmarkId: parsed.earmarkId } as any) : {}),
      ...(parsed.budgetId != null ? ({ budgetId: parsed.budgetId } as any) : {}),
      q: (parsed as any).q,
      tag: (parsed as any).tag
    } as any)
    return ReportsSummaryOutput.parse(summary)
  })

  ipcMain.handle('reports.monthly', async (_e, payload) => {
    const parsed = ReportsMonthlyInput.parse(payload)
    const buckets = monthlyVouchers(parsed)
    return ReportsMonthlyOutput.parse({ buckets })
  })

  ipcMain.handle('reports.daily', async (_e, payload) => {
    const parsed = ReportsMonthlyInput.parse(payload) // Same input schema
    const buckets = dailyVouchers(parsed)
    return { buckets } // Same output format, just date instead of month
  })

  ipcMain.handle('reports.cashBalance', async (_e, payload) => {
    const parsed = ReportsCashBalanceInput.parse(payload)
    const res = cashBalance({
      includeOpenings: parsed.includeOpenings,
      from: parsed.from,
      to: parsed.to,
      sphere: parsed.sphere as any,
      budgetId: parsed.budgetId,
      paymentAccountId: parsed.paymentAccountId ?? undefined
    })
    return ReportsCashBalanceOutput.parse(res)
  })

  // Distinct voucher years
  ipcMain.handle('reports.years', async () => {
    const years = listVoucherYears()
    return ReportsYearsOutput.parse({ years })
  })

  ipcMain.handle('reports.export', async (_e, payload: unknown) => {
    const { exportReport } = await import('../services/reportExport')
    return exportReport(payload)
  })

  ipcMain.handle('reports.exportFiscal', async (_e, payload) => {
    const parsed = FiscalReportInput.parse(payload)
    const { generateFiscalReportPDF } = await import('../services/fiscalReport')
    const from = `${parsed.fiscalYear}-01-01`
    const to = `${parsed.fiscalYear}-12-31`
    const result = await generateFiscalReportPDF({
      fiscalYear: parsed.fiscalYear,
      from,
      to,
      includeBindings: parsed.includeBindings ?? false,
      includeVoucherList: parsed.includeVoucherList ?? false,
      includeBudgets: parsed.includeBudgets ?? false,
      includeActivityReport: parsed.includeActivityReport ?? false,
      includeInactiveBindings: parsed.includeInactiveBindings ?? false,
      includeArchivedBudgets: parsed.includeArchivedBudgets ?? false,
      includeInternalVouchers: parsed.includeInternalVouchers ?? false,
      bindingIds: parsed.bindingIds,
      budgetIds: parsed.budgetIds,
      orgName: parsed.orgName
    })
    return FiscalReportOutput.parse(result)
  })

  ipcMain.handle('activityReports.get', async (_e, payload) => {
    const parsed = ActivityReportGetInput.parse(payload)
    const report = await withSchemaHealRetry(
      () => getActivityReport(parsed.fiscalYear),
      ['activity_reports']
    )
    return ActivityReportGetOutput.parse({
      ...report,
      missingFields: validateActivityReport(report)
    })
  })

  ipcMain.handle('activityReports.list', async (_e, payload) => {
    ActivityReportListInput.parse(payload)
    const rows = await withSchemaHealRetry(() => listActivityReports(), ['activity_reports'])
    return ActivityReportListOutput.parse({ rows })
  })

  ipcMain.handle('activityReports.save', async (_e, payload) => {
    const parsed = ActivityReportSaveInput.parse(payload)
    const report = await withSchemaHealRetry(() => saveActivityReport(parsed), ['activity_reports'])
    return ActivityReportSaveOutput.parse({
      ...report,
      missingFields: validateActivityReport(report)
    })
  })

  ipcMain.handle('activityReports.delete', async (_e, payload) => {
    const parsed = ActivityReportDeleteInput.parse(payload)
    const result = await withSchemaHealRetry(
      () => deleteActivityReport(parsed.fiscalYear),
      ['activity_reports']
    )
    return ActivityReportDeleteOutput.parse(result)
  })

  ipcMain.handle('reports.exportTreasurer', async (_e, payload) => {
    const { TreasurerReportInput, TreasurerReportOutput } = await import('./schemas')
    const parsed = TreasurerReportInput.parse(payload)
    const { generateTreasurerReportPDF } = await import('../services/treasurerReport')
    const from = `${parsed.fiscalYear}-01-01`
    const to = `${parsed.fiscalYear}-12-31`
    const result = await generateTreasurerReportPDF({
      fiscalYear: parsed.fiscalYear,
      from,
      to,
      orgName: parsed.orgName,
      cashBalanceDate: parsed.cashBalanceDate,
      includeMembers: parsed.includeMembers ?? true,
      includeInvoices: parsed.includeInvoices ?? true,
      includeBindings: parsed.includeBindings ?? true,
      includeBudgets: parsed.includeBudgets ?? true,
      includeTagSummary: parsed.includeTagSummary ?? false,
      includeVoucherList: parsed.includeVoucherList ?? false,
      includeTags: parsed.includeTags ?? false,
      includeInternalVouchers: parsed.includeInternalVouchers ?? false,
      voucherListFrom: parsed.voucherListFrom,
      voucherListTo: parsed.voucherListTo,
      voucherListSort: parsed.voucherListSort ?? 'ASC'
    })
    return TreasurerReportOutput.parse(result)
  })

  registerJournalHandlers(withSchemaHealRetry)

  ipcMain.handle('paymentAccounts.list', async (_e, payload) => {
    const parsed = PaymentAccountsListInput.parse(payload)
    return PaymentAccountsListOutput.parse({ rows: listPaymentAccounts(parsed ?? undefined) })
  })
  ipcMain.handle('paymentAccounts.previewOpeningVoucher', (_event, payload) => {
    const { accountId, voucherNo } = OpeningVoucherInput.parse(payload)
    return previewOpeningVoucher(accountId, voucherNo)
  })
  ipcMain.handle('paymentAccounts.configureSetup', (_event, payload) => {
    const rows = configureSetupAccounts(SetupAccountsInput.parse(payload))
    notifyDataChanged(['settings', 'vouchers'])
    return PaymentAccountsListOutput.parse({ rows })
  })
  ipcMain.handle('paymentAccounts.setOpenings', (_event, payload) => {
    const changes = AccountOpeningChanges.parse(payload)
    const db = getDb()
    db.transaction(() => {
      for (const change of changes) {
        storeAccountOpening(db, change.accountId, change.opening, undefined, change.previous)
      }
    })()
    notifyDataChanged(['settings', 'vouchers'])
  })
  ipcMain.handle('paymentAccounts.upsert', async (_e, payload) => {
    const parsed = PaymentAccountUpsertInput.parse(payload)
    const result = PaymentAccountUpsertOutput.parse(upsertPaymentAccount(parsed))
    notifyDataChanged(parsed.opening !== undefined ? ['settings', 'vouchers'] : ['settings'])
    return result
  })
  ipcMain.handle('paymentAccounts.delete', async (_e, payload) => {
    const parsed = PaymentAccountDeleteInput.parse(payload)
    const result = PaymentAccountDeleteOutput.parse(deletePaymentAccount(parsed.id))
    notifyDataChanged(['settings'])
    return result
  })
  ipcMain.handle('parties.list', async (_e, payload) => {
    const parsed = PartiesListInput.parse(payload)
    return PartiesListOutput.parse({ rows: listParties(parsed ?? undefined) })
  })
  ipcMain.handle('parties.get', async (_e, payload) => {
    const parsed = PartyGetInput.parse(payload)
    const party = getParty(parsed.id)
    if (!party) throw new Error('Geschäftspartner wurde nicht gefunden.')
    return PartyGetOutput.parse(party)
  })
  ipcMain.handle('parties.upsert', async (_e, payload) => {
    const parsed = PartyUpsertInput.parse(payload)
    return PartyUpsertOutput.parse(upsertParty(parsed))
  })
  ipcMain.handle('parties.archive', async (_e, payload) => {
    const parsed = PartyArchiveInput.parse(payload)
    return PartyArchiveOutput.parse(archiveParty(parsed.id, parsed.isActive))
  })

  ipcMain.handle('vouchers.delete', async (_e, payload) => {
    const parsed = VoucherDeleteInput.parse(payload)
    const res = deleteVoucher(parsed.id)
    return VoucherDeleteOutput.parse(res)
  })
  ipcMain.handle('vouchers.batchAssignEarmark', async (_e, payload) => {
    const parsed = VouchersBatchAssignEarmarkInput.parse(payload)
    const res = batchAssignEarmark(parsed as any)
    return VouchersBatchAssignEarmarkOutput.parse(res)
  })
  ipcMain.handle('vouchers.batchAssignBudget', async (_e, payload) => {
    const parsed = VouchersBatchAssignBudgetInput.parse(payload)
    const res = batchAssignBudget(parsed as any)
    return VouchersBatchAssignBudgetOutput.parse(res)
  })
  ipcMain.handle('vouchers.batchAssignTags', async (_e, payload) => {
    const parsed = VouchersBatchAssignTagsInput.parse(payload)
    const res = batchAssignTags(parsed as any)
    return VouchersBatchAssignTagsOutput.parse(res)
  })
  // Recent vouchers (simple list)
  ipcMain.handle('vouchers.recent', async (_e, payload) => {
    const parsed = VouchersRecentInput.parse(payload) ?? { limit: 10 }
    const rows = listRecentVouchers(parsed.limit)
    return VouchersRecentOutput.parse({ rows })
  })
  ipcMain.handle('vouchers.clearAll', async (_e, payload) => {
    const parsed = VouchersClearAllInput.parse(payload)
    if (!parsed.confirm) throw new Error('Nicht bestätigt')
    // Safety: backup before destructive action
    await requireSafetyBackup(backup.makeBackup, 'preClearAll', 'Alle Buchungen löschen')
    const res = clearAllVouchers()
    return VouchersClearAllOutput.parse(res)
  })

  // Zweckbindungen (bindings)
  ipcMain.handle('bindings.list', async (_e, payload) => {
    const parsed = BindingListInput.parse(payload)
    const rows = listBindings(parsed ?? undefined)
    return BindingListOutput.parse({ rows })
  })
  ipcMain.handle('bindings.upsert', async (_e, payload) => {
    const parsed = BindingUpsertInput.parse(payload)
    const res = upsertBinding(parsed as any)
    notifyDataChanged(['earmarks'])
    return BindingUpsertOutput.parse({ id: res.id })
  })
  ipcMain.handle('bindings.delete', async (_e, payload) => {
    const parsed = BindingDeleteInput.parse(payload)
    const res = deleteBinding(parsed.id)
    notifyDataChanged(['earmarks'])
    return BindingDeleteOutput.parse(res)
  })
  ipcMain.handle('bindings.usage', async (_e, payload) => {
    const parsed = BindingUsageInput.parse(payload)
    const res = bindingUsage(parsed.earmarkId, {
      from: parsed.from,
      to: parsed.to,
      sphere: parsed.sphere as any
    })
    return BindingUsageOutput.parse(res)
  })

  // Budgets
  ipcMain.handle('budgets.upsert', async (_e, payload) => {
    const parsed = BudgetUpsertInput.parse(payload)
    const res = upsertBudget(parsed as any)
    notifyDataChanged(['budgets'])
    return BudgetUpsertOutput.parse({ id: res.id })
  })
  ipcMain.handle('budgets.list', async (_e, payload) => {
    const parsed = BudgetListInput.parse(payload)
    const rows = listBudgets(parsed ?? {})
    return BudgetListOutput.parse({ rows })
  })
  ipcMain.handle('budgets.delete', async (_e, payload) => {
    const parsed = BudgetDeleteInput.parse(payload)
    const res = deleteBudget(parsed.id)
    notifyDataChanged(['budgets'])
    return BudgetDeleteOutput.parse(res)
  })
  ipcMain.handle('budgets.usage', async (_e, payload) => {
    const parsed = BudgetUsageInput.parse(payload)
    const res = budgetUsage({ budgetId: parsed.budgetId, from: parsed.from, to: parsed.to })
    return BudgetUsageOutput.parse(res)
  })

  // Dauerbuchungen
  ipcMain.handle('recurringBookings.list', async (_e, payload) => {
    const parsed = RecurringBookingsListInput.parse(payload)
    return RecurringBookingsListOutput.parse({ rows: listRecurringBookings(parsed) })
  })
  ipcMain.handle('recurringBookings.summary', async () => {
    return RecurringBookingsSummaryOutput.parse(recurringBookingsSummary())
  })
  ipcMain.handle('recurringBookings.upsert', async (_e, payload) => {
    const parsed = RecurringBookingUpsertInput.parse(payload)
    const result = upsertRecurringBooking(parsed)
    notifyDataChanged(['recurring-bookings'])
    return RecurringBookingUpsertOutput.parse(result)
  })
  ipcMain.handle('recurringBookings.setStatus', async (_e, payload) => {
    const parsed = RecurringBookingStatusInput.parse(payload)
    const result = setRecurringBookingStatus(parsed.id, parsed.status)
    notifyDataChanged(['recurring-bookings'])
    return RecurringBookingStatusOutput.parse(result)
  })
  ipcMain.handle('recurringBookings.skip', async (_e, payload) => {
    const parsed = RecurringBookingActionInput.parse(payload)
    const result = skipRecurringOccurrence(parsed.recurringBookingId)
    notifyDataChanged(['recurring-bookings'])
    return RecurringBookingSkipOutput.parse(result)
  })
  ipcMain.handle('recurringBookings.book', async (_e, payload) => {
    const parsed = RecurringBookingBookInput.parse(payload)
    const result = bookRecurringOccurrence(parsed)
    notifyDataChanged(['recurring-bookings', 'vouchers', 'bank-imports', 'budgets', 'earmarks', 'tags'])
    return RecurringBookingBookOutput.parse(result)
  })
  ipcMain.handle('recurringBookings.link', async (_e, payload) => {
    const parsed = RecurringBookingLinkInput.parse(payload)
    const result = linkRecurringOccurrence(parsed)
    notifyDataChanged(['recurring-bookings', 'vouchers', 'bank-imports'])
    return RecurringBookingLinkOutput.parse(result)
  })

  // Vorschüsse
  const advanceSchemaTables = [
    'member_advances',
    'member_advance_purchases',
    'member_advance_settlements'
  ]

  ipcMain.handle('advances.list', async (_e, payload) => {
    return withSchemaHealRetry(() => {
      const parsed = AdvancesListInput.parse(payload)
      const res = listAdvances(parsed ?? undefined)
      return AdvancesListOutput.parse(res)
    }, advanceSchemaTables)
  })
  ipcMain.handle('advances.create', async (_e, payload) => {
    return withSchemaHealRetry(() => {
      const parsed = AdvanceCreateInput.parse(payload)
      const res = createAdvance(parsed as any)
      return AdvanceCreateOutput.parse(res)
    }, advanceSchemaTables)
  })
  ipcMain.handle('advances.get', async (_e, payload) => {
    return withSchemaHealRetry(() => {
      const parsed = AdvanceGetInput.parse(payload)
      const res = getAdvanceById({ id: parsed.id })
      return AdvanceGetOutput.parse(res)
    }, advanceSchemaTables)
  })
  ipcMain.handle('advances.settle', async (_e, payload) => {
    return withSchemaHealRetry(() => {
      const parsed = AdvanceSettleInput.parse(payload)
      const res = settleAdvance(parsed as any)
      return AdvanceSettleOutput.parse(res)
    }, advanceSchemaTables)
  })
  ipcMain.handle('advances.delete', async (_e, payload) => {
    const parsed = AdvanceDeleteInput.parse(payload)
    const res = deleteAdvance({ id: parsed.id })
    return AdvanceDeleteOutput.parse(res)
  })

  ipcMain.handle('advances.purchases.create', async (_e, payload) => {
    const parsed = AdvancePurchaseCreateInput.parse(payload)
    const res = addAdvancePurchase(parsed as any)
    return AdvancePurchaseCreateOutput.parse(res)
  })

  ipcMain.handle('advances.purchases.delete', async (_e, payload) => {
    const parsed = AdvancePurchaseDeleteInput.parse(payload)
    const res = deleteAdvancePurchase(parsed)
    return AdvancePurchaseDeleteOutput.parse(res)
  })

  ipcMain.handle('advances.purchases.update', async (_e, payload) => {
    const parsed = AdvancePurchaseUpdateInput.parse(payload)
    const res = updateAdvancePurchase(parsed as any)
    return AdvancePurchaseUpdateOutput.parse(res)
  })

  ipcMain.handle('advances.resolve', async (_e, payload) => {
    const parsed = AdvanceResolveInput.parse(payload)
    const res = resolveAdvance({ id: parsed.id })
    return AdvanceResolveOutput.parse(res)
  })

  // Quotes
  ipcMain.handle('quotes.weekly', async (_e, payload) => {
    const parsed = QuoteWeeklyInput.parse(payload)
    const q = getWeeklyQuote(parsed?.date)
    return QuoteWeeklyOutput.parse(q)
  })

  // Imports
  ipcMain.handle('imports.preview', async (_e, payload) => {
    const parsed = ImportPreviewInput.parse(payload)
    const { previewFile } = await loadImportsService()
    const fileBase64 = filePayloadToBase64({
      dataBytes: parsed.fileBytes,
      dataBase64: parsed.fileBase64
    })
    const res = await previewFile(fileBase64)
    return ImportPreviewOutput.parse(res as any)
  })
  ipcMain.handle('imports.aiPreview', async (_e, payload) => {
    const input = AiImportFileSchema.parse(payload)
    return (await import('../services/aiImport')).previewAiImport(input.fileName, input.fileBase64)
  })
  ipcMain.handle('imports.aiCreate', async (_e, payload) => (await import('../services/aiImport')).createAiImport(AiImportCreateSchema.parse(payload)))
  ipcMain.handle('imports.aiList', async () => (await import('../services/aiImport')).listAiImports())
  ipcMain.handle('imports.aiDelete', async (_e, payload) => (await import('../services/aiImport')).deleteAiImport(z.object({ id: z.string().uuid() }).parse(payload).id))
  ipcMain.handle('imports.aiReview', async (_e, payload) => (await import('../services/aiImport')).saveAiImport(AiImportSaveSchema.parse(payload), false))
  ipcMain.handle('imports.aiGet', async (_e, payload) => (await import('../services/aiImport')).getAiImport(z.object({ id: z.string().uuid() }).parse(payload).id))
  ipcMain.handle('imports.aiStart', async (_e, payload) => (await import('../services/aiImport')).startAiImport(AiImportIdentitySchema.parse(payload)))
  ipcMain.handle('imports.aiCancel', async (_e, payload) => (await import('../services/aiImport')).cancelAiImport(AiImportIdentitySchema.parse(payload)))
  ipcMain.handle('imports.aiSave', async (_e, payload) => (await import('../services/aiImport')).saveAiImport(AiImportSaveSchema.parse(payload)))
  ipcMain.handle('imports.aiCommit', async (_e, payload) => {
    const input = AiImportIdentitySchema.parse(payload)
    const d = getDb()
    await requireSafetyBackup(backup.makeBackup, 'preAiImport', 'KI-Import übernehmen')
    const service = await import('../services/aiImport')
    if (d !== getDb()) throw new Error('Organisation wurde gewechselt. Bitte den Import erneut öffnen.')
    const result = service.commitAiImport(input)
    notifyDataChanged(['vouchers', 'tags', 'budgets', 'earmarks', 'settings'])
    return result
  })
  ipcMain.handle('imports.execute', async (_e, payload) => {
    const parsed = ImportExecuteInput.parse(payload)
    // Safety: backup before potentially large data modification
    await requireSafetyBackup(backup.makeBackup, 'preImportRows', 'Import ausführen')
    try {
      ensureVoucherForeignKeyTargets(getDb() as any)
    } catch {
      /* ignore */
    }
    const { executeFile } = await loadImportsService()
    const fileBase64 = filePayloadToBase64({
      dataBytes: parsed.fileBytes,
      dataBase64: parsed.fileBase64
    })
    const res = await executeFile(fileBase64, parsed.mapping as any)
    return ImportExecuteOutput.parse(res as any)
  })
  ipcMain.handle('imports.analyze', async (_e, payload) => {
    const parsed = ImportAnalyzeInput.parse(payload)
    const { analyzeFile } = await loadImportsService()
    const fileBase64 = filePayloadToBase64({
      dataBytes: parsed.fileBytes,
      dataBase64: parsed.fileBase64
    })
    const res = await analyzeFile(fileBase64, parsed.mapping as any, parsed.rules as any, { masterData: parsed.masterData, draftRows: parsed.draftRows as any })
    return ImportAnalyzeOutput.parse(res as any)
  })
  ipcMain.handle('imports.commitDraft', async (_e, payload) => {
    const parsed = ImportCommitDraftInput.parse(payload)
    await requireSafetyBackup(backup.makeBackup, 'preImportDraft', 'Importentwurf übernehmen')
    try {
      ensureVoucherForeignKeyTargets(getDb() as any)
    } catch {
      /* ignore */
    }
    const { commitImportDraft } = await loadImportsService()
    const res = await commitImportDraft(parsed.rows as any, parsed.masterData)
    return ImportExecuteOutput.parse(res as any)
  })
  ipcMain.handle('imports.createMissing', async (_e, payload) => {
    const parsed = ImportCreateMissingInput.parse(payload)
    const { createMissingImportMasterData } = await loadImportsService()
    const res = createMissingImportMasterData(parsed as any)
    return ImportCreateMissingOutput.parse(res)
  })
  ipcMain.handle('imports.template', async (_e, payload) => {
    ImportTemplateInput.parse(payload)
    const { generateImportTemplate } = await loadImportsService()
    const res = await generateImportTemplate()
    return ImportTemplateOutput.parse(res)
  })

  ipcMain.handle('imports.testdata', async (_e, payload) => {
    ImportTestDataInput.parse(payload)
    const { generateImportTestData } = await loadImportsService()
    const res = await generateImportTestData()
    return ImportTestDataOutput.parse(res)
  })
  ipcMain.handle('imports.editableExport', async (_e, payload) => {
    ImportEditableExportInput.parse(payload)
    const { exportEditableVouchersWorkbook } = await loadImportsService()
    const res = await exportEditableVouchersWorkbook()
    return ImportEditableExportOutput.parse(res)
  })

  // Bank statement imports are staged for review before they become vouchers.
  ipcMain.handle('bankImports.preview', async (_e, payload) => {
    const parsed = BankImportPreviewInput.parse(payload)
    const fileBase64 = filePayloadToBase64({
      dataBytes: parsed.fileBytes,
      dataBase64: parsed.fileBase64
    })
    return BankImportPreviewOutput.parse(previewBankImport({ ...parsed, fileBase64 } as any))
  })
  ipcMain.handle('bankImports.commit', async (_e, payload) => {
    const parsed = BankImportCommitInput.parse(payload)
    await requireSafetyBackup(backup.makeBackup, 'preBankImport', 'Bankdaten importieren')
    const fileBase64 = filePayloadToBase64({
      dataBytes: parsed.fileBytes,
      dataBase64: parsed.fileBase64
    })
    return BankImportCommitOutput.parse(commitBankImport({ ...parsed, fileBase64 } as any))
  })
  ipcMain.handle('bankImports.remapPreview', async (_e, payload) => {
    const parsed = BankImportRemapPreviewInput.parse(payload)
    return BankImportRemapPreviewOutput.parse(previewBankImportRemap(parsed))
  })
  ipcMain.handle('bankImports.remapApply', async (_e, payload) => {
    const parsed = BankImportRemapApplyInput.parse(payload)
    await requireSafetyBackup(backup.makeBackup, 'preBankImportRemap', 'Bankimport-Zuordnungen aktualisieren')
    const result = BankImportRemapApplyOutput.parse(applyBankImportRemap(parsed))
    notifyDataChanged(['bank-imports'])
    return result
  })
  ipcMain.handle('bankTransactions.list', async (_e, payload) => {
    const parsed = BankTransactionsListInput.parse(payload ?? {})
    return BankTransactionsListOutput.parse(listBankTransactions(parsed as any))
  })
  ipcMain.handle('bankTransactions.previewAiBatch', (_e, payload) => {
    return previewBankAiBatch(BankAiBatchPreviewInput.parse(payload).ids)
  })
  ipcMain.handle('bankTransactions.applyAiBatch', (_e, payload) => {
    const result = applyBankAiBatchRow(BankAiBatchApplySchema.parse(payload))
    notifyDataChanged(['bank-imports', 'vouchers', 'recurring-bookings'])
    return result
  })
  ipcMain.handle('bankTransactions.validateAiBatchDraft', (_e, payload) => {
    return validateBankAiBatchDraft(BankAiBatchApplySchema.parse(payload))
  })
  ipcMain.handle('bankTransactions.importStatus', async () => {
    return BankImportStatusOutput.parse(getBankImportStatus())
  })
  ipcMain.handle('bankTransactions.importHistory', async (_e, payload) => {
    const parsed = BankImportHistoryInput.parse(payload ?? {})
    return BankImportHistoryOutput.parse(listBankImportHistory(parsed))
  })
  ipcMain.handle('bankTransactions.get', async (_e, payload) => {
    const parsed = BankTransactionIdInput.parse(payload)
    return BankTransactionOutput.parse(getBankTransaction(parsed.id))
  })
  ipcMain.handle('bankTransactions.matches', async (_e, payload) => {
    const parsed = BankTransactionMatchesInput.parse(payload)
    return BankTransactionMatchesOutput.parse({
      rows: findBankTransactionMatches(parsed),
      alreadyLinked: findBankTransactionMatches({ ...parsed, linkedOnly: true })
    })
  })
  ipcMain.handle('bankTransactions.link', async (_e, payload) => {
    const parsed = BankTransactionLinkInput.parse(payload)
    const result = BankTransactionOutput.parse(
      await withSchemaHealRetry(
        () => linkBankTransaction({ ...parsed, origin: 'EXISTING' }),
        ['bank_transactions', 'bank_import_batches']
      )
    )
    notifyDataChanged(['bank-imports', 'vouchers', 'recurring-bookings'])
    return result
  })
  ipcMain.handle('bankTransactions.check', async (_e, payload) => {
    const parsed = BankTransactionCheckInput.parse(payload)
    return BankTransactionOutput.parse(markBankTransactionChecked(parsed))
  })
  ipcMain.handle('bankTransactions.reopen', async (_e, payload) => {
    const parsed = BankTransactionIdInput.parse(payload)
    return BankTransactionOutput.parse(reopenBankTransaction(parsed.id))
  })

  // Attachments
  ipcMain.handle('attachments.list', async (_e, payload) => {
    const parsed = AttachmentsListInput.parse(payload)
    const files = listFilesForVoucher(parsed.voucherId)
    return AttachmentsListOutput.parse({
      files: files.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        mimeType: f.mimeType ?? null,
        size: f.size ?? null,
        createdAt: f.createdAt
      }))
    })
  })
  ipcMain.handle('attachments.open', async (_e, payload) => {
    const parsed = AttachmentOpenInput.parse(payload)
    const f = getFileById(parsed.fileId)
    if (!f) throw new Error('Datei nicht gefunden')
    const pathBase = path.basename(f.filePath || '')
    let src = f.filePath
    try {
      if (!fs.existsSync(src)) {
        const alt = path.join(getAppDataDir().filesDir, pathBase)
        if (fs.existsSync(alt)) src = alt
      }
    } catch {}
    const res = await shell.openPath(src)
    const ok = !res
    return AttachmentOpenOutput.parse({ ok })
  })
  ipcMain.handle('attachments.saveAs', async (_e, payload) => {
    const parsed = AttachmentSaveAsInput.parse(payload)
    const f = getFileById(parsed.fileId)
    if (!f) throw new Error('Datei nicht gefunden')
    const save = await dialog.showSaveDialog({
      title: 'Datei speichern unter …',
      defaultPath: f.fileName
    })
    if (save.canceled || !save.filePath) throw new Error('Abbruch')
    const pathBase = path.basename(f.filePath || '')
    let src = f.filePath
    if (!src || !fs.existsSync(src)) {
      const alt = path.join(getAppDataDir().filesDir, pathBase)
      if (fs.existsSync(alt)) src = alt
    }
    if (!src || !fs.existsSync(src))
      throw new Error('Quelldatei nicht gefunden: ' + (f.filePath || pathBase))
    await fsp.copyFile(src, save.filePath)
    return AttachmentSaveAsOutput.parse({ filePath: save.filePath })
  })
  ipcMain.handle('attachments.read', async (_e, payload) => {
    const parsed = AttachmentReadInput.parse(payload)
    const f = getFileById(parsed.fileId)
    if (!f) throw new Error('Datei nicht gefunden')
    const pathBase = path.basename(f.filePath || '')
    let src = f.filePath
    if (!src || !fs.existsSync(src)) {
      const alt = path.join(getAppDataDir().filesDir, pathBase)
      if (fs.existsSync(alt)) src = alt
    }
    if (!src || !fs.existsSync(src))
      throw new Error('Quelldatei nicht gefunden: ' + (f.filePath || pathBase))
    const buff = await fsp.readFile(src)
    return AttachmentReadOutput.parse({
      fileName: f.fileName,
      mimeType: f.mimeType || undefined,
      dataBytes: new Uint8Array(buff.buffer, buff.byteOffset, buff.byteLength)
    })
  })
  ipcMain.handle('attachments.add', async (_e, payload) => {
    const parsed = AttachmentAddInput.parse(payload)
    const res = addFileToVoucher(
      parsed.voucherId,
      parsed.fileName,
      parsed,
      parsed.mimeType
    )
    return AttachmentAddOutput.parse(res)
  })
  ipcMain.handle('attachments.delete', async (_e, payload) => {
    const parsed = AttachmentDeleteInput.parse(payload)
    const res = deleteVoucherFile(parsed.fileId)
    return AttachmentDeleteOutput.parse(res)
  })

  // Database: Export (save current database.sqlite)
  ipcMain.handle('db.export', async () => {
    DbExportInput.parse({})
    const { root } = getAppDataDir()
    const dbPath = path.join(root, 'database.sqlite')
    if (!fs.existsSync(dbPath)) throw new Error('Datenbankdatei nicht gefunden')
    const now = new Date()
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const defaultName = `VereinO_database_${stamp}.sqlite`
    const save = await dialog.showSaveDialog({
      title: 'Datenbank exportieren …',
      defaultPath: defaultName,
      filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }]
    })
    // Graceful cancel: return empty path instead of throwing
    if (save.canceled || !save.filePath) return DbExportOutput.parse({ filePath: '' as any })
    await fsp.copyFile(dbPath, save.filePath)
    return DbExportOutput.parse({ filePath: save.filePath })
  })

  // Database: Import (file picker only, returns chosen file meta for comparison modal)
  ipcMain.handle('db.import.pick', async () => {
    DbImportInput.parse({})
    const open = await dialog.showOpenDialog({
      title: 'Datenbank wählen …',
      filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }],
      properties: ['openFile']
    })
    if (open.canceled || !open.filePaths?.[0]) return { ok: false }
    const importPath = open.filePaths[0]
    // Basic stats for comparison
    try {
      const stat = await fsp.stat(importPath)
      // Inspect counts using existing backup.inspect logic for uniformity
      const counts = backup.inspectBackup(importPath)?.counts || {}
      return { ok: true, filePath: importPath, size: stat.size, mtime: stat.mtimeMs, counts }
    } catch {
      return { ok: true, filePath: importPath }
    }
  })

  // Database: Import from provided path after user confirms comparison
  ipcMain.handle('db.import.fromPath', async (_e, payload) => {
    const parsed = DbImportFromPathInput.parse(payload)
    const importPath = parsed.filePath
    const { root } = getAppDataDir()
    const dbPath = path.join(root, 'database.sqlite')
    try {
      // Safety: create a backup before replacing the DB
      try {
        await backup.makeBackup('preImport')
      } catch {
        /* ignore backup errors */
      }
      // Close DB before replacing file
      try {
        closeDb()
      } catch {}
      await fsp.copyFile(importPath, dbPath)
      // Reopen and ensure migrations are applied
      const d = getDb()
      // Ensure schema is up to date (e.g., tags tables)
      try {
        applyMigrations(d as any)
      } catch {
        /* ignore, handled by main on next start too */
      }
      // optional: run a lightweight pragma to ensure file is valid
      d.pragma('foreign_keys = ON')
      return DbImportFromPathOutput.parse({ ok: true, filePath: importPath })
    } catch (e) {
      throw new Error('Import fehlgeschlagen: ' + (e as any)?.message)
    }
  })

  // DB location: info
  ipcMain.handle('db.location.get', async () => {
    const info = getCurrentDbInfo()
    const cfg = readAppConfig()
    return {
      root: info.root,
      dbPath: info.dbPath,
      filesDir: info.filesDir,
      configuredRoot: cfg.dbRoot || null,
      organization: getActiveOrganization()
    }
  })

  // A selected folder is bound to the organization visible when picking it.
  function ensureStorageChangeAllowed() {
    assertStorageMoveIdle()
    if (options.hasDetachedQuickAdds?.()) throw new Error('Bitte zuerst die separaten Erfassungsfenster schließen.')
    backup.assertBackupIdle()
  }
  ipcMain.handle('db.location.pick', async () => {
    ensureStorageChangeAllowed()
    const organization = getActiveOrganization()
    if (!organization) throw new Error('Keine aktive Organisation gefunden.')
    const pick = await dialog.showOpenDialog({
      title: `Neuer Speicherort für ${organization.name}`,
      properties: ['openDirectory', 'createDirectory']
    })
    if (pick.canceled || !pick.filePaths?.[0]) throw new Error('Abbruch')
    ensureStorageChangeAllowed()
    if (getActiveOrganization()?.id !== organization.id) throw new Error('Die Organisation wurde inzwischen gewechselt. Bitte erneut auswählen.')
    const root = await validateOrganizationStorageTarget(pick.filePaths[0], organization, listOrganizations())
    return { root, sourceRoot: organization.dbRoot, organization: { id: organization.id, name: organization.name } }
  })

  ipcMain.handle('db.location.migrateTo', async (_e, payload: { root: string; organizationId: string }) => {
    ensureStorageChangeAllowed()
    if (!payload?.root || typeof payload.root !== 'string' || !payload.organizationId) throw new Error('Zielordner und Organisation sind erforderlich.')
    const result = await migrateToRoot(payload.root, payload.organizationId)
    return { ok: true, ...result }
  })

  // Tags CRUD
  ipcMain.handle('tags.list', async (_e, payload) => {
    const parsed = TagsListInput.parse(payload)
    const rows = listTags(parsed ?? undefined) as any
    return TagsListOutput.parse({ rows })
  })
  ipcMain.handle('tags.upsert', async (_e, payload) => {
    const parsed = TagUpsertInput.parse(payload)
    const res = upsertTag(parsed)
    return TagUpsertOutput.parse({ id: res.id })
  })
  ipcMain.handle('tags.delete', async (_e, payload) => {
    const parsed = TagDeleteInput.parse(payload)
    const res = deleteTag(parsed.id)
    return TagDeleteOutput.parse(res)
  })
  ipcMain.handle('tags.usage', async (_e, payload) => {
    const parsed = TagUsageInput.parse(payload)
    const res = tagUsage(parsed.tagId)
    return TagUsageOutput.parse(res)
  })

  // Audit: recent actions
  ipcMain.handle('audit.recent', async (_e, payload) => {
    const parsed = AuditRecentInput.parse(payload) ?? { limit: 20 }
    const rows = listRecentAudit(parsed.limit)
    return AuditRecentOutput.parse({ rows })
  })

  // Members
  ipcMain.handle('members.groups.list', () => listMemberGroups())
  ipcMain.handle('members.groups.change', (_event, payload) => changeMemberGroup(GroupChangeSchema.parse(payload)))
  ipcMain.handle('members.audience', (_event, payload) => memberAudience(MemberAudienceSchema.parse(payload)))
  ipcMain.handle('members.history', async (_e, payload) => {
    return MemberHistoryOutput.parse(getMemberHistory(MemberHistoryInput.parse(payload)))
  })
  ipcMain.handle('members.list', async (_e, payload) => {
    const parsed = MembersListInput.parse(payload) ?? { limit: 50 }
    return MembersListOutput.parse(listMembers(parsed as any))
  })
  ipcMain.handle('members.create', async (_e, payload) => {
    const parsed = MemberCreateInput.parse(payload)
    const res = createMember(parsed as any)
    return MemberCreateOutput.parse(res)
  })
  ipcMain.handle('members.update', async (_e, payload) => {
    const parsed = MemberUpdateInput.parse(payload)
    const res = updateMember(parsed as any)
    return MemberUpdateOutput.parse(res)
  })
  ipcMain.handle('members.delete', async (_e, payload) => {
    const parsed = MemberDeleteInput.parse(payload)
    const res = deleteMember(parsed.id)
    return MemberDeleteOutput.parse(res)
  })
  ipcMain.handle('members.get', async (_e, payload) => {
    const parsed = MemberGetInput.parse(payload)
    const res = getMemberById(parsed.id)
    return MemberGetOutput.parse(res)
  })

  // Members export (Excel/PDF)
  ipcMain.handle('members.export', async (_e, payload: MembersExportOptions) => {
    const { exportMembers } = await loadMembersExportService()
    const result = await exportMembers(payload)
    return result
  })

  // Membership payments
  ipcMain.handle('payments.availableVouchers', (_e, payload) => availableContributionVouchers(z.object({ q: z.string().optional() }).parse(payload).q))
  ipcMain.handle('payments.previewAllocation', (_e, payload) => previewContributionPayment(ContributionPaymentInput.parse(payload)))
  ipcMain.handle('payments.allocate', (_e, payload) => allocateContributionPayment(ContributionPaymentInput.extend({ token: z.string().length(64) }).parse(payload)))
  ipcMain.handle('payments.periods', (_e, payload) => {
    const input = z.object({ memberId: z.number().int().positive(), through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(payload)
    return contributionPeriods(input.memberId, input.through)
  })
  ipcMain.handle('payments.removeReceipt', (_e, payload) => removeContributionReceipt(z.object({ receiptId: z.number().int().positive() }).parse(payload).receiptId))
  ipcMain.handle('payments.listDue', async (_e, payload) => {
    const parsed = PaymentsListDueInput.parse(payload)
    const res = mp.listDue(parsed as any)
    return PaymentsListDueOutput.parse(res as any)
  })
  ipcMain.handle('payments.bookContribution', (_event, payload) => {
    const input = ContributionBookingInput.parse(payload)
    if (getActiveOrganization()?.id !== input.organizationId) {
      throw new Error('Der Verein wurde gewechselt. Bitte die Beitragsbuchung im ursprünglichen Verein öffnen.')
    }
    return bookContribution(input)
  })
  ipcMain.handle('payments.markPaid', async (_e, payload) => {
    const parsed = PaymentsMarkPaidInput.parse(payload)
    const res = mp.markPaid(parsed as any)
    return PaymentsMarkPaidOutput.parse(res as any)
  })
  ipcMain.handle('payments.unmark', async (_e, payload) => {
    const parsed = PaymentsUnmarkInput.parse(payload)
    const res = mp.unmark(parsed as any)
    return PaymentsUnmarkOutput.parse(res as any)
  })
  ipcMain.handle('payments.suggestVouchers', async (_e, payload) => {
    const parsed = PaymentsSuggestVouchersInput.parse(payload)
    const res = mp.suggestVouchers(parsed as any)
    return PaymentsSuggestVouchersOutput.parse(res as any)
  })
  ipcMain.handle('payments.status', async (_e, payload) => {
    const res = mp.status(payload as any)
    return res as any
  })
  ipcMain.handle('payments.dueSummary', async () => {
    return PaymentsDueSummaryOutput.parse(mp.dueSummary())
  })
  ipcMain.handle('payments.history', async (_e, payload) => {
    const res = mp.history(payload as any)
    return res as any
  })

  // Year-end (Jahresabschluss)
  ipcMain.handle('yearEnd.preview', async (_e, payload) => {
    const parsed = YearEndPreviewInput.parse(payload)
    const yearEnd = await loadYearEndService()
    const res = await yearEnd.preview(parsed.year)
    return YearEndPreviewOutput.parse(res as any)
  })
  ipcMain.handle('yearEnd.export', async (_e, payload) => {
    const parsed = YearEndExportInput.parse(payload)
    const yearEnd = await loadYearEndService()
    const res = await yearEnd.exportPackage(parsed.year)
    return YearEndExportOutput.parse(res as any)
  })
  ipcMain.handle('yearEnd.close', async (_e, payload) => {
    const parsed = YearEndCloseInput.parse(payload)
    // Safety: create a backup before locking a period
    await requireSafetyBackup(backup.makeBackup, 'preClose', 'Jahresabschluss durchführen')
    const yearEnd = await loadYearEndService()
    const res = yearEnd.closeYear(parsed.year)
    return YearEndCloseOutput.parse(res as any)
  })
  ipcMain.handle('yearEnd.reopen', async (_e, payload) => {
    const parsed = YearEndReopenInput.parse(payload)
    const yearEnd = await loadYearEndService()
    const res = yearEnd.reopenAfter(parsed.year)
    return YearEndReopenOutput.parse(res as any)
  })
  ipcMain.handle('yearEnd.status', async () => {
    const yearEnd = await loadYearEndService()
    const res = yearEnd.status()
    return YearEndStatusOutput.parse(res as any)
  })

  // ── Cash checks (Kassenprüfung) ──────────────────────────
  ipcMain.handle('cashChecks.list', async (_e, payload) => {
    const parsed = CashChecksListInput.parse(payload)
    const res = listCashChecks({ year: parsed.year })
    return CashChecksListOutput.parse(res)
  })
  ipcMain.handle('cashChecks.create', async (_e, payload) => {
    const parsed = CashChecksCreateInput.parse(payload)
    const res = createCashCheck(parsed as any)
    return CashChecksCreateOutput.parse(res)
  })
  ipcMain.handle('cashChecks.setInspectors', async (_e, payload) => {
    const parsed = CashChecksSetInspectorsInput.parse(payload)
    const res = setCashCheckInspectors(parsed as any)
    return CashChecksSetInspectorsOutput.parse(res)
  })
  ipcMain.handle('cashChecks.exportPdf', async (_e, payload) => {
    const parsed = CashChecksExportPdfInput.parse(payload)
    const res = await generateCashCheckPDF({ cashCheckId: parsed.id })
    return CashChecksExportPdfOutput.parse(res)
  })
  ipcMain.handle('cashChecks.getInspectorDefaults', async () => {
    const res = getCashCheckInspectorDefaults()
    return CashChecksGetInspectorDefaultsOutput.parse(res)
  })

  // Work queue (dashboard): lightweight summary counts
  ipcMain.handle('workQueue.summary', async () => {
    try {
      const d = getDb()
      const rowA = d
        .prepare(
          'SELECT COUNT(1) as c FROM vouchers v WHERE (SELECT COUNT(1) FROM voucher_files vf WHERE vf.voucher_id = v.id) = 0'
        )
        .get() as any
      const unlinkedReceiptsCount = Number(rowA?.c || 0)
      const lock = getSetting<{ closedUntil?: string | null }>('period_lock')
      const st = { closedUntil: lock?.closedUntil ?? null }
      let lockedEntriesCount = 0
      if (st?.closedUntil) {
        const r = d
          .prepare('SELECT COUNT(1) as c FROM vouchers WHERE date <= ?')
          .get(st.closedUntil) as any
        lockedEntriesCount = Number(r?.c || 0)
      }
      return { ok: true, unlinkedReceiptsCount, lockedEntriesCount }
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  // Invoices
  ipcMain.handle('invoices.create', async (_e, payload) => {
    const parsed = InvoiceCreateInput.parse(payload)
    const res = await withSchemaHealRetry(
      () => createInvoice(parsed as any),
      ['invoices.payment_account_id', 'invoices.note', 'invoice_budgets', 'invoice_earmarks']
    )
    return InvoiceCreateOutput.parse(res)
  })
  ipcMain.handle('invoices.update', async (_e, payload) => {
    const parsed = InvoiceUpdateInput.parse(payload)
    const res = await withSchemaHealRetry(
      () => updateInvoice(parsed as any),
      ['invoices.payment_account_id', 'invoices.note', 'invoice_budgets', 'invoice_earmarks']
    )
    return InvoiceUpdateOutput.parse(res)
  })
  ipcMain.handle('invoices.delete', async (_e, payload) => {
    const parsed = InvoiceDeleteInput.parse(payload)
    const res = deleteInvoice(parsed.id)
    return InvoiceDeleteOutput.parse(res)
  })
  ipcMain.handle('invoices.list', async (_e, payload) => {
    const parsed = InvoicesListInput.parse(payload) ?? {}
    const { rows, total } = await withSchemaHealRetry(
      () => listInvoicesPaged(parsed as any),
      ['invoices.payment_account_id', 'invoice_budgets', 'invoice_earmarks']
    )
    return InvoicesListOutput.parse({ rows, total })
  })
  ipcMain.handle('invoices.summary', async (_e, payload) => {
    const parsed = InvoicesSummaryInput.parse(payload) ?? {}
    const res = await withSchemaHealRetry(
      () => summarizeInvoices(parsed as any),
      ['invoices.payment_account_id', 'invoice_budgets', 'invoice_earmarks']
    )
    return InvoicesSummaryOutput.parse(res as any)
  })
  ipcMain.handle('invoices.get', async (_e, payload) => {
    const parsed = InvoiceByIdInput.parse(payload)
    const res = await withSchemaHealRetry(
      () => getInvoiceById(parsed.id),
      ['invoices.payment_account_id', 'invoice_budgets', 'invoice_earmarks']
    )
    return InvoiceByIdOutput.parse(res as any)
  })
  ipcMain.handle('invoices.addPayment', async (_e, payload) => {
    const parsed = InvoiceAddPaymentInput.parse(payload)
    const res = await withSchemaHealRetry(
      () => addPayment(parsed),
      ['invoices.payment_account_id', 'invoice_budgets', 'invoice_earmarks']
    )
    return InvoiceAddPaymentOutput.parse(res as any)
  })
  ipcMain.handle('invoices.markPaid', async (_e, payload) => {
    const parsed = InvoiceByIdInput.parse(payload)
    const res = await withSchemaHealRetry(
      () => markPaid(parsed.id),
      ['invoices.payment_account_id', 'invoice_budgets', 'invoice_earmarks']
    )
    return InvoiceAddPaymentOutput.parse(res as any)
  })
  ipcMain.handle('invoices.postToVoucher', async (_e, payload) => {
    const parsed = InvoicePostToVoucherInput.parse(payload)
    const res = await withSchemaHealRetry(
      () => postInvoiceToVoucher(parsed.invoiceId),
      ['invoices.payment_account_id', 'invoice_budgets', 'invoice_earmarks']
    )
    return InvoicePostToVoucherOutput.parse(res)
  })

  // Invoice files: open/save/read
  ipcMain.handle('invoiceFiles.open', async (_e, payload) => {
    const parsed = AttachmentOpenInput.parse(payload)
    const f = getInvoiceFileById(parsed.fileId)
    if (!f) throw new Error('Datei nicht gefunden')
    const pathBase = path.basename(f.filePath || '')
    let src = f.filePath
    try {
      if (!fs.existsSync(src)) {
        const alt = path.join(getAppDataDir().filesDir, pathBase)
        if (fs.existsSync(alt)) src = alt
      }
    } catch {}
    const res = await shell.openPath(src)
    const ok = !res
    return AttachmentOpenOutput.parse({ ok })
  })
  ipcMain.handle('invoiceFiles.saveAs', async (_e, payload) => {
    const parsed = AttachmentSaveAsInput.parse(payload)
    const f = getInvoiceFileById(parsed.fileId)
    if (!f) throw new Error('Datei nicht gefunden')
    const save = await dialog.showSaveDialog({
      title: 'Datei speichern unter …',
      defaultPath: f.fileName
    })
    if (save.canceled || !save.filePath) throw new Error('Abbruch')
    const pathBase = path.basename(f.filePath || '')
    let src = f.filePath
    if (!src || !fs.existsSync(src)) {
      const alt = path.join(getAppDataDir().filesDir, pathBase)
      if (fs.existsSync(alt)) src = alt
    }
    if (!src || !fs.existsSync(src))
      throw new Error('Quelldatei nicht gefunden: ' + (f.filePath || pathBase))
    await fsp.copyFile(src, save.filePath)
    return AttachmentSaveAsOutput.parse({ filePath: save.filePath })
  })
  ipcMain.handle('invoiceFiles.read', async (_e, payload) => {
    const parsed = AttachmentReadInput.parse(payload)
    const f = getInvoiceFileById(parsed.fileId)
    if (!f) throw new Error('Datei nicht gefunden')
    const pathBase = path.basename(f.filePath || '')
    let src = f.filePath
    if (!src || !fs.existsSync(src)) {
      const alt = path.join(getAppDataDir().filesDir, pathBase)
      if (fs.existsSync(alt)) src = alt
    }
    if (!src || !fs.existsSync(src))
      throw new Error('Quelldatei nicht gefunden: ' + (f.filePath || pathBase))
    const buff = await fsp.readFile(src)
    return AttachmentReadOutput.parse({
      fileName: f.fileName,
      mimeType: f.mimeType || undefined,
      dataBytes: new Uint8Array(buff.buffer, buff.byteOffset, buff.byteLength)
    })
  })

  // Invoice files CRUD for edit modal
  ipcMain.handle('invoiceFiles.list', async (_e, payload) => {
    const parsed = InvoiceFilesListInput.parse(payload)
    const files = await withSchemaHealRetry(
      () => listFilesForInvoice(parsed.invoiceId),
      ['invoices.payment_account_id', 'invoice_budgets', 'invoice_earmarks']
    )
    return InvoiceFilesListOutput.parse({
      files: files.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        mimeType: f.mimeType ?? null,
        size: f.size ?? null,
        createdAt: f.createdAt ?? null
      }))
    })
  })
  ipcMain.handle('invoiceFiles.add', async (_e, payload) => {
    const parsed = InvoiceFileAddInput.parse(payload)
    const res = addFileToInvoice(
      parsed.invoiceId,
      parsed.fileName,
      parsed,
      parsed.mimeType
    )
    return InvoiceFileAddOutput.parse(res)
  })
  ipcMain.handle('invoiceFiles.delete', async (_e, payload) => {
    const parsed = InvoiceFileDeleteInput.parse(payload)
    const res = deleteInvoiceFile(parsed.fileId)
    return InvoiceFileDeleteOutput.parse(res)
  })

  // Settings: simple key/value
  ipcMain.handle('settings.get', async (_e, payload) => {
    const parsed = SettingsGetInput.parse(payload)
    assertPublicSetting(parsed.key)
    const value = getSetting(parsed.key)
    return SettingsGetOutput.parse({ value })
  })
  ipcMain.handle('settings.set', async (_e, payload) => {
    const parsed = SettingsSetInput.parse(payload)
    assertPublicSetting(parsed.key)
    setSetting(parsed.key, parsed.value)
    return SettingsSetOutput.parse({ ok: true })
  })
  ipcMain.handle('docling.status', async (_e, force?: boolean) => {
    const { getDoclingStatus } = await import('../services/docling')
    return getDoclingStatus(Boolean(force))
  })
  ipcMain.handle('docling.setEnabled', async (_e, enabled?: boolean) => {
    const { setDoclingEnabled } = await import('../services/docling')
    return setDoclingEnabled(Boolean(enabled))
  })
  ipcMain.handle('docling.extract', async (_e, payload) => {
    const { extractWithDocling } = await import('../services/docling')
    return extractWithDocling(payload)
  })
  ipcMain.handle('ocr.status', async () => {
    const { getOcrStatus } = await import('../services/ocr')
    return getOcrStatus()
  })
  ipcMain.handle('ocr.extract', async (event, payload) => {
    const senderFrame = event.senderFrame
    const senderUrl = senderFrame?.url || ''
    const isTrustedRenderer =
      senderFrame === event.sender.mainFrame &&
      (senderUrl.startsWith('file:') ||
        /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(senderUrl))
    if (!isTrustedRenderer) throw new Error('Nicht erlaubter OCR-Aufruf.')
    const parsed = LocalOcrExtractInput.parse(payload)
    const { extractWithTesseract } = await import('../services/ocr')
    return LocalOcrExtractOutput.parse(await extractWithTesseract(parsed.images))
  })

  // Tax Exemption Certificate
  ipcMain.handle('taxExemption.get', async () => {
    const certificate = getTaxExemptionCertificate()
    return TaxExemptionGetOutput.parse({ certificate })
  })
  ipcMain.handle('taxExemption.save', async (_e, payload) => {
    const parsed = TaxExemptionSaveInput.parse(payload)
    const certificate = {
      fileName: parsed.fileName,
      uploadDate: new Date().toISOString(),
      validFrom: parsed.validFrom,
      validUntil: parsed.validUntil,
      fileData: parsed.fileData,
      mimeType: parsed.mimeType,
      fileSize: parsed.fileSize
    }
    saveTaxExemptionCertificate(certificate)
    return TaxExemptionSaveOutput.parse({ ok: true })
  })
  ipcMain.handle('taxExemption.delete', async () => {
    deleteTaxExemptionCertificate()
    return TaxExemptionDeleteOutput.parse({ ok: true })
  })
  ipcMain.handle('taxExemption.updateValidity', async (_e, payload) => {
    const parsed = TaxExemptionUpdateValidityInput.parse(payload)
    updateTaxExemptionValidity(parsed.validFrom, parsed.validUntil)
    return TaxExemptionUpdateValidityOutput.parse({ ok: true })
  })

  ipcMain.handle('donations.exportMoneyReceipt', async (_e, payload) => {
    const parsed = DonationsExportMoneyReceiptInput.parse(payload)
    const res = await exportMoneyDonationReceiptPdf(parsed)
    return DonationsExportMoneyReceiptOutput.parse(res)
  })

  // Members: quick letter generation (RTF) and open
  ipcMain.handle(
    'members.writeLetter',
    async (
      _e,
      payload: { id?: number; name: string; address?: string | null; memberNo?: string | null }
    ) => {
      try {
        // If no address provided from renderer, try to load from DB by id
        let effectiveAddress = payload.address || ''
        if ((!effectiveAddress || !effectiveAddress.trim()) && payload.id) {
          try {
            const m = getMemberById(Number(payload.id))
            if (m?.address) effectiveAddress = String(m.address)
          } catch {
            /* ignore */
          }
        }
        // Prepare address block (top-left): Name, then street, then "ZIP City"
        const rawAddr = (effectiveAddress || '').trim()
        let street = '',
          zipCity = ''
        if (rawAddr) {
          const idx = rawAddr.lastIndexOf(',')
          if (idx >= 0) {
            street = rawAddr.slice(0, idx).trim()
            zipCity = rawAddr.slice(idx + 1).trim()
          } else {
            street = rawAddr
          }
        }

        // Build current date (German locale)
        const today = new Date()
        const datePretty = today.toLocaleDateString('de-DE', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
        // Try to extract city from address (expecting "Straße, PLZ Ort")
        let city = ''
        if (zipCity) {
          const m = /^(?:\d{4,5}\s+)?(.+)$/.exec(zipCity || '')
          city = (m?.[1] || '').trim()
        }
        const dateLine = (city ? city + ', ' : '') + datePretty

        const contributionParagraphs = memberLetterContributionParagraphs(payload.id)
        const subject = contributionParagraphs.length ? 'Offene Mitgliedsbeiträge' : '<<Betreff eintragen>>'

        // RTF helpers: escape control chars and encode non-ASCII as Unicode escapes
        function rtfUnicodeEncode(s: string): string {
          const map: Record<string, string> = {
            ä: '\\u228?',
            ö: '\\u246?',
            ü: '\\u252?',
            Ä: '\\u196?',
            Ö: '\\u214?',
            Ü: '\\u220?',
            ß: '\\u223?'
          }
          let out = ''
          for (const ch of s) {
            if (ch === '\\' || ch === '{' || ch === '}') {
              out += '\\' + ch
              continue
            }
            const code = ch.codePointAt(0) as number
            if (code < 128) {
              out += ch
            } else if (map[ch]) {
              out += map[ch]
            } else {
              // RTF expects signed 16-bit for \uN; clamp
              const signed = (code & 0xffff) > 0x7fff ? (code & 0xffff) - 0x10000 : code & 0xffff
              out += `\\u${signed}?`
            }
          }
          return out
        }

        // Determine salutation
        const name = payload.name || ''
        const lastName = (() => {
          const parts = name.trim().split(/\s+/)
          return parts.length ? parts[parts.length - 1] : name
        })()
        const hasHerr = /\bHerr\b/i.test(name)
        const hasFrau = /\bFrau\b/i.test(name)
        const salutation = hasHerr
          ? `Sehr geehrter Herr ${lastName},`
          : hasFrau
            ? `Sehr geehrte Frau ${lastName},`
            : `Sehr geehrte/r ${name},`

        // Minimal, Word-compatible RTF with margins and font table
        const rtf = [
          '{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1',
          '{\\fonttbl{\\f0 Arial;}}',
          '\\paperw11906\\paperh16838\\margl1134\\margr1134\\margt1134\\margb1134', // ~2cm margins
          '\\fs22',
          // Address block (top-left) with real RTF line breaks
          '{\\pard ' +
            rtfUnicodeEncode(payload.name || '') +
            (street ? ' \\line ' + rtfUnicodeEncode(street) : '') +
            (zipCity ? ' \\line ' + rtfUnicodeEncode(zipCity) : '') +
            ' \\par}\\par',
          // Subject (bold)
          '{\\pard\\b ' + rtfUnicodeEncode('Betreff: ' + subject) + ' \\b0 \\par}',
          // City + Pretty Date
          '{\\pard ' + rtfUnicodeEncode(dateLine) + ' \\par}\\par',
          // Salutation and body paragraphs
          '{\\pard ' + rtfUnicodeEncode(salutation) + ' \\par}\\par',
          '{\\pard ' +
            rtfUnicodeEncode('wir wenden uns an Sie bezüglich Ihrer Mitgliedsbeiträge im Verein.') +
            ' \\par}\\par',
          ...contributionParagraphs.map(text => '{\\pard ' + rtfUnicodeEncode(text) + ' \\par}\\par'),
          '{\\pard ' +
            rtfUnicodeEncode(
              'Falls Sie Fragen oder Unklarheiten haben, melden Sie sich bitte bei uns. Wir stehen Ihnen gerne zur Verfügung.'
            ) +
            ' \\par}\\par',
          '{\\pard ' + rtfUnicodeEncode('Mit freundlichen Grüßen') + ' \\par}',
          '{\\pard ' + rtfUnicodeEncode('Ihr Vereinsvorstand') + ' \\par}',
          '}'
        ].join('\n')

        const os = process.platform
        const tmpDir =
          os === 'win32' ? process.env.TEMP || process.env.TMP || '.' : process.env.TMPDIR || '/tmp'
        const fname = `Mitglied_${(payload.memberNo || payload.name || 'Brief').toString().replace(/[^a-zA-Z0-9_-]+/g, '_')}_${Date.now()}.rtf`
        const fullPath = path.join(tmpDir, fname)
        // Write as ASCII-safe string (contains only ASCII and RTF escapes), avoid UTF-8 BOM issues
        await fsp.writeFile(fullPath, rtf, 'ascii')
        await shell.openPath(fullPath)
        return { ok: true, filePath: fullPath }
      } catch (e: any) {
        return { ok: false, error: e?.message || String(e) }
      }
    }
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Primary classification (tax spheres or freely maintained categories)
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle('classifications.primary.list', async () => {
    return {
      profile: getOrganizationProfile(),
      canChangeProfile: canChangeOrganizationProfile(),
      definition: getOrganizationProfileDefinition(),
      scheme: getPrimaryClassificationScheme(),
      values: listPrimaryClassificationValues({ includeInactive: true })
    }
  })

  ipcMain.handle(
    'classifications.primary.create',
    async (_e, payload: { name?: string; color?: string | null; icon?: string | null; description?: string | null }) => {
      if (!payload?.name) throw new Error('Kategoriename ist erforderlich')
      return createGeneralClassificationValue({
        name: payload.name,
        color: payload.color,
        icon: payload.icon,
        description: payload.description
      })
    }
  )

  ipcMain.handle(
    'classifications.primary.update',
    async (_e, payload: {
      id?: number
      name?: string
      color?: string | null
      icon?: string | null
      description?: string | null
      isActive?: boolean
    }) => {
      if (!Number.isInteger(payload?.id) || Number(payload.id) <= 0) {
        throw new Error('Ungültige Kategorie')
      }
      return updateGeneralClassificationValue({
        id: Number(payload.id),
        name: payload.name,
        color: payload.color,
        icon: payload.icon,
        description: payload.description,
        isActive: payload.isActive
      })
    }
  )

  ipcMain.handle('classifications.profile.update', async (_e, payload: { profile?: OrganizationProfile }) => {
    const profile = payload?.profile
    if (!profile || !ORGANIZATION_PROFILES.includes(profile)) {
      throw new Error('Ungültiges Organisationsprofil')
    }
    const result = setOrganizationProfile(profile)
    const organization = getActiveOrganization()
    if (organization && organization.id !== 'default') {
      setOrganizationConfigProfile(organization.id, profile)
    }
    return result
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Organization Management
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle('organizations.list', async () => {
    return { organizations: listOrganizations() }
  })

  ipcMain.handle('organizations.active', async () => {
    return { organization: getActiveOrganization() }
  })

  ipcMain.handle('organizations.create', async (_e, payload: { name: string; profile?: OrganizationProfile }) => {
    if (!payload?.name) throw new Error('Name ist erforderlich')
    const profile = payload.profile ?? 'NONPROFIT'
    if (!ORGANIZATION_PROFILES.includes(profile)) throw new Error('Ungültiges Organisationsprofil')
    const org = createOrganization(payload.name, profile)
    return { organization: org }
  })

  ipcMain.handle('organizations.switch', async (_e, payload: { orgId: string }) => {
    if (!payload?.orgId) throw new Error('orgId ist erforderlich')
    if (options.hasDetachedQuickAdds?.()) throw new Error('Bitte zuerst die separaten Erfassungsfenster schließen, bevor du den Verein wechselst.')
    const before = getActiveOrganization()
    const beforeId = before?.id || 'default'
    const result = switchOrganization(payload.orgId)

    // Ensure DB is initialized for the newly active organization.
    // This is critical because renderer reload does NOT restart the main process.
    try {
      const db = getDb()
      applyMigrations(db)
      // The profile is written with the organization configuration before its
      // database exists. Apply it only after the fresh database schema is ready.
      // Existing organizations without a stored profile keep the non-profit
      // default created by the migration.
      if (result.org.profile) setOrganizationProfile(result.org.profile)
    } catch (err) {
      // Roll back config to the previous org to avoid leaving the app in a broken state.
      try {
        switchOrganization(beforeId)
      } catch {
        /* ignore rollback errors */
      }
      throw err
    }
    // Signal renderer to reload
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('organizations:switched', result.org)
    }
    return result
  })

  ipcMain.handle('organizations.rename', async (_e, payload: { orgId: string; name: string }) => {
    if (!payload?.orgId || !payload?.name) throw new Error('orgId und name sind erforderlich')
    return renameOrganization(payload.orgId, payload.name)
  })

  ipcMain.handle(
    'organizations.delete',
    async (_e, payload: { orgId: string; deleteData?: boolean }) => {
      if (!payload?.orgId) throw new Error('orgId ist erforderlich')
      if (options.hasDetachedQuickAdds?.()) throw new Error('Bitte zuerst die separaten Erfassungsfenster schließen, bevor du einen Verein löschst.')

      const before = getActiveOrganization()
      const beforeId = before?.id || 'default'
      const result = await deleteOrganization(payload.orgId, payload.deleteData ?? false)

      const after = getActiveOrganization()
      const afterId = after?.id || 'default'

      // If the active organization changed (e.g. deleted active org), ensure DB is initialized.
      if (afterId !== beforeId) {
        try {
          const db = getDb()
          applyMigrations(db)
        } catch (err) {
          // Deletion already succeeded (config/data updated).
          // Do not fail the delete call because a follow-up migration failed.
          console.warn('[organizations.delete] post-switch migration failed:', err)
        }

        const win = BrowserWindow.getFocusedWindow()
        if (win && after) {
          win.webContents.send('organizations:switched', {
            id: after.id,
            name: after.name,
            dbRoot: after.dbRoot
          })
        }
      }

      return result
    }
  )

  ipcMain.handle('organizations.getAppearance', async (_e, payload: { orgId: string }) => {
    if (!payload?.orgId) throw new Error('orgId ist erforderlich')
    return getOrganizationAppearance(payload.orgId)
  })

  ipcMain.handle(
    'organizations.setAppearance',
    async (
      _e,
      payload: {
        orgId: string
        colorTheme?: string
        backgroundImage?: string
        backgroundImageVisibility?: number
        customBackgroundImage?: string | null
        glassModals?: boolean
        bookingView?: 'classic' | 'plus'
      }
    ) => {
      if (!payload?.orgId) throw new Error('orgId ist erforderlich')
      return setOrganizationAppearance(payload.orgId, {
        colorTheme: payload.colorTheme,
        backgroundImage: payload.backgroundImage,
        backgroundImageVisibility: payload.backgroundImageVisibility,
        customBackgroundImage: payload.customBackgroundImage,
        glassModals: payload.glassModals,
        bookingView: payload.bookingView
      })
    }
  )

  ipcMain.handle('organizations.activeAppearance', async () => {
    return getActiveOrganizationAppearance()
  })
}
