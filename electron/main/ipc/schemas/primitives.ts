import { z } from 'zod'

export const VoucherType = z.enum(['IN', 'OUT', 'TRANSFER', 'INTERNAL'])
export const Sphere = z.enum(['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'])
export const PaymentMethod = z.enum(['BAR', 'BANK'])
export const PaymentAccountKind = z.enum(['CASH', 'BANK', 'PAYPAL', 'CARD', 'OTHER'])
export const VoucherAmountMode = z.enum(['NET', 'GROSS'])

export const VoucherBudgetAssignment = z.object({
  budgetId: z.number(),
  amount: z.number()
})

export const VoucherEarmarkAssignment = z.object({
  earmarkId: z.number(),
  amount: z.number()
})

export const BinaryBytes = z.custom<Uint8Array>(
  (value) => value instanceof Uint8Array,
  'Ungültige Binärdaten'
)

export const FileDataFields = {
  dataBytes: BinaryBytes.optional(),
  dataBase64: z.string().optional()
}

export const hasFileData = (value: { dataBytes?: Uint8Array; dataBase64?: string }) =>
  (value.dataBytes instanceof Uint8Array && value.dataBytes.byteLength > 0) ||
  (typeof value.dataBase64 === 'string' && value.dataBase64.length > 0)

export const ImportFileFields = {
  fileBytes: BinaryBytes.optional(),
  fileBase64: z.string().optional()
}

export const hasImportFileData = (value: { fileBytes?: Uint8Array; fileBase64?: string }) =>
  (value.fileBytes instanceof Uint8Array && value.fileBytes.byteLength > 0) ||
  (typeof value.fileBase64 === 'string' && value.fileBase64.length > 0)

export const UploadFileInput = z
  .object({
    name: z.string(),
    ...FileDataFields,
    mime: z.string().optional()
  })
  .refine(hasFileData, { message: 'Dateidaten fehlen.' })
