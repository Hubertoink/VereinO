import { z } from 'zod'

export const VoucherType = z.enum(['IN', 'OUT', 'TRANSFER'])
export const Sphere = z.enum(['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'])
export const PaymentMethod = z.enum(['BAR', 'BANK'])

export const VoucherCreateInput = z
    .object({
        date: z.string(),
        type: VoucherType,
        sphere: Sphere,
        description: z.string().optional(),
        // allow either net or gross entry
        netAmount: z.number().optional(),
        grossAmount: z.number().optional(),
        vatRate: z.number(),
        paymentMethod: PaymentMethod.optional(),
        // Transfer direction (only when type === 'TRANSFER')
        transferFrom: PaymentMethod.optional(),
        transferTo: PaymentMethod.optional(),
        categoryId: z.number().optional(),
        projectId: z.number().optional(),
        earmarkId: z.number().optional(),
        budgetId: z.number().optional(),
        files: z
            .array(
                z.object({
                    name: z.string(),
                    dataBase64: z.string(),
                    mime: z.string().optional()
                })
            )
            .optional(),
        tags: z.array(z.string()).optional()
    })
    .refine((v) => v.netAmount != null || v.grossAmount != null, {
        message: 'Either netAmount or grossAmount must be provided'
    })

export const VoucherCreateOutput = z.object({
    id: z.number(),
    voucherNo: z.string(),
    grossAmount: z.number(),
    warnings: z.array(z.string()).optional()
})

export const VoucherReverseInput = z.object({
    originalId: z.number(),
    reason: z.string().optional()
})

export const VoucherReverseOutput = z.object({
    id: z.number(),
    voucherNo: z.string()
})

export const ReportType = z.enum([
    'JOURNAL',
    'SPHERE_SUMMARY',
    'BUDGET_VS_ACTUAL',
    'EARMARK_USAGE'
])

export const ReportFormat = z.enum(['XLSX', 'CSV', 'PDF'])

export const ReportsExportInput = z.object({
    type: ReportType,
    format: ReportFormat,
    from: z.string(),
    to: z.string(),
    filters: z.record(z.any()).optional(),
    // Optional UI-driven options
    fields: z.array(z.enum(['date', 'voucherNo', 'type', 'sphere', 'description', 'paymentMethod', 'netAmount', 'vatAmount', 'grossAmount', 'tags'])).optional(),
    orgName: z.string().optional(),
    amountMode: z.enum(['POSITIVE_BOTH', 'OUT_NEGATIVE']).optional(),
    // Sorting controls (applies to table/list output across formats)
    sort: z.enum(['ASC', 'DESC']).optional(),
    sortBy: z.enum(['date', 'gross', 'net']).optional()
})

export const ReportsExportOutput = z.object({ filePath: z.string() })

// Years with vouchers present
export const ReportsYearsOutput = z.object({ years: z.array(z.number()) })
export type TReportsYearsOutput = z.infer<typeof ReportsYearsOutput>

export type TVoucherCreateInput = z.infer<typeof VoucherCreateInput>
export type TVoucherCreateOutput = z.infer<typeof VoucherCreateOutput>
export type TVoucherReverseInput = z.infer<typeof VoucherReverseInput>
export type TVoucherReverseOutput = z.infer<typeof VoucherReverseOutput>
export type TReportsExportInput = z.infer<typeof ReportsExportInput>
export type TReportsExportOutput = z.infer<typeof ReportsExportOutput>

// Year-end (Jahresabschluss)
export const YearEndPreviewInput = z.object({ year: z.number() })
export const YearEndPreviewOutput = z.object({
    year: z.number(),
    from: z.string(),
    to: z.string(),
    totals: z.object({ net: z.number(), vat: z.number(), gross: z.number() }),
    bySphere: z.array(z.object({ key: Sphere, net: z.number(), vat: z.number(), gross: z.number() })),
    byPaymentMethod: z.array(z.object({ key: PaymentMethod.nullable(), net: z.number(), vat: z.number(), gross: z.number() })),
    byType: z.array(z.object({ key: VoucherType, net: z.number(), vat: z.number(), gross: z.number() })),
    cashBalance: z.object({ BAR: z.number(), BANK: z.number() })
})
export type TYearEndPreviewInput = z.infer<typeof YearEndPreviewInput>
export type TYearEndPreviewOutput = z.infer<typeof YearEndPreviewOutput>

