import type {
    TMemberCreateInput,
    TMemberCreateOutput,
    TMemberDeleteInput,
    TMemberDeleteOutput,
    TMemberGetInput,
    TMemberGetOutput,
    TMembersListInput,
    TMembersListOutput,
    TMemberUpdateInput,
    TMemberUpdateOutput,
    TPaymentsListDueInput,
    TPaymentsListDueOutput,
    TPaymentsMarkPaidInput,
    TPaymentsMarkPaidOutput,
    TPaymentsSuggestVouchersInput,
    TPaymentsSuggestVouchersOutput,
    TPaymentsDueSummaryOutput,
    TPaymentsUnmarkInput,
    TPaymentsUnmarkOutput
} from '../../../electron/main/ipc/schemas'

type MemberExportField =
    | 'memberNo'
    | 'name'
    | 'email'
    | 'phone'
    | 'address'
    | 'status'
    | 'boardRole'
    | 'iban'
    | 'bic'
    | 'contribution_amount'
    | 'contribution_interval'
    | 'mandate_ref'
    | 'mandate_date'
    | 'join_date'
    | 'leave_date'
    | 'notes'

type ContributionInterval = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'

export interface MembersApi {
    members: {
        list: (payload?: TMembersListInput) => Promise<TMembersListOutput>
        create: (payload: TMemberCreateInput) => Promise<TMemberCreateOutput>
        update: (payload: TMemberUpdateInput) => Promise<TMemberUpdateOutput>
        delete: (payload: TMemberDeleteInput) => Promise<TMemberDeleteOutput>
        get: (payload: TMemberGetInput) => Promise<TMemberGetOutput>
        writeLetter: (payload: {
            id?: number
            name: string
            address?: string | null
            memberNo?: string | null
        }) => Promise<{ ok: boolean; error?: string }>
        export: (payload: {
            format: 'XLSX' | 'PDF'
            status?: 'ACTIVE' | 'NEW' | 'PAUSED' | 'LEFT' | 'ALL'
            q?: string
            fields: MemberExportField[]
            sortBy?: 'memberNo' | 'name'
            sortDir?: 'ASC' | 'DESC'
        }) => Promise<{ filePath: string }>
    }
    payments: {
        availableVouchers: (payload: { q?: string }) => Promise<Array<{ id: number; voucherNo: string; date: string; description?: string | null; available: number }>>
        previewAllocation: (payload: import('../../../shared/membershipPayments').ContributionPaymentInput) => Promise<import('../../../shared/membershipPayments').ContributionPreview>
        allocate: (payload: import('../../../shared/membershipPayments').ContributionPaymentInput & { token: string }) => Promise<{ ok: boolean; receiptId: number; preview: import('../../../shared/membershipPayments').ContributionPreview }>
        periods: (payload: { memberId: number; through: string }) => Promise<import('../../../shared/membershipPayments').ContributionPeriod[]>
        removeReceipt: (payload: { receiptId: number }) => Promise<{ ok: boolean }>
        listDue: (payload: TPaymentsListDueInput) => Promise<TPaymentsListDueOutput>
        markPaid: (payload: TPaymentsMarkPaidInput) => Promise<TPaymentsMarkPaidOutput>
        unmark: (payload: TPaymentsUnmarkInput) => Promise<TPaymentsUnmarkOutput>
        suggestVouchers: (payload: TPaymentsSuggestVouchersInput) => Promise<TPaymentsSuggestVouchersOutput>
        dueSummary: () => Promise<TPaymentsDueSummaryOutput>
        status: (payload: { memberId: number }) => Promise<{
            hasPlan: 0 | 1
            state: 'NONE' | 'OK' | 'OVERDUE'
            interval?: ContributionInterval
            amount?: number
            lastPeriod?: string | null
            lastDate?: string | null
            nextDue?: string | null
            overdue?: number
            dueAmount?: number
            prepaidAmount?: number
            credit?: number
            credits?: Array<{ id: number; voucherId: number | null; datePaid: string; amount: number }>
            joinDate?: string | null
            leaveDate?: string | null
            firstOverdue?: string | null
        }>
        history: (payload: { memberId: number; limit?: number; offset?: number }) => Promise<{
            rows: Array<{
                receiptId?: number
                paymentAmount?: number
                active?: number
                periodKey: string
                interval: ContributionInterval
                amount: number
                datePaid?: string | null
                voucherId?: number | null
                voucherNo?: string | null
                description?: string | null
                counterparty?: string | null
                gross?: number | null
            }>
            total: number
        }>
    }
}
