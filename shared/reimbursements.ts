import type { ReimbursementCommand } from './reimbursementActions'
export type ReimbursementRole = 'EXPENSE' | 'PAYMENT'
export type ReimbursementStatus = 'OPEN' | 'PARTIAL' | 'PAID'
export type Reimbursement = {
  id: number; title: string; partner: string; dueDate: string | null; note: string
  expectedCents: number; paidCents: number; remainingCents: number; status: ReimbursementStatus
}
export type ReimbursementVoucher = {
  id: number; voucherNo: string; date: string; type: 'IN' | 'OUT'; description: string | null
  grossAmount: number; paymentAccountName: string | null; availableCents: number
}
export type ReimbursementLink = ReimbursementVoucher & { linkId: number; role: ReimbursementRole; amountCents: number }
export type ReimbursementDetail = Reimbursement & { links: ReimbursementLink[] }
export type ReimbursementMetadata = { title: string; partner: string; dueDate?: string | null; note?: string }
export interface ReimbursementsApi {
  reimbursements: {
    linkedVoucherIds: () => Promise<number[]>
    applyAction: (input: { command: ReimbursementCommand; expectedState: string }) => Promise<ReimbursementDetail | null>
    applyActions: (input: { changes: Array<{ command: ReimbursementCommand; expectedState: string }> }) => Promise<Array<ReimbursementDetail | null>>
    list: (input?: { voucherId?: number; q?: string }) => Promise<Reimbursement[]>
    get: (input: { id: number }) => Promise<ReimbursementDetail>
    create: (input: ReimbursementMetadata & { voucherId: number; amountCents: number }) => Promise<ReimbursementDetail>
    update: (input: ReimbursementMetadata & { id: number }) => Promise<ReimbursementDetail>
    link: (input: { id: number; voucherId: number; role: ReimbursementRole; amountCents: number }) => Promise<ReimbursementDetail>
    unlink: (input: { id: number; linkId: number }) => Promise<ReimbursementDetail>
    delete: (input: { id: number }) => Promise<{ ok: boolean }>
    candidates: (input: { role: ReimbursementRole; q?: string; voucherId?: number }) => Promise<ReimbursementVoucher[]>
  }
}
