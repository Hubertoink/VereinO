import { z } from 'zod'
import { ImportMasterRowSchema } from './importMasterData'

export const AiImportOptionsSchema = z.object({
  guidance: z.string().max(4000).default(''),
  defaultAccount: z.string().default(''),
  tags: z.enum(['none', 'existing', 'suggest']).default('none'),
  budgets: z.enum(['none', 'existing', 'suggest']).default('none'),
  suggestCategories: z.boolean().default(false)
})
export type AiImportOptions = z.infer<typeof AiImportOptionsSchema>
export const AiImportDraftSchema = z.object({
  id: z.string(), sourceRow: z.number(), status: z.enum(['ok', 'warning', 'error', 'duplicate', 'ignored']),
  duplicateAction: z.enum(['skip', 'import', 'merge']).optional(), duplicateIds: z.array(z.number()).optional(),
  issues: z.array(z.object({ level: z.enum(['error', 'warning', 'info']), code: z.string(), message: z.string() })),
  original: z.record(z.any()), values: z.record(z.any())
})
export const AiImportRowSchema = z.object({
  draft: AiImportDraftSchema,
  sourceValues: z.record(z.any()),
  origins: z.record(z.enum(['source', 'default', 'ai', 'user'])),
  reasons: z.record(z.string()),
  selected: z.boolean(), relationsChecked: z.boolean().default(false), acceptedBudgetYear: z.string().optional()
})
export const AiImportRelationSchema = z.object({
  id: z.string(), rowIds: z.array(z.string()), voucherId: z.number().optional(),
  kind: z.enum(['duplicate', 'reversal', 'refund', 'transfer', 'unclear']), reason: z.string()
})
export const AiImportSessionSchema = z.object({
  id: z.string(), revision: z.number(), fileName: z.string(), fileHash: z.string(), sheetName: z.string(),
  profile: z.enum(['GENERAL', 'NONPROFIT']), createdAt: z.string(), updatedAt: z.string(),
  status: z.enum(['paused', 'running', 'review', 'failed', 'committed']),
  phase: z.enum(['mapping', 'extract', 'classify', 'groups', 'relations', 'validate', 'done']),
  completed: z.number(), total: z.number(), error: z.string().optional(),
  options: AiImportOptionsSchema, mapping: z.record(z.string().nullable()),
  rows: z.array(AiImportRowSchema), masterData: z.array(ImportMasterRowSchema),
  relations: z.array(AiImportRelationSchema), masterDataAccepted: z.boolean().default(false),
  warnings: z.array(z.string()), model: z.string().optional(), tokens: z.number().default(0),
  imported: z.number().optional(), voucherIds: z.array(z.number()).optional()
})
export type AiImportSession = z.infer<typeof AiImportSessionSchema>
export type AiImportRow = z.infer<typeof AiImportRowSchema>
export type AiImportRelation = z.infer<typeof AiImportRelationSchema>
export function budgetYearAcknowledgement(values: Record<string, unknown>, message: string) {
  return JSON.stringify([values.date, values.budget, message])
}
export const AiImportFileSchema = z.object({ fileName: z.string().min(1).max(255), fileBase64: z.string().max(15_000_000) })
export const AiImportCreateSchema = AiImportFileSchema.extend({ sheetName: z.string(), options: AiImportOptionsSchema, mapping: z.record(z.string().nullable()).optional() })
export const AiImportIdentitySchema = z.object({ id: z.string().uuid(), revision: z.number().int().nonnegative() })
export const AiImportSaveSchema = AiImportIdentitySchema.extend({ rows: z.array(AiImportRowSchema).max(1000), masterData: z.array(ImportMasterRowSchema).max(2000), masterDataAccepted: z.boolean() })
export type AiImportPreview = {
  sheets: Array<{ name: string; headerRow: number; headers: string[]; sample: Array<Record<string, unknown>>; count: number; mapping: Record<string, string | null> }>
  profile: 'GENERAL' | 'NONPROFIT'
  accounts: Array<{ id: number; name: string; label: string; kind?: string }>
  classifications: Array<{ name: string; label: string }>
  hasApiKey: boolean
}

// All provider outputs are proposals with source IDs, never executable actions.
export const AiImportMappingResult = z.object({ mapping: z.array(z.object({ field: z.string(), column: z.string().nullable() })) })
export const AiImportAssignmentResult = z.object({ rows: z.array(z.object({
  id: z.string(), account: z.string().nullable(), classification: z.string().nullable(), reason: z.string()
})) })
export const AiImportGroupsResult = z.object({ groups: z.array(z.object({
  kind: z.enum(['tag', 'budget']), name: z.string(), rowIds: z.array(z.string()), reason: z.string()
})) })
export const AiImportRelationsResult = z.object({ relations: z.array(z.object({ id: z.string(), kind: z.enum(['duplicate', 'reversal', 'refund', 'transfer', 'unclear']), reason: z.string() })) })