export const YearEndExportInput = z.object({ year: z.number() })
export const YearEndExportOutput = z.object({ filePath: z.string() })
export type TYearEndExportInput = z.infer<typeof YearEndExportInput>
export type TYearEndExportOutput = z.infer<typeof YearEndExportOutput>

export const YearEndCloseInput = z.object({ year: z.number() })
export const YearEndCloseOutput = z.object({ ok: z.boolean(), closedUntil: z.string() })
export type TYearEndCloseInput = z.infer<typeof YearEndCloseInput>
export type TYearEndCloseOutput = z.infer<typeof YearEndCloseOutput>

export const YearEndReopenInput = z.object({ year: z.number() })
export const YearEndReopenOutput = z.object({ ok: z.boolean(), closedUntil: z.string().nullable() })
export type TYearEndReopenInput = z.infer<typeof YearEndReopenInput>
export type TYearEndReopenOutput = z.infer<typeof YearEndReopenOutput>

export const YearEndStatusOutput = z.object({ closedUntil: z.string().nullable() })
export type TYearEndStatusOutput = z.infer<typeof YearEndStatusOutput>

// Reports summary
export const ReportsSummaryInput = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    paymentMethod: PaymentMethod.optional(),
    sphere: Sphere.optional(),
    type: VoucherType.optional(),
    earmarkId: z.number().optional(),
    q: z.string().optional(),
    tag: z.string().optional()
})

export const ReportsSummaryOutput = z.object({
    totals: z.object({
        net: z.number(),
        vat: z.number(),
        gross: z.number()
    }),
    bySphere: z.array(z.object({ key: Sphere, net: z.number(), vat: z.number(), gross: z.number() })),
    byPaymentMethod: z.array(z.object({ key: PaymentMethod.nullable(), net: z.number(), vat: z.number(), gross: z.number() })),
    byType: z.array(z.object({ key: VoucherType, net: z.number(), vat: z.number(), gross: z.number() }))
})

export type TReportsSummaryInput = z.infer<typeof ReportsSummaryInput>
export type TReportsSummaryOutput = z.infer<typeof ReportsSummaryOutput>

// Monthly buckets
export const ReportsMonthlyInput = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    paymentMethod: PaymentMethod.optional(),
    sphere: Sphere.optional(),
    type: VoucherType.optional()
})

export const ReportsMonthlyOutput = z.object({
    buckets: z.array(
        z.object({
            month: z.string(), // YYYY-MM
            net: z.number(),
            vat: z.number(),
            gross: z.number()
        })
    )
})

export type TReportsMonthlyInput = z.infer<typeof ReportsMonthlyInput>
export type TReportsMonthlyOutput = z.infer<typeof ReportsMonthlyOutput>

// Cash balance as of a date (year-to-date inflow-outflow; opening booked as IN at year's start)
export const ReportsCashBalanceInput = z.object({
    to: z.string().optional(),
    sphere: Sphere.optional()
})
export const ReportsCashBalanceOutput = z.object({
    BAR: z.number(),
    BANK: z.number()
})
export type TReportsCashBalanceInput = z.infer<typeof ReportsCashBalanceInput>
export type TReportsCashBalanceOutput = z.infer<typeof ReportsCashBalanceOutput>

// Journal/listing
export const VouchersListInput = z
    .object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0).optional(),
        sort: z.enum(['ASC', 'DESC']).optional(),
        sortBy: z.enum(['date', 'gross', 'net']).optional(),
        paymentMethod: PaymentMethod.optional(),
        sphere: Sphere.optional(),
        type: VoucherType.optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        earmarkId: z.number().optional(),
        budgetId: z.number().optional(),
        q: z.string().optional()
        , tag: z.string().optional()
    })
    .optional()
