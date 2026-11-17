import { z } from 'zod'

// Wire contracts for backend/src/routes. The cloud ledger uses account bookings,
// not desktop vouchers; model conversion and desktop integration are not implemented.
export const CLOUD_CAPABILITIES = {
  auth: ['login', 'register', 'me'],
  vouchers: ['list', 'get', 'create', 'delete'],
  members: ['list', 'get', 'create', 'update', 'delete']
} as const

export const CloudUserSchema = z.object({
  id: z.number().int(), email: z.string(), organizationId: z.number().int(), organizationName: z.string()
})
export const CloudAuthResultSchema = z.object({ token: z.string().min(1), user: CloudUserSchema })

export const CloudVoucherCreateInputSchema = z.object({
  voucherDate: z.string(),
  voucherType: z.enum(['RECEIPT', 'INVOICE', 'JOURNAL']),
  description: z.string().optional(),
  bookings: z.array(z.object({
    accountId: z.number(), debit: z.number().optional(), credit: z.number().optional(),
    text: z.string().optional(), taxCode: z.string().optional()
  }).strict())
}).strict()

const CloudVoucherFieldsSchema = z.object({
  id: z.number().int(), voucher_number: z.number().int(), voucher_date: z.string(),
  voucher_type: CloudVoucherCreateInputSchema.shape.voucherType,
  description: z.string().nullable(), created_at: z.string(), updated_at: z.string()
})

// PostgreSQL COUNT (int8) and DECIMAL fields are returned as strings by this backend.
export const CloudVoucherListResultSchema = z.object({
  vouchers: z.array(CloudVoucherFieldsSchema.extend({ file_count: z.string().regex(/^\d+$/) })),
  total: z.number().int().nonnegative(), page: z.number().int(), limit: z.number().int()
})
export const CloudVoucherSchema = CloudVoucherFieldsSchema.extend({ organization_id: z.number().int() })
const DecimalString = z.string().regex(/^-?\d+(?:\.\d+)?$/)
export const CloudVoucherDetailSchema = CloudVoucherSchema.extend({
  bookings: z.array(z.object({
    id: z.number().int(), voucher_id: z.number().int(), account_id: z.number().int(),
    debit: DecimalString.nullable(), credit: DecimalString.nullable(),
    text: z.string().nullable(), tax_code: z.string().nullable(),
    created_at: z.string(), updated_at: z.string()
  })),
  attachments: z.array(z.object({
    id: z.number().int(), filename: z.string(), mime_type: z.string(), size: z.number().int(), created_at: z.string()
  }))
})

export const CloudMemberCreateInputSchema = z.object({
  firstName: z.string(), lastName: z.string(), email: z.string().email().optional(), phone: z.string().optional(),
  street: z.string().optional(), zip: z.string().optional(), city: z.string().optional(),
  memberNumber: z.string().optional(), joinDate: z.string().optional(), exitDate: z.string().optional(),
  isActive: z.boolean().default(true)
}).strict()
export const CloudMemberUpdateInputSchema = CloudMemberCreateInputSchema.partial()
export const CloudMemberSchema = z.object({
  id: z.number().int(), organization_id: z.number().int(), member_number: z.string().nullable(),
  first_name: z.string(), last_name: z.string(), email: z.string().nullable(), phone: z.string().nullable(),
  street: z.string().nullable(), zip: z.string().nullable(), city: z.string().nullable(),
  join_date: z.string().nullable(), exit_date: z.string().nullable(), is_active: z.boolean(),
  created_at: z.string(), updated_at: z.string()
})
export const CloudMemberListResultSchema = z.object({ members: z.array(CloudMemberSchema) })
export const CloudDeleteResultSchema = z.object({ success: z.literal(true) })

export type CloudUser = z.infer<typeof CloudUserSchema>
export type CloudAuthResult = z.infer<typeof CloudAuthResultSchema>
export type CloudVoucher = z.infer<typeof CloudVoucherSchema>
export type CloudVoucherDetail = z.infer<typeof CloudVoucherDetailSchema>
export type CloudVoucherListResult = z.infer<typeof CloudVoucherListResultSchema>
export type CloudVoucherCreateInput = z.input<typeof CloudVoucherCreateInputSchema>
export type CloudMember = z.infer<typeof CloudMemberSchema>
export type CloudMemberListResult = z.infer<typeof CloudMemberListResultSchema>
export type CloudMemberCreateInput = z.input<typeof CloudMemberCreateInputSchema>
export type CloudMemberUpdateInput = z.input<typeof CloudMemberUpdateInputSchema>
export type CloudDeleteResult = z.infer<typeof CloudDeleteResultSchema>

export interface CloudApi {
  readonly capabilities: typeof CLOUD_CAPABILITIES
  login: (email: string, password: string) => Promise<CloudAuthResult>
  register: (email: string, password: string, organizationName: string) => Promise<CloudAuthResult>
  me: () => Promise<CloudUser>
  vouchers: {
    list: (params?: { year?: number; page?: number; limit?: number }) => Promise<CloudVoucherListResult>
    get: (params: { id: number }) => Promise<CloudVoucherDetail>
    create: (params: CloudVoucherCreateInput) => Promise<CloudVoucher>
    delete: (params: { id: number }) => Promise<CloudDeleteResult>
  }
  members: {
    list: (params?: { search?: string; active?: boolean }) => Promise<CloudMemberListResult>
    get: (params: { id: number }) => Promise<CloudMember>
    create: (params: CloudMemberCreateInput) => Promise<CloudMember>
    update: (params: CloudMemberUpdateInput & { id: number }) => Promise<CloudMember>
    delete: (params: { id: number }) => Promise<CloudDeleteResult>
  }
}
