import { z } from 'zod'

export const MembersImportPreviewInput = z.object({ fileBase64: z.string().min(1) })
export const MembersImportExecuteInput = MembersImportPreviewInput.extend({
  mapping: z.record(z.string().nullable()),
  updateExisting: z.boolean().optional(),
  rowEdits: z.record(z.string().regex(/^[1-9]\d*$/), z.record(z.string())).optional()
})

export type MembersImportPreview = {
  headers: string[]
  sample: Array<Record<string, unknown>>
  suggestedMapping: Record<string, string | null>
  headerRowIndex: number
}

export type MembersImportExecuteResult = {
  imported: number
  skipped: number
  updated: number
  errors: Array<{ row: number; message: string }>
  rowStatuses?: Array<{ row: number; ok: boolean; message?: string }>
  errorFilePath?: string
}

export type MembersImportApi = {
  preview: (input: z.infer<typeof MembersImportPreviewInput>) => Promise<MembersImportPreview>
  execute: (input: z.infer<typeof MembersImportExecuteInput>) => Promise<MembersImportExecuteResult>
  template: () => Promise<{ filePath: string }>
  testdata: () => Promise<{ filePath: string }>
}