export const VouchersListOutput = z.object({
    rows: z.array(
        z.object({
            id: z.number(),
            voucherNo: z.string(),
            date: z.string(),
            type: VoucherType,
            sphere: Sphere,
            paymentMethod: PaymentMethod.nullable().optional(),
            transferFrom: PaymentMethod.nullable().optional(),
            transferTo: PaymentMethod.nullable().optional(),
            description: z.string().nullable().optional(),
            netAmount: z.number(),
            vatRate: z.number(),
            vatAmount: z.number(),
            grossAmount: z.number(),
            fileCount: z.number().optional(),
            earmarkId: z.number().nullable().optional(),
            earmarkCode: z.string().nullable().optional(),
            budgetId: z.number().nullable().optional(),
            budgetLabel: z.string().nullable().optional(),
            budgetColor: z.string().nullable().optional(),
            tags: z.array(z.string()).optional()
        })
    ),
    total: z.number()
})
export type TVouchersListInput = z.infer<typeof VouchersListInput>
export type TVouchersListOutput = z.infer<typeof VouchersListOutput>
// Invoices
export const InvoiceStatus = z.enum(['OPEN', 'PARTIAL', 'PAID'])
export const InvoiceCreateInput = z.object({
    date: z.string(),
    dueDate: z.string().nullable().optional(),
    invoiceNo: z.string().nullable().optional(),
    party: z.string(),
    description: z.string().nullable().optional(),
    grossAmount: z.number(),
    paymentMethod: z.string().nullable().optional(),
    sphere: Sphere,
    earmarkId: z.number().nullable().optional(),
    budgetId: z.number().nullable().optional(),
    autoPost: z.boolean().optional(),
    voucherType: z.enum(['IN', 'OUT']),
    files: z.array(z.object({ name: z.string(), dataBase64: z.string(), mime: z.string().optional() })).optional(),
    tags: z.array(z.string()).optional()
})
export const InvoiceCreateOutput = z.object({ id: z.number() })

export const InvoiceUpdateInput = z.object({
    id: z.number(),
    date: z.string().optional(),
    dueDate: z.string().nullable().optional(),
    invoiceNo: z.string().nullable().optional(),
    party: z.string().optional(),
    description: z.string().nullable().optional(),
    grossAmount: z.number().optional(),
    paymentMethod: z.string().nullable().optional(),
    sphere: Sphere.optional(),
    earmarkId: z.number().nullable().optional(),
    budgetId: z.number().nullable().optional(),
    autoPost: z.boolean().optional(),
    voucherType: z.enum(['IN', 'OUT']).optional(),
    tags: z.array(z.string()).optional()
})
export const InvoiceUpdateOutput = z.object({ id: z.number() })

export const InvoiceDeleteInput = z.object({ id: z.number() })
export const InvoiceDeleteOutput = z.object({ id: z.number() })

export const InvoicesListInput = z.object({
    limit: z.number().min(1).max(100).default(20).optional(),
    offset: z.number().min(0).default(0).optional(),
    sort: z.enum(['ASC', 'DESC']).optional(),
    sortBy: z.enum(['date', 'due', 'amount']).optional(),
    status: z.enum(['OPEN', 'PARTIAL', 'PAID', 'ALL']).optional(),
    sphere: Sphere.optional(),
    budgetId: z.number().optional(),
    q: z.string().optional(),
    dueFrom: z.string().optional(),
    dueTo: z.string().optional(),
    tag: z.string().optional()
}).optional()
export const InvoicesListOutput = z.object({
    rows: z.array(z.object({
        id: z.number(),
        date: z.string(),
        dueDate: z.string().nullable().optional(),
        invoiceNo: z.string().nullable().optional(),
        party: z.string(),
        description: z.string().nullable().optional(),
        grossAmount: z.number(),
        paymentMethod: z.string().nullable().optional(),
        sphere: Sphere,
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
    })),
    total: z.number()
})

