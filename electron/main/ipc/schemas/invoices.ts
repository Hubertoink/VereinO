import { z } from 'zod'
import { FileDataFields, hasFileData, Sphere, UploadFileInput } from './primitives'

// Invoices
const InvoiceStatus = z.enum(['OPEN', 'PARTIAL', 'PAID'])
export const InvoiceCreateInput = z.object({
  date: z.string(),
  dueDate: z.string().nullable().optional(),
  invoiceNo: z.string().nullable().optional(),
  party: z.string(),
  partyId: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  grossAmount: z.number(),
  paymentMethod: z.string().nullable().optional(),
  paymentAccountId: z.number().nullable().optional(),
  sphere: Sphere,
  primaryClassificationValueId: z.number().int().positive().nullable().optional(),
  earmarkId: z.number().nullable().optional(),
  budgetId: z.number().nullable().optional(),
  autoPost: z.boolean().optional(),
  voucherType: z.enum(['IN', 'OUT']),
  budgets: z.array(z.object({ budgetId: z.number(), amount: z.number().optional() })).optional(),
  earmarks: z.array(z.object({ earmarkId: z.number(), amount: z.number().optional() })).optional(),
  files: z.array(UploadFileInput).optional(),
  tags: z.array(z.string()).optional()
})
export const InvoiceCreateOutput = z.object({ id: z.number() })

export const InvoiceUpdateInput = z.object({
  id: z.number(),
  date: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  invoiceNo: z.string().nullable().optional(),
  party: z.string().optional(),
  partyId: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  grossAmount: z.number().optional(),
  paymentMethod: z.string().nullable().optional(),
  paymentAccountId: z.number().nullable().optional(),
  sphere: Sphere.optional(),
  primaryClassificationValueId: z.number().int().positive().nullable().optional(),
  earmarkId: z.number().nullable().optional(),
  budgetId: z.number().nullable().optional(),
  autoPost: z.boolean().optional(),
  voucherType: z.enum(['IN', 'OUT']).optional(),
  budgets: z.array(z.object({ budgetId: z.number(), amount: z.number().optional() })).optional(),
  earmarks: z.array(z.object({ earmarkId: z.number(), amount: z.number().optional() })).optional(),
  tags: z.array(z.string()).optional()
})
export const InvoiceUpdateOutput = z.object({ id: z.number() })

export const InvoiceDeleteInput = z.object({ id: z.number() })
export const InvoiceDeleteOutput = z.object({ id: z.number() })

export const InvoicesListInput = z
  .object({
    limit: z.number().min(1).max(100).default(20).optional(),
    offset: z.number().min(0).default(0).optional(),
    sort: z.enum(['ASC', 'DESC']).optional(),
    sortBy: z.enum(['date', 'due', 'amount', 'status']).optional(),
    status: z.enum(['OPEN', 'PARTIAL', 'PAID', 'ALL']).optional(),
    sphere: Sphere.optional(),
    budgetId: z.number().optional(),
    q: z.string().optional(),
    dueFrom: z.string().optional(),
    dueTo: z.string().optional(),
    tag: z.string().optional()
  })
  .optional()
export const InvoicesListOutput = z.object({
  rows: z.array(
    z.object({
      id: z.number(),
      date: z.string(),
      dueDate: z.string().nullable().optional(),
      invoiceNo: z.string().nullable().optional(),
      party: z.string(),
      partyId: z.number().int().positive().nullable().optional(),
      description: z.string().nullable().optional(),
      note: z.string().nullable().optional(),
      grossAmount: z.number(),
      paymentMethod: z.string().nullable().optional(),
      paymentAccountId: z.number().nullable().optional(),
      sphere: Sphere,
      primaryClassificationValueId: z.number().nullable(),
      primaryClassificationName: z.string().nullable(),
      primaryClassificationColor: z.string().nullable(),
      primaryClassificationIcon: z.string().nullable(),
      earmarkId: z.number().nullable().optional(),
      budgetId: z.number().nullable().optional(),
      autoPost: z.number().optional(),
      voucherType: z.enum(['IN', 'OUT']),
      postedVoucherId: z.number().nullable().optional(),
      postedVoucherNo: z.string().nullable().optional(),
      paidSum: z.number(),
      status: InvoiceStatus,
      fileCount: z.number().optional(),
      tags: z.array(z.string()).optional()
    })
  ),
  total: z.number()
})

// Invoices summary (totals)
export const InvoicesSummaryInput = z
  .object({
    status: z.enum(['OPEN', 'PARTIAL', 'PAID', 'ALL']).optional(),
    sphere: Sphere.optional(),
    budgetId: z.number().optional(),
    q: z.string().optional(),
    dueFrom: z.string().optional(),
    dueTo: z.string().optional(),
    tag: z.string().optional()
  })
  .optional()
export const InvoicesSummaryOutput = z.object({
  count: z.number(),
  gross: z.number(),
  paid: z.number(),
  remaining: z.number(),
  grossIn: z.number(),
  grossOut: z.number()
})
export type TInvoicesSummaryInput = z.infer<typeof InvoicesSummaryInput>
export type TInvoicesSummaryOutput = z.infer<typeof InvoicesSummaryOutput>

