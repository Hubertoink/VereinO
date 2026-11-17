import { z } from 'zod'

export const VoucherType = z.enum(['IN', 'OUT', 'TRANSFER', 'INTERNAL'])
export type VoucherType = z.infer<typeof VoucherType>
export const Sphere = z.enum(['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'])
export type Sphere = z.infer<typeof Sphere>
export const PaymentMethod = z.enum(['BAR', 'BANK'])
export type PaymentMethod = z.infer<typeof PaymentMethod>
export const PaymentAccountKind = z.enum(['CASH', 'BANK', 'PAYPAL', 'CARD', 'OTHER'])
export type PaymentAccountKind = z.infer<typeof PaymentAccountKind>
export const VoucherAmountMode = z.enum(['NET', 'GROSS'])
export type VoucherAmountMode = z.infer<typeof VoucherAmountMode>
export const InvoiceStatus = z.enum(['OPEN', 'PARTIAL', 'PAID'])
export type InvoiceStatus = z.infer<typeof InvoiceStatus>