// Invoices summary (totals)
export const InvoicesSummaryInput = z.object({
    status: z.enum(['OPEN', 'PARTIAL', 'PAID', 'ALL']).optional(),
    sphere: Sphere.optional(),
    budgetId: z.number().optional(),
    q: z.string().optional(),
    dueFrom: z.string().optional(),
    dueTo: z.string().optional(),
    tag: z.string().optional()
}).optional()
export const InvoicesSummaryOutput = z.object({
    count: z.number(),
    gross: z.number(),
    paid: z.number(),
    remaining: z.number()
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
    description: z.string().nullable().optional(),
    grossAmount: z.number(),
    paymentMethod: z.string().nullable().optional(),
    sphere: Sphere,
    earmarkId: z.number().nullable().optional(),
    budgetId: z.number().nullable().optional(),
    autoPost: z.number().optional(),
    voucherType: z.enum(['IN', 'OUT']),
    postedVoucherId: z.number().nullable().optional(),
    postedVoucherNo: z.string().nullable().optional(),
    payments: z.array(z.object({ id: z.number(), date: z.string(), amount: z.number() })),
    files: z.array(z.object({ id: z.number(), fileName: z.string(), mimeType: z.string().nullable().optional(), size: z.number().nullable().optional(), createdAt: z.string().nullable().optional() })),
    tags: z.array(z.string()),
    paidSum: z.number(),
    status: InvoiceStatus
})

export const InvoiceAddPaymentInput = z.object({ invoiceId: z.number(), date: z.string(), amount: z.number() })
export const InvoiceAddPaymentOutput = z.object({ id: z.number(), status: InvoiceStatus, paidSum: z.number(), voucherId: z.number().nullable().optional() })

// Invoice files (attachments for invoices)
export const InvoiceFilesListInput = z.object({ invoiceId: z.number() })
export const InvoiceFilesListOutput = z.object({ files: z.array(z.object({ id: z.number(), fileName: z.string(), mimeType: z.string().nullable().optional(), size: z.number().nullable().optional(), createdAt: z.string().nullable().optional() })) })
export const InvoiceFileAddInput = z.object({ invoiceId: z.number(), fileName: z.string(), dataBase64: z.string(), mimeType: z.string().optional() })
export const InvoiceFileAddOutput = z.object({ id: z.number() })
export const InvoiceFileDeleteInput = z.object({ fileId: z.number() })
export const InvoiceFileDeleteOutput = z.object({ id: z.number() })
export type TInvoiceFilesListInput = z.infer<typeof InvoiceFilesListInput>
export type TInvoiceFilesListOutput = z.infer<typeof InvoiceFilesListOutput>
export type TInvoiceFileAddInput = z.infer<typeof InvoiceFileAddInput>
export type TInvoiceFileAddOutput = z.infer<typeof InvoiceFileAddOutput>
export type TInvoiceFileDeleteInput = z.infer<typeof InvoiceFileDeleteInput>
export type TInvoiceFileDeleteOutput = z.infer<typeof InvoiceFileDeleteOutput>


// Recent vouchers (simple list)
export const VouchersRecentInput = z.object({ limit: z.number().min(1).max(50).default(10) }).optional()
export const VouchersRecentOutput = z.object({
    rows: z.array(
        z.object({
            id: z.number(),
            voucherNo: z.string(),
            date: z.string(),
            type: VoucherType,
            sphere: Sphere,
            paymentMethod: PaymentMethod.nullable().optional(),
            description: z.string().nullable().optional(),
            netAmount: z.number(),
            vatRate: z.number(),
            vatAmount: z.number(),
            grossAmount: z.number(),
            fileCount: z.number().optional()
        })
    )
})
export type TVouchersRecentInput = z.infer<typeof VouchersRecentInput>
export type TVouchersRecentOutput = z.infer<typeof VouchersRecentOutput>

// Update/Delete
export const VoucherUpdateInput = z.object({
    id: z.number(),
    date: z.string().optional(),
    type: VoucherType.optional(),
    sphere: Sphere.optional(),
    description: z.string().nullable().optional(),
    paymentMethod: PaymentMethod.nullable().optional(),
    transferFrom: PaymentMethod.nullable().optional(),
    transferTo: PaymentMethod.nullable().optional(),
    earmarkId: z.number().nullable().optional(),
    budgetId: z.number().nullable().optional(),
    tags: z.array(z.string()).optional()
})
export const VoucherUpdateOutput = z.object({ id: z.number(), warnings: z.array(z.string()).optional() })
export const VoucherDeleteInput = z.object({ id: z.number() })
export const VoucherDeleteOutput = z.object({ id: z.number() })

