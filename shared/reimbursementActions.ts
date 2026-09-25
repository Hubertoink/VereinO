import { z } from 'zod'
import type { ReimbursementDetail, ReimbursementVoucher } from './reimbursements'

const id = z.number().int().positive()
const metadata = {
  title: z.string().trim().min(1).max(200), partner: z.string().trim().min(1).max(200),
  dueDate: z.string().date().nullable(), note: z.string().max(10000)
}
const allocation = { voucherId: id, amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }
export const reimbursementCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('CREATE'), ...metadata, ...allocation }),
  z.object({ action: z.literal('UPDATE'), id, ...metadata }),
  z.object({ action: z.literal('LINK'), id, role: z.enum(['EXPENSE', 'PAYMENT']), ...allocation }),
  z.object({ action: z.literal('UNLINK'), id, linkId: id }),
  z.object({ action: z.literal('DELETE'), id })
])
export type ReimbursementCommand = z.infer<typeof reimbursementCommandSchema>
export type ReimbursementActionPreview = {
  command: ReimbursementCommand
  before: ReimbursementDetail | null
  voucher: ReimbursementVoucher | null
  expectedState: string
}
export type ReimbursementReviewState = {
  changes: Array<ReimbursementActionPreview & { id: string; selected: boolean; applied?: boolean }>
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}