export const InvoiceByIdInput = z.object({ id: z.number() })
export const InvoiceByIdOutput = z.object({
  id: z.number(),
  date: z.string(),
  dueDate: z.string().nullable().optional(),
  invoiceNo: z.string().nullable().optional(),
  party: z.string(),
  partyId: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  grossAmount: z.number(),
  paymentMethod: z.string().nullable().optional(),
  paymentAccountId: z.number().nullable().optional(),
  paymentAccountName: z.string().nullable().optional(),
  paymentAccountKind: z.string().nullable().optional(),
  sphere: Sphere,
  primaryClassificationValueId: z.number().nullable(),
  primaryClassificationName: z.string().nullable(),
  primaryClassificationColor: z.string().nullable(),
  primaryClassificationIcon: z.string().nullable(),
  earmarkId: z.number().nullable().optional(),
  budgetId: z.number().nullable().optional(),
  autoPost: z.number().optional(),
  voucherType: z.enum(['IN', 'OUT']),
  postedVoucherId: z.number().nullable().optional(),
  postedVoucherNo: z.string().nullable().optional(),
  budgets: z.array(z.object({ budgetId: z.number(), amount: z.number() })).optional(),
  earmarks: z.array(z.object({ earmarkId: z.number(), amount: z.number() })).optional(),
  payments: z.array(z.object({ id: z.number(), date: z.string(), amount: z.number() })),
  files: z.array(
    z.object({
      id: z.number(),
      fileName: z.string(),
      mimeType: z.string().nullable().optional(),
      size: z.number().nullable().optional(),
      createdAt: z.string().nullable().optional()
    })
  ),
  tags: z.array(z.string()),
  paidSum: z.number(),
  status: InvoiceStatus
})

export const InvoiceAddPaymentInput = z.object({
  invoiceId: z.number(),
  date: z.string(),
  amount: z.number()
})
export const InvoiceAddPaymentOutput = z.object({
  id: z.number(),
  status: InvoiceStatus,
  paidSum: z.number(),
  voucherId: z.number().nullable().optional()
})

export type TInvoiceCreateInput = z.infer<typeof InvoiceCreateInput>
export type TInvoiceCreateOutput = z.infer<typeof InvoiceCreateOutput>
export type TInvoiceUpdateInput = z.infer<typeof InvoiceUpdateInput>
export type TInvoiceUpdateOutput = z.infer<typeof InvoiceUpdateOutput>
export type TInvoiceDeleteInput = z.infer<typeof InvoiceDeleteInput>
export type TInvoiceDeleteOutput = z.infer<typeof InvoiceDeleteOutput>
export type TInvoicesListInput = z.infer<typeof InvoicesListInput>
export type TInvoicesListOutput = z.infer<typeof InvoicesListOutput>
export type TInvoiceByIdInput = z.infer<typeof InvoiceByIdInput>
export type TInvoiceByIdOutput = z.infer<typeof InvoiceByIdOutput>
export type TInvoiceAddPaymentInput = z.infer<typeof InvoiceAddPaymentInput>
export type TInvoiceAddPaymentOutput = z.infer<typeof InvoiceAddPaymentOutput>

export const InvoicePostToVoucherInput = z.object({ invoiceId: z.number() })
export const InvoicePostToVoucherOutput = z.object({ id: z.number(), voucherId: z.number() })
export type TInvoicePostToVoucherInput = z.infer<typeof InvoicePostToVoucherInput>
export type TInvoicePostToVoucherOutput = z.infer<typeof InvoicePostToVoucherOutput>

// Invoice files (attachments for invoices)
export const InvoiceFilesListInput = z.object({ invoiceId: z.number() })
export const InvoiceFilesListOutput = z.object({
  files: z.array(
    z.object({
      id: z.number(),
      fileName: z.string(),
      mimeType: z.string().nullable().optional(),
      size: z.number().nullable().optional(),
      createdAt: z.string().nullable().optional()
    })
  )
})
export const InvoiceFileAddInput = z
  .object({
    invoiceId: z.number(),
    fileName: z.string(),
    ...FileDataFields,
    mimeType: z.string().optional()
  })
  .refine(hasFileData, { message: 'Dateidaten fehlen.' })
export const InvoiceFileAddOutput = z.object({ id: z.number() })
export const InvoiceFileDeleteInput = z.object({ fileId: z.number() })
export const InvoiceFileDeleteOutput = z.object({ id: z.number() })
export type TInvoiceFilesListInput = z.infer<typeof InvoiceFilesListInput>
export type TInvoiceFilesListOutput = z.infer<typeof InvoiceFilesListOutput>
export type TInvoiceFileAddInput = z.infer<typeof InvoiceFileAddInput>
export type TInvoiceFileAddOutput = z.infer<typeof InvoiceFileAddOutput>
export type TInvoiceFileDeleteInput = z.infer<typeof InvoiceFileDeleteInput>
export type TInvoiceFileDeleteOutput = z.infer<typeof InvoiceFileDeleteOutput>