export type TVoucherUpdateInput = z.infer<typeof VoucherUpdateInput>
export type TVoucherUpdateOutput = z.infer<typeof VoucherUpdateOutput>
export type TVoucherDeleteInput = z.infer<typeof VoucherDeleteInput>
export type TVoucherDeleteOutput = z.infer<typeof VoucherDeleteOutput>

// Batch assign earmark to vouchers
export const VouchersBatchAssignEarmarkInput = z.object({
    earmarkId: z.number(),
    paymentMethod: PaymentMethod.optional(),
    sphere: Sphere.optional(),
    type: VoucherType.optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    q: z.string().optional(),
    onlyWithout: z.boolean().optional()
})
export const VouchersBatchAssignEarmarkOutput = z.object({ updated: z.number() })
export type TVouchersBatchAssignEarmarkInput = z.infer<typeof VouchersBatchAssignEarmarkInput>
export type TVouchersBatchAssignEarmarkOutput = z.infer<typeof VouchersBatchAssignEarmarkOutput>

// Batch assign budget to vouchers
export const VouchersBatchAssignBudgetInput = z.object({
    budgetId: z.number(),
    paymentMethod: PaymentMethod.optional(),
    sphere: Sphere.optional(),
    type: VoucherType.optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    q: z.string().optional(),
    onlyWithout: z.boolean().optional()
})
export const VouchersBatchAssignBudgetOutput = z.object({ updated: z.number() })
export type TVouchersBatchAssignBudgetInput = z.infer<typeof VouchersBatchAssignBudgetInput>
export type TVouchersBatchAssignBudgetOutput = z.infer<typeof VouchersBatchAssignBudgetOutput>

// Batch add tags to vouchers
export const VouchersBatchAssignTagsInput = z.object({
    tags: z.array(z.string()).nonempty(),
    paymentMethod: PaymentMethod.optional(),
    sphere: Sphere.optional(),
    type: VoucherType.optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    q: z.string().optional()
})
export const VouchersBatchAssignTagsOutput = z.object({ updated: z.number() })
export type TVouchersBatchAssignTagsInput = z.infer<typeof VouchersBatchAssignTagsInput>
export type TVouchersBatchAssignTagsOutput = z.infer<typeof VouchersBatchAssignTagsOutput>

// Bindings (Zweckbindungen)
export const BindingUpsertInput = z.object({
    id: z.number().optional(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
    color: z.string().nullable().optional(),
    budget: z.number().nullable().optional()
})
export const BindingUpsertOutput = z.object({ id: z.number() })
export const BindingListInput = z.object({ activeOnly: z.boolean().optional() }).optional()
export const BindingListOutput = z.object({
    rows: z.array(z.object({
        id: z.number(), code: z.string(), name: z.string(), description: z.string().nullable().optional(), startDate: z.string().nullable().optional(), endDate: z.string().nullable().optional(), isActive: z.number(), color: z.string().nullable().optional(), budget: z.number().nullable().optional()
    }))
})
export const BindingDeleteInput = z.object({ id: z.number() })
export const BindingDeleteOutput = z.object({ id: z.number() })
export const BindingUsageInput = z.object({ earmarkId: z.number(), from: z.string().optional(), to: z.string().optional(), sphere: Sphere.optional() })
export const BindingUsageOutput = z.object({ allocated: z.number(), released: z.number(), balance: z.number(), budget: z.number(), remaining: z.number() })

export type TBindingUpsertInput = z.infer<typeof BindingUpsertInput>
export type TBindingListInput = z.infer<typeof BindingListInput>
export type TBindingDeleteInput = z.infer<typeof BindingDeleteInput>
export type TBindingUsageInput = z.infer<typeof BindingUsageInput>

// Budgets
export const BudgetUpsertInput = z.object({
    id: z.number().optional(),
    year: z.number(),
    sphere: Sphere,
    categoryId: z.number().nullable().optional(),
    projectId: z.number().nullable().optional(),
    earmarkId: z.number().nullable().optional(),
    amountPlanned: z.number(),
    name: z.string().nullable().optional(),
    categoryName: z.string().nullable().optional(),
    projectName: z.string().nullable().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    color: z.string().nullable().optional()
})
export const BudgetUpsertOutput = z.object({ id: z.number() })
export const BudgetListInput = z.object({ year: z.number().optional(), sphere: Sphere.optional(), earmarkId: z.number().nullable().optional() }).optional()
export const BudgetListOutput = z.object({ rows: z.array(z.object({ id: z.number(), year: z.number(), sphere: Sphere, categoryId: z.number().nullable(), projectId: z.number().nullable(), earmarkId: z.number().nullable(), amountPlanned: z.number(), name: z.string().nullable().optional(), categoryName: z.string().nullable().optional(), projectName: z.string().nullable().optional(), startDate: z.string().nullable().optional(), endDate: z.string().nullable().optional(), color: z.string().nullable().optional() })) })
export const BudgetUsageInput = z.object({ budgetId: z.number(), from: z.string().optional(), to: z.string().optional() })
export const BudgetUsageOutput = z.object({ spent: z.number(), inflow: z.number(), count: z.number(), lastDate: z.string().nullable() })
export const BudgetDeleteInput = z.object({ id: z.number() })
export const BudgetDeleteOutput = z.object({ id: z.number() })

export type TBudgetUpsertInput = z.infer<typeof BudgetUpsertInput>
export type TBudgetListInput = z.infer<typeof BudgetListInput>
export type TBudgetDeleteInput = z.infer<typeof BudgetDeleteInput>
export type TBudgetUsageInput = z.infer<typeof BudgetUsageInput>
export type TBudgetUsageOutput = z.infer<typeof BudgetUsageOutput>

// Quotes (weekly)
export const QuoteWeeklyInput = z.object({ date: z.string().optional() }).optional()
export const QuoteWeeklyOutput = z.object({ text: z.string(), author: z.string().optional(), source: z.string().optional(), id: z.number().optional() })
export type TQuoteWeeklyInput = z.infer<typeof QuoteWeeklyInput>
export type TQuoteWeeklyOutput = z.infer<typeof QuoteWeeklyOutput>

// Imports (Excel)
export const ImportPreviewInput = z.object({ fileBase64: z.string() })
export const ImportPreviewOutput = z.object({
    headers: z.array(z.string()),
    sample: z.array(z.record(z.any())),
    suggestedMapping: z.record(z.string().nullable()),
    headerRowIndex: z.number()
})
export const ImportExecuteInput = z.object({
    fileBase64: z.string(),
    mapping: z.record(z.string().nullable())
})
export const ImportExecuteOutput = z.object({
    imported: z.number(),
    skipped: z.number(),
    errors: z.array(z.object({ row: z.number(), message: z.string() })),
    rowStatuses: z.array(z.object({ row: z.number(), ok: z.boolean(), message: z.string().optional() })).optional(),
    errorFilePath: z.string().optional()
})

// Imports template (download)
export const ImportTemplateInput = z.object({}).optional()
export const ImportTemplateOutput = z.object({ filePath: z.string() })

export type TImportTemplateInput = z.infer<typeof ImportTemplateInput>
export type TImportTemplateOutput = z.infer<typeof ImportTemplateOutput>

// Imports test data (generate sample workbook)
export const ImportTestDataInput = z.object({}).optional()
export const ImportTestDataOutput = z.object({ filePath: z.string() })
export type TImportTestDataInput = z.infer<typeof ImportTestDataInput>
export type TImportTestDataOutput = z.infer<typeof ImportTestDataOutput>

// Attachments (files linked to vouchers)
export const AttachmentsListInput = z.object({ voucherId: z.number() })
export const AttachmentsListOutput = z.object({ files: z.array(z.object({ id: z.number(), fileName: z.string(), mimeType: z.string().nullable().optional(), size: z.number().nullable().optional(), createdAt: z.string().optional() })) })
export const AttachmentOpenInput = z.object({ fileId: z.number() })
export const AttachmentOpenOutput = z.object({ ok: z.boolean() })
export const AttachmentSaveAsInput = z.object({ fileId: z.number() })
export const AttachmentSaveAsOutput = z.object({ filePath: z.string() })
export const AttachmentReadInput = z.object({ fileId: z.number() })
export const AttachmentReadOutput = z.object({ fileName: z.string(), mimeType: z.string().optional(), dataBase64: z.string() })

// Attachments add/delete
export const AttachmentAddInput = z.object({ voucherId: z.number(), fileName: z.string(), dataBase64: z.string(), mimeType: z.string().optional() })
export const AttachmentAddOutput = z.object({ id: z.number() })
export const AttachmentDeleteInput = z.object({ fileId: z.number() })
export const AttachmentDeleteOutput = z.object({ id: z.number() })

export type TAttachmentsListInput = z.infer<typeof AttachmentsListInput>
export type TAttachmentsListOutput = z.infer<typeof AttachmentsListOutput>
export type TAttachmentOpenInput = z.infer<typeof AttachmentOpenInput>
export type TAttachmentOpenOutput = z.infer<typeof AttachmentOpenOutput>
export type TAttachmentSaveAsInput = z.infer<typeof AttachmentSaveAsInput>
export type TAttachmentSaveAsOutput = z.infer<typeof AttachmentSaveAsOutput>
export type TAttachmentReadInput = z.infer<typeof AttachmentReadInput>
export type TAttachmentReadOutput = z.infer<typeof AttachmentReadOutput>
export type TAttachmentAddInput = z.infer<typeof AttachmentAddInput>
export type TAttachmentAddOutput = z.infer<typeof AttachmentAddOutput>
export type TAttachmentDeleteInput = z.infer<typeof AttachmentDeleteInput>
export type TAttachmentDeleteOutput = z.infer<typeof AttachmentDeleteOutput>

// Database export/import
export const DbExportInput = z.object({}).optional()
export const DbExportOutput = z.object({ filePath: z.string() })
export type TDbExportInput = z.infer<typeof DbExportInput>
export type TDbExportOutput = z.infer<typeof DbExportOutput>

export const DbImportInput = z.object({}).optional()
export const DbImportOutput = z.object({ ok: z.boolean(), filePath: z.string().optional() })
export type TDbImportInput = z.infer<typeof DbImportInput>
export type TDbImportOutput = z.infer<typeof DbImportOutput>

// Dangerous action: delete all vouchers
export const VouchersClearAllInput = z.object({ confirm: z.literal(true) })
export const VouchersClearAllOutput = z.object({ deleted: z.number() })
export type TVouchersClearAllInput = z.infer<typeof VouchersClearAllInput>
export type TVouchersClearAllOutput = z.infer<typeof VouchersClearAllOutput>

// Tags CRUD
export const TagsListInput = z.object({ q: z.string().optional(), includeUsage: z.boolean().optional() }).optional()
export const TagsListOutput = z.object({ rows: z.array(z.object({ id: z.number(), name: z.string(), color: z.string().nullable().optional(), usage: z.number().optional() })) })
export const TagUpsertInput = z.object({ id: z.number().optional(), name: z.string(), color: z.string().nullable().optional() })
export const TagUpsertOutput = z.object({ id: z.number() })
export const TagDeleteInput = z.object({ id: z.number() })
export const TagDeleteOutput = z.object({ id: z.number() })
export type TTagsListInput = z.infer<typeof TagsListInput>
export type TTagsListOutput = z.infer<typeof TagsListOutput>
export type TTagUpsertInput = z.infer<typeof TagUpsertInput>
export type TTagUpsertOutput = z.infer<typeof TagUpsertOutput>
export type TTagDeleteInput = z.infer<typeof TagDeleteInput>
export type TTagDeleteOutput = z.infer<typeof TagDeleteOutput>

// Members CRUD
export const MemberStatus = z.enum(['ACTIVE', 'NEW', 'PAUSED', 'LEFT'])
export const MembersListInput = z.object({ q: z.string().optional(), status: z.enum(['ACTIVE','NEW','PAUSED','LEFT','ALL']).optional(), limit: z.number().min(1).max(200).default(50).optional(), offset: z.number().min(0).default(0).optional() }).optional()
export const MembersListOutput = z.object({ rows: z.array(z.object({ id: z.number(), memberNo: z.string().nullable().optional(), name: z.string(), email: z.string().nullable().optional(), phone: z.string().nullable().optional(), address: z.string().nullable().optional(), status: MemberStatus, createdAt: z.string(), updatedAt: z.string().nullable().optional(), tags: z.array(z.string()).optional(), iban: z.string().nullable().optional(), bic: z.string().nullable().optional(), contribution_amount: z.number().nullable().optional(), contribution_interval: z.enum(['MONTHLY','QUARTERLY','YEARLY']).nullable().optional(), mandate_ref: z.string().nullable().optional(), mandate_date: z.string().nullable().optional(), join_date: z.string().nullable().optional(), leave_date: z.string().nullable().optional(), notes: z.string().nullable().optional(), next_due_date: z.string().nullable().optional() })), total: z.number() })
export const MemberCreateInput = z.object({ memberNo: z.string().nullable().optional(), name: z.string(), email: z.string().nullable().optional(), phone: z.string().nullable().optional(), address: z.string().nullable().optional(), status: MemberStatus.optional(), tags: z.array(z.string()).optional(), iban: z.string().nullable().optional(), bic: z.string().nullable().optional(), contribution_amount: z.number().nullable().optional(), contribution_interval: z.enum(['MONTHLY','QUARTERLY','YEARLY']).nullable().optional(), mandate_ref: z.string().nullable().optional(), mandate_date: z.string().nullable().optional(), join_date: z.string().nullable().optional(), leave_date: z.string().nullable().optional(), notes: z.string().nullable().optional(), next_due_date: z.string().nullable().optional() })
export const MemberCreateOutput = z.object({ id: z.number() })
export const MemberUpdateInput = z.object({ id: z.number(), memberNo: z.string().nullable().optional(), name: z.string().optional(), email: z.string().nullable().optional(), phone: z.string().nullable().optional(), address: z.string().nullable().optional(), status: MemberStatus.optional(), tags: z.array(z.string()).optional(), iban: z.string().nullable().optional(), bic: z.string().nullable().optional(), contribution_amount: z.number().nullable().optional(), contribution_interval: z.enum(['MONTHLY','QUARTERLY','YEARLY']).nullable().optional(), mandate_ref: z.string().nullable().optional(), mandate_date: z.string().nullable().optional(), join_date: z.string().nullable().optional(), leave_date: z.string().nullable().optional(), notes: z.string().nullable().optional(), next_due_date: z.string().nullable().optional() })
export const MemberUpdateOutput = z.object({ id: z.number() })
export const MemberDeleteInput = z.object({ id: z.number() })
export const MemberDeleteOutput = z.object({ id: z.number() })

// Settings (simple key-value)
export const SettingsGetInput = z.object({ key: z.string() })
export const SettingsGetOutput = z.object({ value: z.any().optional() })
export const SettingsSetInput = z.object({ key: z.string(), value: z.any() })
export const SettingsSetOutput = z.object({ ok: z.boolean() })
export type TSettingsGetInput = z.infer<typeof SettingsGetInput>
export type TSettingsGetOutput = z.infer<typeof SettingsGetOutput>
export type TSettingsSetInput = z.infer<typeof SettingsSetInput>
export type TSettingsSetOutput = z.infer<typeof SettingsSetOutput>

// Audit: recent actions
export const AuditRecentInput = z.object({ limit: z.number().min(1).max(100).default(20) }).optional()
export const AuditRecentOutput = z.object({
    rows: z.array(z.object({
        id: z.number(),
        userId: z.number().nullable().optional(),
        entity: z.string(),
        entityId: z.number(),
        action: z.string(),
        createdAt: z.string(),
        diff: z.any().nullable().optional()
    }))
})
export type TAuditRecentInput = z.infer<typeof AuditRecentInput>
export type TAuditRecentOutput = z.infer<typeof AuditRecentOutput>
