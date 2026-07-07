import { z } from 'zod'

export const VoucherType = z.enum(['IN', 'OUT', 'TRANSFER', 'INTERNAL'])
export const Sphere = z.enum(['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'])
export const PaymentMethod = z.enum(['BAR', 'BANK'])
export const PaymentAccountKind = z.enum(['CASH', 'BANK', 'PAYPAL', 'CARD', 'OTHER'])
export const VoucherAmountMode = z.enum(['NET', 'GROSS'])

// Multiple assignment shapes (shared by create + update)
const VoucherBudgetAssignment = z.object({
  budgetId: z.number(),
  amount: z.number()
})
const VoucherEarmarkAssignment = z.object({
  earmarkId: z.number(),
  amount: z.number()
})

export const VoucherCreateInput = z
  .object({
    date: z.string(),
    type: VoucherType,
    sphere: Sphere,
    description: z.string().optional(),
    note: z.string().nullable().optional(),
    // allow either net or gross entry
    netAmount: z.number().optional(),
    grossAmount: z.number().optional(),
    vatRate: z.number(),
    paymentMethod: PaymentMethod.optional(),
    paymentAccountId: z.number().nullable().optional(),
    // Transfer direction (only when type === 'TRANSFER')
    transferFrom: PaymentMethod.optional(),
    transferTo: PaymentMethod.optional(),
    transferFromAccountId: z.number().nullable().optional(),
    transferToAccountId: z.number().nullable().optional(),
    categoryId: z.number().optional(),
    projectId: z.number().optional(),
    earmarkId: z.number().optional(),
    earmarkAmount: z.number().nullable().optional(),
    budgetId: z.number().optional(),
    budgetAmount: z.number().nullable().optional(),
    // Optional: multiple budget/earmark assignments
    budgets: z.array(VoucherBudgetAssignment).optional(),
    earmarks: z.array(VoucherEarmarkAssignment).optional(),
    files: z
      .array(
        z.object({
          name: z.string(),
          dataBase64: z.string(),
          mime: z.string().optional()
        })
      )
      .optional(),
    tags: z.array(z.string()).optional(),
    bankTransactionId: z.number().int().positive().optional()
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

export const ReportType = z.enum(['JOURNAL', 'SPHERE_SUMMARY', 'BUDGET_VS_ACTUAL', 'EARMARK_USAGE'])

export const ReportFormat = z.enum(['XLSX', 'CSV', 'PDF'])

export const ReportsExportInput = z.object({
  type: ReportType,
  format: ReportFormat,
  from: z.string(),
  to: z.string(),
  filters: z.record(z.any()).optional(),
  // Optional UI-driven options
  fields: z
    .array(
      z.enum([
        'date',
        'voucherNo',
        'type',
        'sphere',
        'description',
        'status',
        'paymentMethod',
        'netAmount',
        'vatAmount',
        'grossAmount',
        'tags'
      ])
    )
    .optional(),
  orgName: z.string().optional(),
  amountMode: z.enum(['POSITIVE_BOTH', 'OUT_NEGATIVE']).optional(),
  // Sorting controls (applies to table/list output across formats)
  sort: z.enum(['ASC', 'DESC']).optional(),
  // Extend sortBy to support additional columns in exports too (optional)
  sortBy: z
    .enum(['date', 'gross', 'net', 'attachments', 'budget', 'earmark', 'payment', 'sphere'])
    .optional()
})

export const ReportsExportOutput = z.object({ filePath: z.string() })

// Fiscal report for tax office (Finanzamt)
export const FiscalReportInput = z.object({
  fiscalYear: z.number(),
  includeBindings: z.boolean().optional(),
  includeVoucherList: z.boolean().optional(),
  includeBudgets: z.boolean().optional(),
  includeActivityReport: z.boolean().optional(),
  includeInactiveBindings: z.boolean().optional(),
  includeArchivedBudgets: z.boolean().optional(),
  includeInternalVouchers: z.boolean().optional(),
  bindingIds: z.array(z.number()).optional(),
  budgetIds: z.array(z.number()).optional(),
  orgName: z.string().optional()
})
export const FiscalReportOutput = z.object({ filePath: z.string() })
export type TFiscalReportInput = z.infer<typeof FiscalReportInput>
export type TFiscalReportOutput = z.infer<typeof FiscalReportOutput>

const ActivityReportPayload = z.object({
  fiscalYear: z.number(),
  activities: z.string().default(''),
  purposeImpact: z.string().default(''),
  targetGroups: z.string().default(''),
  volunteerWork: z.string().default(''),
  highlights: z.string().default(''),
  notes: z.string().default(''),
  updatedAt: z.string().nullable().optional()
})
export const ActivityReportGetInput = z.object({ fiscalYear: z.number() })
export const ActivityReportGetOutput = ActivityReportPayload.extend({
  missingFields: z.array(z.string())
})
export const ActivityReportListInput = z.object({}).optional()
export const ActivityReportListOutput = z.object({
  rows: z.array(
    z.object({
      fiscalYear: z.number(),
      updatedAt: z.string().nullable().optional(),
      missingFields: z.array(z.string()),
      isEmpty: z.boolean()
    })
  )
})
export const ActivityReportSaveInput = ActivityReportPayload.omit({ updatedAt: true })
export const ActivityReportSaveOutput = ActivityReportPayload.extend({
  missingFields: z.array(z.string())
})
export const ActivityReportDeleteInput = z.object({ fiscalYear: z.number() })
export const ActivityReportDeleteOutput = z.object({ fiscalYear: z.number() })
export type TActivityReportGetInput = z.infer<typeof ActivityReportGetInput>
export type TActivityReportGetOutput = z.infer<typeof ActivityReportGetOutput>
export type TActivityReportListInput = z.infer<typeof ActivityReportListInput>
export type TActivityReportListOutput = z.infer<typeof ActivityReportListOutput>
export type TActivityReportSaveInput = z.infer<typeof ActivityReportSaveInput>
export type TActivityReportSaveOutput = z.infer<typeof ActivityReportSaveOutput>
export type TActivityReportDeleteInput = z.infer<typeof ActivityReportDeleteInput>
export type TActivityReportDeleteOutput = z.infer<typeof ActivityReportDeleteOutput>

// Treasurer report (Kassierbericht) for club members
export const TreasurerReportInput = z.object({
  fiscalYear: z.number(),
  orgName: z.string().optional(),
  cashBalanceDate: z.string().optional(),
  includeMembers: z.boolean().optional(),
  includeInvoices: z.boolean().optional(),
  includeBindings: z.boolean().optional(),
  includeBudgets: z.boolean().optional(),
  includeTagSummary: z.boolean().optional(),
  includeVoucherList: z.boolean().optional(),
  includeTags: z.boolean().optional(),
  includeInternalVouchers: z.boolean().optional(),
  voucherListFrom: z.string().optional(),
  voucherListTo: z.string().optional(),
  voucherListSort: z.enum(['ASC', 'DESC']).optional()
})
export const TreasurerReportOutput = z.object({ filePath: z.string() })
export type TTreasurerReportInput = z.infer<typeof TreasurerReportInput>
export type TTreasurerReportOutput = z.infer<typeof TreasurerReportOutput>

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
  totals: z.object({
    net: z.number(),
    vat: z.number(),
    gross: z.number(),
    inGross: z.number(),
    outGross: z.number()
  }),
  bySphere: z.array(z.object({ key: Sphere, net: z.number(), vat: z.number(), gross: z.number() })),
  byPaymentMethod: z.array(
    z.object({ key: PaymentMethod.nullable(), net: z.number(), vat: z.number(), gross: z.number() })
  ),
  byPaymentAccount: z
    .array(
      z.object({
        accountId: z.number().nullable(),
        key: z.string(),
        kind: PaymentAccountKind.nullable(),
        color: z.string().nullable(),
        net: z.number(),
        vat: z.number(),
        gross: z.number()
      })
    )
    .optional(),
  byType: z.array(
    z.object({ key: VoucherType, net: z.number(), vat: z.number(), gross: z.number() })
  ),
  cashBalance: z.object({
    BAR: z.number(),
    BANK: z.number(),
    accounts: z
      .array(
        z.object({
          id: z.number(),
          name: z.string(),
          kind: PaymentAccountKind,
          color: z.string().nullable().optional(),
          balance: z.number(),
          sortOrder: z.number(),
          isActive: z.number()
        })
      )
      .optional()
  })
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

// Cash checks (Kassenprüfung)
export const CashChecksListInput = z.object({ year: z.number() })
export const CashChecksListOutput = z.object({
  rows: z.array(
    z.object({
      id: z.number(),
      year: z.number(),
      date: z.string(),
      soll: z.number(),
      ist: z.number(),
      diff: z.number(),
      voucherId: z.number().nullable(),
      voucherNo: z.string().nullable(),
      budgetId: z.number().nullable(),
      budgetLabel: z.string().nullable(),
      note: z.string().nullable(),
      inspector1Name: z.string().nullable(),
      inspector2Name: z.string().nullable(),
      createdAt: z.string()
    })
  )
})

export const CashChecksCreateInput = z.object({
  year: z.number(),
  date: z.string(),
  soll: z.number(),
  ist: z.number(),
  diff: z.number(),
  voucherId: z.number().nullable().optional(),
  budgetId: z.number().nullable().optional(),
  note: z.string().nullable().optional()
})
export const CashChecksCreateOutput = z.object({ id: z.number() })

export const CashChecksSetInspectorsInput = z.object({
  id: z.number(),
  inspector1Name: z.string().nullable().optional(),
  inspector2Name: z.string().nullable().optional()
})
export const CashChecksSetInspectorsOutput = z.object({ id: z.number() })

export const CashChecksExportPdfInput = z.object({ id: z.number() })
export const CashChecksExportPdfOutput = z.object({ filePath: z.string() })

const CashChecksGetInspectorDefaultsInput = z.object({}).optional()
export const CashChecksGetInspectorDefaultsOutput = z.object({
  inspector1Name: z.string().nullable(),
  inspector2Name: z.string().nullable()
})

export type TCashChecksListInput = z.infer<typeof CashChecksListInput>
export type TCashChecksListOutput = z.infer<typeof CashChecksListOutput>
export type TCashChecksCreateInput = z.infer<typeof CashChecksCreateInput>
export type TCashChecksCreateOutput = z.infer<typeof CashChecksCreateOutput>
export type TCashChecksSetInspectorsInput = z.infer<typeof CashChecksSetInspectorsInput>
export type TCashChecksSetInspectorsOutput = z.infer<typeof CashChecksSetInspectorsOutput>
export type TCashChecksExportPdfInput = z.infer<typeof CashChecksExportPdfInput>
export type TCashChecksExportPdfOutput = z.infer<typeof CashChecksExportPdfOutput>
export type TCashChecksGetInspectorDefaultsInput = z.infer<
  typeof CashChecksGetInspectorDefaultsInput
>
export type TCashChecksGetInspectorDefaultsOutput = z.infer<
  typeof CashChecksGetInspectorDefaultsOutput
>

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
  paymentAccountId: z.number().nullable().optional(),
  sphere: Sphere.optional(),
  type: VoucherType.optional(),
  earmarkId: z.number().optional(),
  budgetId: z.number().optional(),
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
  byPaymentMethod: z.array(
    z.object({ key: PaymentMethod.nullable(), net: z.number(), vat: z.number(), gross: z.number() })
  ),
  byPaymentAccount: z
    .array(
      z.object({
        accountId: z.number().nullable(),
        key: z.string(),
        kind: PaymentAccountKind.nullable(),
        color: z.string().nullable(),
        net: z.number(),
        vat: z.number(),
        gross: z.number()
      })
    )
    .optional(),
  byType: z.array(
    z.object({ key: VoucherType, net: z.number(), vat: z.number(), gross: z.number() })
  )
})

export type TReportsSummaryInput = z.infer<typeof ReportsSummaryInput>
export type TReportsSummaryOutput = z.infer<typeof ReportsSummaryOutput>

// Monthly buckets
export const ReportsMonthlyInput = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  paymentMethod: PaymentMethod.optional(),
  sphere: Sphere.optional(),
  type: VoucherType.optional(),
  earmarkId: z.number().optional(),
  budgetId: z.number().optional()
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

// Cash balance as of a date (cumulative inflow-outflow; defaults to all-time when 'from' is omitted)
export const ReportsCashBalanceInput = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  sphere: Sphere.optional(),
  budgetId: z.number().optional(),
  paymentAccountId: z.number().nullable().optional()
})
export const ReportsCashBalanceOutput = z.object({
  BAR: z.number(),
  BANK: z.number(),
  accounts: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        kind: PaymentAccountKind,
        color: z.string().nullable().optional(),
        balance: z.number(),
        sortOrder: z.number(),
        isActive: z.number()
      })
    )
    .optional()
})
export type TReportsCashBalanceInput = z.infer<typeof ReportsCashBalanceInput>
export type TReportsCashBalanceOutput = z.infer<typeof ReportsCashBalanceOutput>

// Journal/listing
export const VouchersListInput = z
  .object({
    limit: z.number().min(1).max(100).default(20),
    offset: z.number().min(0).default(0).optional(),
    sort: z.enum(['ASC', 'DESC']).optional(),
    // New sortable columns for Buchungen
    sortBy: z
      .enum(['date', 'gross', 'net', 'attachments', 'budget', 'earmark', 'payment', 'sphere'])
      .optional(),
    paymentMethod: PaymentMethod.optional(),
    paymentAccountId: z.number().nullable().optional(),
    sphere: Sphere.optional(),
    type: VoucherType.optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    earmarkId: z.number().optional(),
    budgetId: z.number().optional(),
    voucherIds: z.array(z.number().int().positive()).min(1).max(2).optional(),
    q: z.string().optional(),
    tag: z.string().optional()
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
      isCashCheck: z.boolean().optional(),
      isAdvancePlaceholder: z.boolean().optional(),
      paymentMethod: PaymentMethod.nullable().optional(),
      transferFrom: PaymentMethod.nullable().optional(),
      transferTo: PaymentMethod.nullable().optional(),
      paymentAccountId: z.number().nullable().optional(),
      paymentAccountName: z.string().nullable().optional(),
      paymentAccountKind: PaymentAccountKind.nullable().optional(),
      paymentAccountColor: z.string().nullable().optional(),
      transferFromAccountId: z.number().nullable().optional(),
      transferFromAccountName: z.string().nullable().optional(),
      transferFromAccountKind: PaymentAccountKind.nullable().optional(),
      transferFromAccountColor: z.string().nullable().optional(),
      transferToAccountId: z.number().nullable().optional(),
      transferToAccountName: z.string().nullable().optional(),
      transferToAccountKind: PaymentAccountKind.nullable().optional(),
      transferToAccountColor: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      note: z.string().nullable().optional(),
      netAmount: z.number(),
      vatRate: z.number(),
      vatAmount: z.number(),
      grossAmount: z.number(),
      amountMode: VoucherAmountMode.optional(),
      originalId: z.number().nullable().optional(),
      originalVoucherNo: z.string().nullable().optional(),
      reversedById: z.number().nullable().optional(),
      reversedByVoucherNo: z.string().nullable().optional(),
      fileCount: z.number().optional(),
      earmarkId: z.number().nullable().optional(),
      earmarkAmount: z.number().nullable().optional(),
      earmarkCode: z.string().nullable().optional(),
      budgetId: z.number().nullable().optional(),
      budgetAmount: z.number().nullable().optional(),
      budgetLabel: z.string().nullable().optional(),
      budgetColor: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
      // Multiple assignments
      budgets: z
        .array(
          z.object({
            id: z.number(),
            budgetId: z.number(),
            amount: z.number(),
            label: z.string().optional(),
            color: z.string().nullable().optional()
          })
        )
        .optional(),
      earmarksAssigned: z
        .array(
          z.object({
            id: z.number(),
            earmarkId: z.number(),
            amount: z.number(),
            code: z.string().optional(),
            name: z.string().optional(),
            color: z.string().nullable().optional()
          })
        )
        .optional()
    })
  ),
  total: z.number()
})
export type TVouchersListInput = z.infer<typeof VouchersListInput>
export type TVouchersListOutput = z.infer<typeof VouchersListOutput>
// Invoices
const InvoiceStatus = z.enum(['OPEN', 'PARTIAL', 'PAID'])
export const InvoiceCreateInput = z.object({
  date: z.string(),
  dueDate: z.string().nullable().optional(),
  invoiceNo: z.string().nullable().optional(),
  party: z.string(),
  description: z.string().nullable().optional(),
  grossAmount: z.number(),
  paymentMethod: z.string().nullable().optional(),
  paymentAccountId: z.number().nullable().optional(),
  sphere: Sphere,
  earmarkId: z.number().nullable().optional(),
  budgetId: z.number().nullable().optional(),
  autoPost: z.boolean().optional(),
  voucherType: z.enum(['IN', 'OUT']),
  budgets: z.array(z.object({ budgetId: z.number(), amount: z.number().optional() })).optional(),
  earmarks: z.array(z.object({ earmarkId: z.number(), amount: z.number().optional() })).optional(),
  files: z
    .array(z.object({ name: z.string(), dataBase64: z.string(), mime: z.string().optional() }))
    .optional(),
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
  paymentAccountId: z.number().nullable().optional(),
  sphere: Sphere.optional(),
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
      description: z.string().nullable().optional(),
      grossAmount: z.number(),
      paymentMethod: z.string().nullable().optional(),
      paymentAccountId: z.number().nullable().optional(),
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
  description: z.string().nullable().optional(),
  grossAmount: z.number(),
  paymentMethod: z.string().nullable().optional(),
  paymentAccountId: z.number().nullable().optional(),
  paymentAccountName: z.string().nullable().optional(),
  paymentAccountKind: z.string().nullable().optional(),
  sphere: Sphere,
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
export const InvoiceFileAddInput = z.object({
  invoiceId: z.number(),
  fileName: z.string(),
  dataBase64: z.string(),
  mimeType: z.string().optional()
})
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
export const VouchersRecentInput = z
  .object({ limit: z.number().min(1).max(50).default(10) })
  .optional()
export const VouchersRecentOutput = z.object({
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
      originalId: z.number().nullable().optional(),
      originalVoucherNo: z.string().nullable().optional(),
      reversedById: z.number().nullable().optional(),
      reversedByVoucherNo: z.string().nullable().optional(),
      fileCount: z.number().optional(),
      earmarkId: z.number().nullable().optional(),
      earmarkCode: z.string().nullable().optional(),
      budgetId: z.number().nullable().optional(),
      budgetLabel: z.string().nullable().optional(),
      budgetColor: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
      amountMode: VoucherAmountMode.optional()
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
  note: z.string().nullable().optional(),
  paymentMethod: PaymentMethod.nullable().optional(),
  transferFrom: PaymentMethod.nullable().optional(),
  transferTo: PaymentMethod.nullable().optional(),
  paymentAccountId: z.number().nullable().optional(),
  transferFromAccountId: z.number().nullable().optional(),
  transferToAccountId: z.number().nullable().optional(),
  earmarkId: z.number().nullable().optional(),
  earmarkAmount: z.number().nullable().optional(),
  budgetId: z.number().nullable().optional(),
  budgetAmount: z.number().nullable().optional(),
  // New: multiple budget/earmark assignments
  budgets: z.array(VoucherBudgetAssignment).optional(),
  earmarks: z.array(VoucherEarmarkAssignment).optional(),
  // amounts (optional): provide either netAmount (+ optional vatRate) OR grossAmount
  netAmount: z.number().optional(),
  vatRate: z.number().optional(),
  grossAmount: z.number().optional(),
  amountMode: VoucherAmountMode.optional(),
  tags: z.array(z.string()).optional()
})
export const VoucherUpdateOutput = z.object({
  id: z.number(),
  warnings: z.array(z.string()).optional()
})
export const VoucherMetaUpdateInput = z.object({
  id: z.number(),
  note: z.string().nullable().optional(),
  earmarkId: z.number().nullable().optional(),
  earmarkAmount: z.number().nullable().optional(),
  budgetId: z.number().nullable().optional(),
  budgetAmount: z.number().nullable().optional(),
  budgets: z.array(z.object({ budgetId: z.number(), amount: z.number() })).optional(),
  earmarks: z.array(z.object({ earmarkId: z.number(), amount: z.number() })).optional(),
  tags: z.array(z.string()).optional()
})
export type TVoucherMetaUpdateInput = z.infer<typeof VoucherMetaUpdateInput>
export const VoucherDeleteInput = z.object({ id: z.number() })
export const VoucherDeleteOutput = z.object({ id: z.number() })

export type TVoucherUpdateInput = z.infer<typeof VoucherUpdateInput>
export type TVoucherUpdateOutput = z.infer<typeof VoucherUpdateOutput>
export type TVoucherDeleteInput = z.infer<typeof VoucherDeleteInput>
export type TVoucherDeleteOutput = z.infer<typeof VoucherDeleteOutput>

const PaymentAccountShape = z.object({
  id: z.number(),
  name: z.string(),
  kind: PaymentAccountKind,
  iban: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  sortOrder: z.number(),
  isActive: z.number()
})
export const PaymentAccountsListInput = z.object({ activeOnly: z.boolean().optional() }).optional()
export const PaymentAccountsListOutput = z.object({ rows: z.array(PaymentAccountShape) })
export const PaymentAccountUpsertInput = z.object({
  id: z.number().optional(),
  name: z.string(),
  kind: PaymentAccountKind,
  iban: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional()
})
export const PaymentAccountUpsertOutput = z.object({ id: z.number() })
export const PaymentAccountDeleteInput = z.object({ id: z.number() })
export const PaymentAccountDeleteOutput = z.object({ id: z.number() })
export type TPaymentAccountsListInput = z.infer<typeof PaymentAccountsListInput>
export type TPaymentAccountsListOutput = z.infer<typeof PaymentAccountsListOutput>
export type TPaymentAccountUpsertInput = z.infer<typeof PaymentAccountUpsertInput>
export type TPaymentAccountUpsertOutput = z.infer<typeof PaymentAccountUpsertOutput>
export type TPaymentAccountDeleteInput = z.infer<typeof PaymentAccountDeleteInput>
export type TPaymentAccountDeleteOutput = z.infer<typeof PaymentAccountDeleteOutput>

// Batch assign earmark to vouchers
export const VouchersBatchAssignEarmarkInput = z.object({
  earmarkId: z.number(),
  paymentMethod: PaymentMethod.optional(),
  paymentAccountId: z.number().nullable().optional(),
  sphere: Sphere.optional(),
  type: VoucherType.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  tag: z.string().optional(),
  filterEarmarkId: z.number().nullable().optional(),
  filterBudgetId: z.number().nullable().optional(),
  onlyWithout: z.boolean().optional()
})
export const VouchersBatchAssignEarmarkOutput = z.object({ updated: z.number() })
export type TVouchersBatchAssignEarmarkInput = z.infer<typeof VouchersBatchAssignEarmarkInput>
export type TVouchersBatchAssignEarmarkOutput = z.infer<typeof VouchersBatchAssignEarmarkOutput>

// Batch assign budget to vouchers
export const VouchersBatchAssignBudgetInput = z.object({
  budgetId: z.number(),
  paymentMethod: PaymentMethod.optional(),
  paymentAccountId: z.number().nullable().optional(),
  sphere: Sphere.optional(),
  type: VoucherType.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  tag: z.string().optional(),
  filterEarmarkId: z.number().nullable().optional(),
  filterBudgetId: z.number().nullable().optional(),
  onlyWithout: z.boolean().optional()
})
export const VouchersBatchAssignBudgetOutput = z.object({ updated: z.number() })
export type TVouchersBatchAssignBudgetInput = z.infer<typeof VouchersBatchAssignBudgetInput>
export type TVouchersBatchAssignBudgetOutput = z.infer<typeof VouchersBatchAssignBudgetOutput>

// Batch add tags to vouchers
export const VouchersBatchAssignTagsInput = z.object({
  tags: z.array(z.string()).nonempty(),
  paymentMethod: PaymentMethod.optional(),
  paymentAccountId: z.number().nullable().optional(),
  sphere: Sphere.optional(),
  type: VoucherType.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  tag: z.string().optional(),
  filterEarmarkId: z.number().nullable().optional(),
  filterBudgetId: z.number().nullable().optional()
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
  budget: z.number().nullable().optional(),
  enforceTimeRange: z.boolean().optional()
})
export const BindingUpsertOutput = z.object({ id: z.number() })
export const BindingListInput = z.object({ activeOnly: z.boolean().optional() }).optional()
export const BindingListOutput = z.object({
  rows: z.array(
    z.object({
      id: z.number(),
      code: z.string(),
      name: z.string(),
      description: z.string().nullable().optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      isActive: z.number(),
      color: z.string().nullable().optional(),
      budget: z.number().nullable().optional(),
      enforceTimeRange: z.number().optional()
    })
  )
})
export const BindingDeleteInput = z.object({ id: z.number() })
export const BindingDeleteOutput = z.object({ id: z.number() })
export const BindingUsageInput = z.object({
  earmarkId: z.number(),
  from: z.string().optional(),
  to: z.string().optional(),
  sphere: Sphere.optional()
})
export const BindingUsageOutput = z.object({
  allocated: z.number(),
  released: z.number(),
  balance: z.number(),
  budget: z.number(),
  remaining: z.number(),
  // Optional extras for tiles
  totalCount: z.number().optional(),
  insideCount: z.number().optional(),
  outsideCount: z.number().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional()
})

export type TBindingUpsertInput = z.infer<typeof BindingUpsertInput>
export type TBindingListInput = z.infer<typeof BindingListInput>
export type TBindingDeleteInput = z.infer<typeof BindingDeleteInput>
export type TBindingUsageInput = z.infer<typeof BindingUsageInput>
export type TBindingUpsertOutput = z.infer<typeof BindingUpsertOutput>
export type TBindingListOutput = z.infer<typeof BindingListOutput>
export type TBindingDeleteOutput = z.infer<typeof BindingDeleteOutput>
export type TBindingUsageOutput = z.infer<typeof BindingUsageOutput>

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
  color: z.string().nullable().optional(),
  isArchived: z.boolean().optional(),
  enforceTimeRange: z.boolean().optional()
})
export const BudgetUpsertOutput = z.object({ id: z.number() })
export const BudgetListInput = z
  .object({
    year: z.number().optional(),
    sphere: Sphere.optional(),
    earmarkId: z.number().nullable().optional(),
    includeArchived: z.boolean().optional(),
    archivedOnly: z.boolean().optional()
  })
  .optional()
export const BudgetListOutput = z.object({
  rows: z.array(
    z.object({
      id: z.number(),
      year: z.number(),
      sphere: Sphere,
      categoryId: z.number().nullable(),
      projectId: z.number().nullable(),
      earmarkId: z.number().nullable(),
      amountPlanned: z.number(),
      name: z.string().nullable().optional(),
      categoryName: z.string().nullable().optional(),
      projectName: z.string().nullable().optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      color: z.string().nullable().optional(),
      isArchived: z.number().optional(),
      enforceTimeRange: z.number().optional()
    })
  )
})
export const BudgetUsageInput = z.object({
  budgetId: z.number(),
  from: z.string().optional(),
  to: z.string().optional()
})
export const BudgetUsageOutput = z.object({
  spent: z.number(),
  inflow: z.number(),
  planned: z.number().optional(),
  balance: z.number().optional(),
  remaining: z.number().optional(),
  count: z.number(),
  lastDate: z.string().nullable(),
  // Optional extras for tiles
  countInside: z.number().optional(),
  countOutside: z.number().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional()
})
export const BudgetDeleteInput = z.object({ id: z.number() })
export const BudgetDeleteOutput = z.object({ id: z.number() })

export type TBudgetUpsertInput = z.infer<typeof BudgetUpsertInput>
export type TBudgetListInput = z.infer<typeof BudgetListInput>
export type TBudgetDeleteInput = z.infer<typeof BudgetDeleteInput>
export type TBudgetUsageInput = z.infer<typeof BudgetUsageInput>
export type TBudgetUsageOutput = z.infer<typeof BudgetUsageOutput>
export type TBudgetUpsertOutput = z.infer<typeof BudgetUpsertOutput>
export type TBudgetListOutput = z.infer<typeof BudgetListOutput>
export type TBudgetDeleteOutput = z.infer<typeof BudgetDeleteOutput>

// Vorschüsse (Mitglieder/Personen)
const AdvanceStatus = z.enum(['OPEN', 'RESOLVED'])
const AdvancePurchaseType = z.enum(['IN', 'OUT'])

export const AdvancesListInput = z
  .object({
    q: z.string().optional(),
    status: z.union([AdvanceStatus, z.literal('ALL')]).optional(),
    memberId: z.number().optional(),
    limit: z.number().optional(),
    offset: z.number().optional()
  })
  .optional()

export const AdvancesListOutput = z.object({
  rows: z.array(
    z.object({
      id: z.number(),
      memberId: z.number().nullable().optional(),
      recipientName: z.string(),
      memberName: z.string(),
      issuedAt: z.string(),
      amount: z.number(),
      settledAmount: z.number(),
      purchaseAmount: z.number().optional(),
      openAmount: z.number(),
      settlementCount: z.number(),
      purchaseCount: z.number().optional(),
      status: AdvanceStatus,
      notes: z.string().nullable().optional(),
      budgetId: z.number().nullable().optional(),
      earmarkId: z.number().nullable().optional(),
      placeholderVoucherId: z.number().nullable().optional(),
      resolvedAt: z.string().nullable().optional(),
      createdAt: z.string().optional()
    })
  ),
  total: z.number()
})

export const AdvanceCreateInput = z.object({
  recipientName: z.string(),
  issuedAt: z.string(),
  amount: z.number(),
  notes: z.string().nullable().optional(),
  budgetId: z.number().nullable().optional(),
  earmarkId: z.number().nullable().optional()
})
export const AdvanceCreateOutput = z.object({ id: z.number() })

export const AdvanceGetInput = z.object({ id: z.number() })
export const AdvanceGetOutput = z
  .object({
    id: z.number(),
    memberId: z.number().nullable().optional(),
    recipientName: z.string(),
    memberName: z.string(),
    issuedAt: z.string(),
    amount: z.number(),
    settledAmount: z.number(),
    purchaseAmount: z.number().optional(),
    openAmount: z.number(),
    settlementCount: z.number(),
    status: AdvanceStatus,
    notes: z.string().nullable().optional(),
    budgetId: z.number().nullable().optional(),
    earmarkId: z.number().nullable().optional(),
    placeholderVoucherId: z.number().nullable().optional(),
    resolvedAt: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    settlements: z.array(
      z.object({
        id: z.number(),
        advanceId: z.number(),
        settledAt: z.string(),
        amount: z.number(),
        note: z.string().nullable().optional(),
        voucherId: z.number().nullable().optional(),
        invoiceId: z.number().nullable().optional(),
        voucherNo: z.string().nullable().optional(),
        invoiceNo: z.string().nullable().optional(),
        createdAt: z.string().optional()
      })
    ),
    purchases: z.array(
      z.object({
        id: z.number(),
        advanceId: z.number(),
        date: z.string(),
        type: AdvancePurchaseType,
        sphere: Sphere,
        description: z.string().nullable().optional(),
        netAmount: z.number(),
        grossAmount: z.number(),
        vatRate: z.number(),
        paymentMethod: PaymentMethod.nullable().optional(),
        paymentAccountId: z.number().nullable().optional(),
        paymentAccountName: z.string().nullable().optional(),
        paymentAccountKind: PaymentAccountKind.nullable().optional(),
        paymentAccountColor: z.string().nullable().optional(),
        categoryId: z.number().nullable().optional(),
        projectId: z.number().nullable().optional(),
        budgets: z.array(VoucherBudgetAssignment).optional(),
        earmarks: z.array(VoucherEarmarkAssignment).optional(),
        tags: z.array(z.string()).optional(),
        files: z
          .array(
            z.object({ name: z.string(), dataBase64: z.string(), mime: z.string().optional() })
          )
          .optional(),
        voucherId: z.number().nullable().optional(),
        voucherNo: z.string().nullable().optional(),
        createdAt: z.string().optional()
      })
    )
  })
  .nullable()

export const AdvancePurchaseCreateInput = z
  .object({
    advanceId: z.number(),
    date: z.string(),
    type: AdvancePurchaseType,
    sphere: Sphere,
    description: z.string().optional(),
    netAmount: z.number().optional(),
    grossAmount: z.number().optional(),
    vatRate: z.number(),
    paymentMethod: PaymentMethod.optional(),
    paymentAccountId: z.number().nullable().optional(),
    categoryId: z.number().optional(),
    projectId: z.number().optional(),
    budgets: z.array(VoucherBudgetAssignment).optional(),
    earmarks: z.array(VoucherEarmarkAssignment).optional(),
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
export const AdvancePurchaseCreateOutput = z.object({ id: z.number() })

export const AdvancePurchaseDeleteInput = z.object({ id: z.number() })
export const AdvancePurchaseDeleteOutput = z.object({ id: z.number() })

export const AdvancePurchaseUpdateInput = z
  .object({
    id: z.number(),
    date: z.string(),
    type: AdvancePurchaseType,
    sphere: Sphere,
    description: z.string().optional(),
    netAmount: z.number().optional(),
    grossAmount: z.number().optional(),
    vatRate: z.number(),
    paymentMethod: PaymentMethod.optional(),
    paymentAccountId: z.number().nullable().optional(),
    categoryId: z.number().optional(),
    projectId: z.number().optional(),
    budgets: z.array(VoucherBudgetAssignment).optional(),
    earmarks: z.array(VoucherEarmarkAssignment).optional(),
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
export const AdvancePurchaseUpdateOutput = z.object({ id: z.number() })

export const AdvanceResolveInput = z.object({ id: z.number() })
export const AdvanceResolveOutput = z.object({ id: z.number() })

export const AdvanceSettleInput = z.object({
  id: z.number(),
  settledAt: z.string(),
  amount: z.number(),
  note: z.string().nullable().optional(),
  voucherId: z.number().nullable().optional(),
  invoiceId: z.number().nullable().optional()
})
export const AdvanceSettleOutput = z.object({ id: z.number() })

export const AdvanceDeleteInput = z.object({ id: z.number() })
export const AdvanceDeleteOutput = z.object({ id: z.number() })

export type TAdvancesListInput = z.infer<typeof AdvancesListInput>
export type TAdvancesListOutput = z.infer<typeof AdvancesListOutput>
export type TAdvanceCreateInput = z.infer<typeof AdvanceCreateInput>
export type TAdvanceCreateOutput = z.infer<typeof AdvanceCreateOutput>
export type TAdvanceGetInput = z.infer<typeof AdvanceGetInput>
export type TAdvanceGetOutput = z.infer<typeof AdvanceGetOutput>
export type TAdvanceSettleInput = z.infer<typeof AdvanceSettleInput>
export type TAdvanceSettleOutput = z.infer<typeof AdvanceSettleOutput>
export type TAdvanceDeleteInput = z.infer<typeof AdvanceDeleteInput>
export type TAdvanceDeleteOutput = z.infer<typeof AdvanceDeleteOutput>

export type TAdvancePurchaseCreateInput = z.infer<typeof AdvancePurchaseCreateInput>
export type TAdvancePurchaseCreateOutput = z.infer<typeof AdvancePurchaseCreateOutput>
export type TAdvancePurchaseDeleteInput = z.infer<typeof AdvancePurchaseDeleteInput>
export type TAdvancePurchaseDeleteOutput = z.infer<typeof AdvancePurchaseDeleteOutput>
export type TAdvancePurchaseUpdateInput = z.infer<typeof AdvancePurchaseUpdateInput>
export type TAdvancePurchaseUpdateOutput = z.infer<typeof AdvancePurchaseUpdateOutput>
export type TAdvanceResolveInput = z.infer<typeof AdvanceResolveInput>
export type TAdvanceResolveOutput = z.infer<typeof AdvanceResolveOutput>

// Quotes (weekly)
export const QuoteWeeklyInput = z.object({ date: z.string().optional() }).optional()
export const QuoteWeeklyOutput = z.object({
  text: z.string(),
  author: z.string().optional(),
  source: z.string().optional(),
  id: z.number().optional()
})
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
  rowStatuses: z
    .array(z.object({ row: z.number(), ok: z.boolean(), message: z.string().optional() }))
    .optional(),
  newTags: z.array(z.string()).optional(),
  errorFilePath: z.string().optional()
})

const ImportRuleSchema = z.object({
  id: z.string().optional(),
  enabled: z.boolean().optional(),
  sourceField: z.enum(['description', 'paymentAccount', 'tags', 'note']),
  contains: z.string(),
  targetField: z.enum([
    'tags',
    'type',
    'paymentMethod',
    'paymentAccount',
    'budget',
    'earmarkCode',
    'sphere'
  ]),
  value: z.string()
})

const ImportDraftIssueSchema = z.object({
  level: z.enum(['error', 'warning', 'info']),
  code: z.string(),
  message: z.string()
})

const ImportDraftRowSchema = z.object({
  id: z.string(),
  sourceRow: z.number(),
  status: z.enum(['ok', 'warning', 'error', 'duplicate', 'ignored']),
  duplicateAction: z.enum(['skip', 'import', 'merge']).optional(),
  duplicateIds: z.array(z.number()).optional(),
  issues: z.array(ImportDraftIssueSchema),
  original: z.record(z.any()),
  values: z.record(z.any())
})

const ImportMissingSchema = z.object({
  tags: z.array(z.string()).optional(),
  budgets: z.array(z.string()).optional(),
  earmarks: z.array(z.string()).optional(),
  paymentAccounts: z.array(z.string()).optional()
})

export const ImportAnalyzeInput = z.object({
  fileBase64: z.string(),
  mapping: z.record(z.string().nullable()),
  rules: z.array(ImportRuleSchema).optional()
})

export const ImportAnalyzeOutput = ImportPreviewOutput.extend({
  rows: z.array(ImportDraftRowSchema),
  summary: z.object({
    total: z.number(),
    ok: z.number(),
    warnings: z.number(),
    errors: z.number(),
    duplicates: z.number(),
    ignored: z.number()
  }),
  missing: z.object({
    tags: z.array(z.string()),
    budgets: z.array(z.string()),
    earmarks: z.array(z.string()),
    paymentAccounts: z.array(z.string())
  }),
  lookup: z.object({
    paymentAccounts: z.array(z.object({ id: z.number(), label: z.string() })),
    budgets: z.array(z.object({ id: z.number(), label: z.string() })),
    earmarks: z.array(z.object({ id: z.number(), label: z.string() })),
    tags: z.array(z.string())
  })
})

export const ImportCommitDraftInput = z.object({ rows: z.array(ImportDraftRowSchema) })
export const ImportCreateMissingInput = ImportMissingSchema
export const ImportCreateMissingOutput = z.object({
  tags: z.number(),
  budgets: z.number(),
  earmarks: z.number(),
  paymentAccounts: z.number()
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

export const ImportEditableExportInput = z.object({}).optional()
export const ImportEditableExportOutput = z.object({ filePath: z.string() })
export type TImportEditableExportInput = z.infer<typeof ImportEditableExportInput>
export type TImportEditableExportOutput = z.infer<typeof ImportEditableExportOutput>
export type TImportPreviewInput = z.infer<typeof ImportPreviewInput>
export type TImportPreviewOutput = z.infer<typeof ImportPreviewOutput>
export type TImportExecuteInput = z.infer<typeof ImportExecuteInput>
export type TImportExecuteOutput = z.infer<typeof ImportExecuteOutput>
export type TImportAnalyzeInput = z.infer<typeof ImportAnalyzeInput>
export type TImportAnalyzeOutput = z.infer<typeof ImportAnalyzeOutput>
export type TImportCommitDraftInput = z.infer<typeof ImportCommitDraftInput>
export type TImportCreateMissingInput = z.infer<typeof ImportCreateMissingInput>
export type TImportCreateMissingOutput = z.infer<typeof ImportCreateMissingOutput>

const BankCsvMappingSchema = z.object({
  bookingDate: z.string().nullable().optional(),
  valueDate: z.string().nullable().optional(),
  amount: z.string().nullable().optional(),
  debit: z.string().nullable().optional(),
  credit: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  counterparty: z.string().nullable().optional(),
  counterpartyIban: z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
  endToEndId: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  accountIban: z.string().nullable().optional()
})

export const BankImportPreviewInput = z.object({
  fileBase64: z.string(),
  fileName: z.string().min(1),
  paymentAccountId: z.number().int().positive().nullable().optional(),
  mapping: BankCsvMappingSchema.optional()
})

const BankImportPreviewRow = z.object({
  sourceRow: z.number(),
  bookingDate: z.string(),
  valueDate: z.string().nullable(),
  direction: z.enum(['IN', 'OUT']),
  amount: z.number(),
  currency: z.string(),
  counterparty: z.string().nullable(),
  counterpartyIban: z.string().nullable(),
  purpose: z.string().nullable(),
  endToEndId: z.string().nullable(),
  bankReference: z.string().nullable(),
  errors: z.array(z.string())
})

export const BankImportPreviewOutput = z.object({
  format: z.enum(['CAMT', 'CSV']),
  headers: z.array(z.string()),
  suggestedMapping: BankCsvMappingSchema,
  accountIbans: z.array(z.string()),
  detectedPaymentAccountId: z.number().nullable(),
  rows: z.array(BankImportPreviewRow),
  summary: z.object({ total: z.number(), valid: z.number(), errors: z.number() })
})

export const BankImportCommitInput = BankImportPreviewInput.extend({
  forceImportSourceRows: z.array(z.number().int().positive()).optional()
})

const BankImportDuplicateRow = z.object({
  sourceRow: z.number(),
  bookingDate: z.string(),
  valueDate: z.string().nullable(),
  direction: z.enum(['IN', 'OUT']),
  amount: z.number(),
  currency: z.string(),
  counterparty: z.string().nullable(),
  purpose: z.string().nullable(),
  endToEndId: z.string().nullable(),
  bankReference: z.string().nullable(),
  duplicateBy: z.enum(['REFERENCE', 'FINGERPRINT']),
  duplicateValue: z.string(),
  existing: z.object({
    id: z.number(),
    status: z.string(),
    bookingDate: z.string(),
    direction: z.enum(['IN', 'OUT']),
    amount: z.number(),
    counterparty: z.string().nullable().optional(),
    purpose: z.string().nullable().optional(),
    endToEndId: z.string().nullable().optional(),
    bankReference: z.string().nullable().optional(),
    paymentAccountName: z.string(),
    sourceFileName: z.string()
  })
})

export const BankImportCommitOutput = z.object({
  batchId: z.number(),
  imported: z.number(),
  duplicates: z.number(),
  duplicateRows: z.array(BankImportDuplicateRow),
  errors: z.array(z.object({ row: z.number(), message: z.string() }))
})

const BankTransactionStatus = z.enum(['OPEN', 'LINKED', 'CHECKED'])
export const BankTransactionsListInput = z.object({
  status: z.union([BankTransactionStatus, z.literal('ALL')]).optional(),
  paymentAccountId: z.number().int().positive().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  sortBy: z.enum(['status', 'date', 'description', 'account', 'type', 'amount']).optional(),
  sortDir: z.enum(['ASC', 'DESC']).optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(200).optional()
})
export const BankTransactionIdInput = z.object({ id: z.number().int().positive() })
export const BankTransactionLinkInput = BankTransactionIdInput.extend({
  voucherId: z.number().int().positive()
})
export const BankTransactionCheckInput = BankTransactionIdInput.extend({
  note: z.string().nullable().optional()
})
export const BankTransactionMatchesInput = BankTransactionIdInput.extend({
  q: z.string().optional(),
  includeAllDates: z.boolean().optional(),
  manual: z.boolean().optional()
})
export const BankTransactionOutput = z.record(z.any())
export const BankTransactionsListOutput = z.object({
  rows: z.array(BankTransactionOutput),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  stats: z.object({ total: z.number(), open: z.number(), linked: z.number(), checked: z.number() })
})
export const BankImportStatusOutput = z.object({
  lastBookingDate: z.string().nullable(),
  total: z.number(),
  accounts: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      color: z.string().nullable().optional(),
      lastBookingDate: z.string().nullable().optional(),
      total: z.number()
    })
  )
})
export const BankTransactionMatchesOutput = z.object({ rows: z.array(z.record(z.any())) })

export type TBankImportPreviewInput = z.infer<typeof BankImportPreviewInput>
export type TBankImportPreviewOutput = z.infer<typeof BankImportPreviewOutput>
export type TBankImportCommitInput = z.infer<typeof BankImportCommitInput>
export type TBankImportCommitOutput = z.infer<typeof BankImportCommitOutput>
export type TBankImportStatusOutput = z.infer<typeof BankImportStatusOutput>
export type TBankTransactionsListInput = z.infer<typeof BankTransactionsListInput>
export type TBankTransactionsListOutput = z.infer<typeof BankTransactionsListOutput>
export type TBankTransactionIdInput = z.infer<typeof BankTransactionIdInput>
export type TBankTransactionLinkInput = z.infer<typeof BankTransactionLinkInput>
export type TBankTransactionCheckInput = z.infer<typeof BankTransactionCheckInput>
export type TBankTransactionMatchesInput = z.infer<typeof BankTransactionMatchesInput>
export type TBankTransactionOutput = z.infer<typeof BankTransactionOutput>
export type TBankTransactionMatchesOutput = z.infer<typeof BankTransactionMatchesOutput>

// Attachments (files linked to vouchers)
export const AttachmentsListInput = z.object({ voucherId: z.number() })
export const AttachmentsListOutput = z.object({
  files: z.array(
    z.object({
      id: z.number(),
      fileName: z.string(),
      mimeType: z.string().nullable().optional(),
      size: z.number().nullable().optional(),
      createdAt: z.string().optional()
    })
  )
})
export const AttachmentOpenInput = z.object({ fileId: z.number() })
export const AttachmentOpenOutput = z.object({ ok: z.boolean() })
export const AttachmentSaveAsInput = z.object({ fileId: z.number() })
export const AttachmentSaveAsOutput = z.object({ filePath: z.string() })
export const AttachmentReadInput = z.object({ fileId: z.number() })
export const AttachmentReadOutput = z.object({
  fileName: z.string(),
  mimeType: z.string().optional(),
  dataBase64: z.string()
})

// Attachments add/delete
export const AttachmentAddInput = z.object({
  voucherId: z.number(),
  fileName: z.string(),
  dataBase64: z.string(),
  mimeType: z.string().optional()
})
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

// Import from provided path (renderer selects file first)
export const DbImportFromPathInput = z.object({ filePath: z.string() })
export const DbImportFromPathOutput = z.object({ ok: z.boolean(), filePath: z.string().optional() })
export type TDbImportFromPathInput = z.infer<typeof DbImportFromPathInput>
export type TDbImportFromPathOutput = z.infer<typeof DbImportFromPathOutput>

// Dangerous action: delete all vouchers
export const VouchersClearAllInput = z.object({ confirm: z.literal(true) })
export const VouchersClearAllOutput = z.object({ deleted: z.number() })
export type TVouchersClearAllInput = z.infer<typeof VouchersClearAllInput>
export type TVouchersClearAllOutput = z.infer<typeof VouchersClearAllOutput>

// Tags CRUD
export const TagsListInput = z
  .object({ q: z.string().optional(), includeUsage: z.boolean().optional() })
  .optional()
export const TagsListOutput = z.object({
  rows: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      color: z.string().nullable().optional(),
      usage: z.number().optional()
    })
  )
})
export const TagUpsertInput = z.object({
  id: z.number().optional(),
  name: z.string(),
  color: z.string().nullable().optional()
})
export const TagUpsertOutput = z.object({ id: z.number() })
export const TagDeleteInput = z.object({ id: z.number() })
export const TagDeleteOutput = z.object({ id: z.number() })
export const TagUsageInput = z.object({ tagId: z.number() })
export const TagUsageOutput = z.object({
  inflow: z.number(),
  spent: z.number(),
  balance: z.number(),
  count: z.number()
})
export type TTagsListInput = z.infer<typeof TagsListInput>
export type TTagsListOutput = z.infer<typeof TagsListOutput>
export type TTagUpsertInput = z.infer<typeof TagUpsertInput>
export type TTagUpsertOutput = z.infer<typeof TagUpsertOutput>
export type TTagDeleteInput = z.infer<typeof TagDeleteInput>
export type TTagDeleteOutput = z.infer<typeof TagDeleteOutput>

// Members CRUD
const MemberStatus = z.enum(['ACTIVE', 'NEW', 'PAUSED', 'LEFT'])
export const MembersListInput = z
  .object({
    q: z.string().optional(),
    status: z.enum(['ACTIVE', 'NEW', 'PAUSED', 'LEFT', 'ALL']).optional(),
    limit: z.number().min(1).max(200).default(50).optional(),
    offset: z.number().min(0).default(0).optional(),
    sortBy: z.enum(['memberNo', 'name', 'email', 'status']).optional(),
    sort: z.enum(['ASC', 'DESC']).optional()
  })
  .optional()
const BoardRole = z.enum(['V1', 'V2', 'KASSIER', 'KASSENPR1', 'KASSENPR2', 'SCHRIFT'])
export const MembersListOutput = z.object({
  rows: z.array(
    z.object({
      id: z.number(),
      memberNo: z.string().nullable().optional(),
      name: z.string(),
      email: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
      status: MemberStatus,
      boardRole: BoardRole.nullable().optional(),
      createdAt: z.string(),
      updatedAt: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
      iban: z.string().nullable().optional(),
      bic: z.string().nullable().optional(),
      contribution_amount: z.number().nullable().optional(),
      contribution_interval: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']).nullable().optional(),
      mandate_ref: z.string().nullable().optional(),
      mandate_date: z.string().nullable().optional(),
      join_date: z.string().nullable().optional(),
      leave_date: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      next_due_date: z.string().nullable().optional()
    })
  ),
  total: z.number()
})
export const MemberCreateInput = z.object({
  memberNo: z.string(),
  name: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  status: MemberStatus.optional(),
  boardRole: BoardRole.nullable().optional(),
  tags: z.array(z.string()).optional(),
  iban: z.string().nullable().optional(),
  bic: z.string().nullable().optional(),
  contribution_amount: z.number().nullable().optional(),
  contribution_interval: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']).nullable().optional(),
  mandate_ref: z.string().nullable().optional(),
  mandate_date: z.string().nullable().optional(),
  join_date: z.string(),
  leave_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  next_due_date: z.string().nullable().optional()
})
export const MemberCreateOutput = z.object({ id: z.number() })
export const MemberUpdateInput = z.object({
  id: z.number(),
  memberNo: z.string().nullable().optional(),
  name: z.string().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  status: MemberStatus.optional(),
  boardRole: BoardRole.nullable().optional(),
  tags: z.array(z.string()).optional(),
  iban: z.string().nullable().optional(),
  bic: z.string().nullable().optional(),
  contribution_amount: z.number().nullable().optional(),
  contribution_interval: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']).nullable().optional(),
  mandate_ref: z.string().nullable().optional(),
  mandate_date: z.string().nullable().optional(),
  join_date: z.string().nullable().optional(),
  leave_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  next_due_date: z.string().nullable().optional()
})
export const MemberUpdateOutput = z.object({ id: z.number() })
export const MemberDeleteInput = z.object({ id: z.number() })
export const MemberDeleteOutput = z.object({ id: z.number() })
export const MemberGetInput = z.object({ id: z.number() })
export const MemberGetOutput = z
  .object({
    id: z.number(),
    memberNo: z.string().nullable().optional(),
    name: z.string(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    status: MemberStatus,
    boardRole: BoardRole.nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    iban: z.string().nullable().optional(),
    bic: z.string().nullable().optional(),
    contribution_amount: z.number().nullable().optional(),
    contribution_interval: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']).nullable().optional(),
    mandate_ref: z.string().nullable().optional(),
    mandate_date: z.string().nullable().optional(),
    join_date: z.string().nullable().optional(),
    leave_date: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    next_due_date: z.string().nullable().optional()
  })
  .nullable()
export type TMembersListInput = z.infer<typeof MembersListInput>
export type TMembersListOutput = z.infer<typeof MembersListOutput>
export type TMemberCreateInput = z.infer<typeof MemberCreateInput>
export type TMemberCreateOutput = z.infer<typeof MemberCreateOutput>
export type TMemberUpdateInput = z.infer<typeof MemberUpdateInput>
export type TMemberUpdateOutput = z.infer<typeof MemberUpdateOutput>
export type TMemberDeleteInput = z.infer<typeof MemberDeleteInput>
export type TMemberDeleteOutput = z.infer<typeof MemberDeleteOutput>
export type TMemberGetInput = z.infer<typeof MemberGetInput>
export type TMemberGetOutput = z.infer<typeof MemberGetOutput>

// Membership payments (Phase 3)
export const PaymentsListDueInput = z.object({
  interval: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
  periodKey: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  includePaid: z.boolean().optional(),
  memberId: z.number().optional()
})
export const PaymentsListDueOutput = z.object({
  rows: z.array(
    z.object({
      memberId: z.number(),
      name: z.string(),
      memberNo: z.string().nullable().optional(),
      status: MemberStatus,
      periodKey: z.string(),
      interval: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
      amount: z.number(),
      paid: z.number(),
      voucherId: z.number().nullable().optional(),
      verified: z.number().optional()
    })
  ),
  total: z.number()
})
export const PaymentsMarkPaidInput = z.object({
  memberId: z.number(),
  periodKey: z.string(),
  interval: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
  amount: z.number(),
  voucherId: z.number().nullable().optional(),
  datePaid: z.string().nullable().optional()
})
export const PaymentsMarkPaidOutput = z.object({ ok: z.boolean() })
export const PaymentsUnmarkInput = z.object({ memberId: z.number(), periodKey: z.string() })
export const PaymentsUnmarkOutput = z.object({ ok: z.boolean() })
export const PaymentsSuggestVouchersInput = z.object({
  name: z.string().nullable().optional(),
  amount: z.number(),
  periodKey: z.string(),
  memberId: z.number().optional()
})
export const PaymentsSuggestVouchersOutput = z.object({
  rows: z.array(
    z.object({
      id: z.number(),
      voucherNo: z.string(),
      date: z.string(),
      description: z.string().nullable().optional(),
      counterparty: z.string().nullable().optional(),
      gross: z.number()
    })
  )
})
export const PaymentsDueSummaryOutput = z.object({ dueMembers: z.number(), duePeriods: z.number() })
export type TPaymentsListDueInput = z.infer<typeof PaymentsListDueInput>
export type TPaymentsListDueOutput = z.infer<typeof PaymentsListDueOutput>
export type TPaymentsMarkPaidInput = z.infer<typeof PaymentsMarkPaidInput>
export type TPaymentsMarkPaidOutput = z.infer<typeof PaymentsMarkPaidOutput>
export type TPaymentsUnmarkInput = z.infer<typeof PaymentsUnmarkInput>
export type TPaymentsUnmarkOutput = z.infer<typeof PaymentsUnmarkOutput>
export type TPaymentsSuggestVouchersInput = z.infer<typeof PaymentsSuggestVouchersInput>
export type TPaymentsSuggestVouchersOutput = z.infer<typeof PaymentsSuggestVouchersOutput>
export type TPaymentsDueSummaryOutput = z.infer<typeof PaymentsDueSummaryOutput>

// AI jobs and OpenAI-backed helpers
export const AiJobType = z.enum(['BOOKING_FROM_DOCUMENTS', 'MEMBER_TEXT', 'REPORT_TEXT'])
export const AiJobStatus = z.enum([
  'DRAFT',
  'QUEUED',
  'PROCESSING',
  'NEEDS_REVIEW',
  'APPROVED',
  'REJECTED',
  'FAILED'
])
export const AiResultKind = z.enum(['BOOKING_CANDIDATE', 'TEXT_DRAFT'])

export const AiJobFileInput = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().nullable().optional(),
  dataBase64: z.string().min(1)
})

export const AiBookingAssignment = z.object({
  id: z.number().int().positive(),
  amount: z.number().nonnegative()
})

export const AiBookingCandidateReview = z.object({
  status: z.enum(['OPEN', 'APPROVED']).default('OPEN'),
  voucherId: z.number().int().positive().nullable().optional(),
  voucherNo: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional()
})

export const AiBookingSource = z.object({
  fileName: z.string().min(1),
  pageNumber: z.number().int().positive().nullable().optional(),
  pageCount: z.number().int().positive().nullable().optional(),
  label: z.string().min(1)
})

export const AiBookingSourceStructured = z.object({
  fileName: z.string().min(1),
  pageNumber: z.number().int().positive().nullable(),
  pageCount: z.number().int().positive().nullable(),
  label: z.string().min(1)
})

export const AiBookingCandidate = z.object({
  date: z.string().min(4),
  type: VoucherType.exclude(['TRANSFER', 'INTERNAL']),
  sphere: Sphere,
  description: z.string().min(1),
  grossAmount: z.number().positive(),
  vatRate: z.number().min(0).max(100).default(0),
  paymentMethod: PaymentMethod.nullable().optional(),
  paymentAccountId: z.number().int().positive().nullable().optional(),
  counterparty: z.string().nullable().optional(),
  budgets: z.array(AiBookingAssignment).default([]),
  earmarks: z.array(AiBookingAssignment).default([]),
  tags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  warnings: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  source: AiBookingSource.optional(),
  review: AiBookingCandidateReview.optional()
})

export const AiBookingAnalysisResult = z.object({
  candidates: z.array(AiBookingCandidate).min(1),
  summary: z.string().nullable().optional(),
  warnings: z.array(z.string()).default([])
})

export const AiTextDraftResult = z.object({
  title: z.string(),
  body: z.string(),
  notes: z.array(z.string()).default([])
})

export const AiBookingCandidateStructured = z.object({
  date: z.string().min(4),
  type: VoucherType.exclude(['TRANSFER', 'INTERNAL']),
  sphere: Sphere,
  description: z.string().min(1),
  grossAmount: z.number().positive(),
  vatRate: z.number().min(0).max(100),
  paymentMethod: PaymentMethod.nullable(),
  paymentAccountId: z.number().int().positive().nullable(),
  counterparty: z.string().nullable(),
  budgets: z.array(AiBookingAssignment),
  earmarks: z.array(AiBookingAssignment),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  evidence: z.array(z.string()),
  source: AiBookingSourceStructured
})

export const AiBookingAnalysisResultStructured = z.object({
  candidates: z.array(AiBookingCandidateStructured).min(1),
  summary: z.string().nullable(),
  warnings: z.array(z.string())
})

export const AiTextDraftResultStructured = z.object({
  title: z.string(),
  body: z.string(),
  notes: z.array(z.string())
})

export const AiBankImportAction = z.enum([
  'LINK_EXISTING',
  'CREATE_BOOKING',
  'MARK_CHECKED',
  'NEEDS_MANUAL_REVIEW'
])
export const AiBankImportReviewSuggestion = z
  .object({
    transactionId: z.number().int().positive(),
    action: AiBankImportAction,
    confidence: z.number().min(0).max(1).default(0.5),
    reason: z.string().min(1),
    voucherId: z.number().int().positive().nullable().optional(),
    voucherNo: z.string().nullable().optional(),
    bookingCandidate: AiBookingCandidate.nullable().optional(),
    warnings: z.array(z.string()).default([]),
    evidence: z.array(z.string()).default([]),
    transaction: z.record(z.any()).optional()
  })
  .superRefine((value, ctx) => {
    if (value.action === 'LINK_EXISTING' && !value.voucherId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LINK_EXISTING requires voucherId',
        path: ['voucherId']
      })
    }
    if (value.action === 'CREATE_BOOKING' && !value.bookingCandidate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CREATE_BOOKING requires bookingCandidate',
        path: ['bookingCandidate']
      })
    }
  })

export const AiBankImportReviewResult = z.object({
  suggestions: z.array(AiBankImportReviewSuggestion).default([]),
  summary: z.string().optional(),
  warnings: z.array(z.string()).default([])
})

export const AiBankImportReviewSuggestionStructured = z
  .object({
    transactionId: z.number().int().positive(),
    action: AiBankImportAction,
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1),
    voucherId: z.number().int().positive().nullable(),
    voucherNo: z.string().nullable(),
    bookingCandidate: AiBookingCandidateStructured.nullable(),
    warnings: z.array(z.string()),
    evidence: z.array(z.string())
  })
  .superRefine((value, ctx) => {
    if (value.action === 'LINK_EXISTING' && !value.voucherId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LINK_EXISTING requires voucherId',
        path: ['voucherId']
      })
    }
    if (value.action === 'CREATE_BOOKING' && !value.bookingCandidate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CREATE_BOOKING requires bookingCandidate',
        path: ['bookingCandidate']
      })
    }
  })

export const AiBankImportReviewResultStructured = z.object({
  suggestions: z.array(AiBankImportReviewSuggestionStructured),
  summary: z.string().nullable(),
  warnings: z.array(z.string())
})

export const AiActionEntity = z.enum([
  'vouchers',
  'members',
  'payments',
  'tags',
  'budgets',
  'earmarks',
  'reports',
  'bankImport',
  'text',
  'unknown'
])
export const AiActionOperation = z.enum([
  'read',
  'create',
  'update',
  'delete',
  'export',
  'reviewBankImport',
  'generateText',
  'none'
])
export const AiActionSafety = z.enum(['READ_ONLY', 'REVIEW_REQUIRED', 'DIRECT_SAFE', 'BLOCKED'])
export const AiActionFilter = z.object({
  field: z.string(),
  operator: z
    .enum(['eq', 'contains', 'in', 'date_gte', 'date_lte', 'amount_gte', 'amount_lte'])
    .default('eq'),
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string(), z.number(), z.boolean()]))
    ])
    .nullable()
})
export const AiActionChange = z.object({
  field: z.string(),
  mode: z.enum(['set', 'add', 'remove', 'append']).default('set'),
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string(), z.number(), z.boolean()]))
    ])
    .nullable()
})
export const AiActionArg = z.object({
  key: z.string(),
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string(), z.number(), z.boolean()]))
    ])
    .nullable()
})
export const AiActionItem = z.object({
  values: z.array(AiActionArg)
})
export const AiActionPlan = z.object({
  title: z.string(),
  summary: z.string(),
  entity: AiActionEntity,
  operation: AiActionOperation,
  safety: AiActionSafety,
  filters: z.array(AiActionFilter).default([]),
  changes: z.array(AiActionChange).default([]),
  args: z.array(AiActionArg).default([]),
  items: z.array(AiActionItem).default([]),
  requiresReview: z.boolean().default(true),
  confidence: z.number().min(0).max(1).default(0.5),
  answer: z.string().nullable().optional(),
  warnings: z.array(z.string()).default([])
})
export const AiActionPlanStructured = z.object({
  title: z.string(),
  summary: z.string(),
  entity: AiActionEntity,
  operation: AiActionOperation,
  safety: AiActionSafety,
  filters: z.array(AiActionFilter),
  changes: z.array(AiActionChange),
  args: z.array(AiActionArg),
  items: z.array(AiActionItem),
  requiresReview: z.boolean(),
  confidence: z.number().min(0).max(1),
  answer: z.string().nullable(),
  warnings: z.array(z.string())
})

export const AiUsageSchema = z.object({
  inputTokens: z.number().default(0),
  cachedInputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  reasoningTokens: z.number().default(0),
  totalTokens: z.number().default(0),
  estimatedCostUsd: z.number().nullable().optional(),
  pricingNote: z.string().optional()
})

export const AiAgentDraft = z.object({
  kind: z.enum([
    'booking',
    'voucherUpdate',
    'voucherReverse',
    'voucherRebook',
    'memberCreate',
    'memberUpdate',
    'contributionPaymentLink',
    'tagChange',
    'budgetChange',
    'earmarkChange',
    'bankLink',
    'invoiceAction',
    'reportExport'
  ]),
  title: z.string(),
  payload: z.any(),
  autoApproval: z
    .object({
      action: z.enum(['AUTO_PRESELECT', 'AUTO_APPLY_SAFE']),
      ruleIds: z.array(z.number()),
      ruleNames: z.array(z.string())
    })
    .nullable()
    .optional()
})
export const AiAgentToolCall = z.object({
  name: z.string(),
  args: z.any().optional(),
  ok: z.boolean(),
  summary: z.string().nullable().optional()
})
export const AiAgentTraceEvent = z.object({
  id: z.string(),
  kind: z.enum(['tool_call', 'tool_result', 'draft', 'memory', 'rule', 'message']),
  title: z.string(),
  detail: z.string().nullable().optional(),
  ok: z.boolean().optional(),
  payload: z.any().optional()
})
export const AiAgentRunInput = z.object({
  sessionId: z.string().min(1).nullable().optional(),
  prompt: z.string().min(1),
  uiContext: z.any().optional(),
  model: z.string().optional(),
  maxSteps: z.number().int().min(1).max(8).optional()
})
export const AiAgentRunOutput = z.object({
  sessionId: z.string(),
  title: z.string().nullable().optional(),
  answer: z.string(),
  model: z.string(),
  toolCalls: z.array(AiAgentToolCall).default([]),
  trace: z.array(AiAgentTraceEvent).default([]),
  drafts: z.array(AiAgentDraft).default([]),
  usage: AiUsageSchema
})

export const AiAgentMemorySchema = z.object({
  id: z.number(),
  scope: z.enum(['ORG', 'USER', 'SESSION']),
  key: z.string(),
  value: z.string(),
  source: z.string().nullable().optional(),
  confidence: z.number(),
  isActive: z.number(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export const AiAgentMemoryListInput = z
  .object({
    activeOnly: z.boolean().optional(),
    scope: z.enum(['ORG', 'USER', 'SESSION']).optional(),
    limit: z.number().optional()
  })
  .optional()
export const AiAgentMemoryListOutput = z.object({ rows: z.array(AiAgentMemorySchema) })
export const AiAgentMemoryUpsertInput = z.object({
  scope: z.enum(['ORG', 'USER', 'SESSION']).optional(),
  key: z.string().min(1),
  value: z.string().min(1),
  source: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional()
})

export const AiAgentAutoRuleSchema = z.object({
  id: z.number(),
  name: z.string(),
  draftKind: z.string(),
  conditions: z.record(z.string(), z.any()),
  action: z.enum(['AUTO_PRESELECT', 'AUTO_APPLY_SAFE']),
  enabled: z.number(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export const AiAgentAutoRulesListInput = z
  .object({
    enabledOnly: z.boolean().optional(),
    draftKind: z.string().optional(),
    limit: z.number().optional()
  })
  .optional()
export const AiAgentAutoRulesListOutput = z.object({ rows: z.array(AiAgentAutoRuleSchema) })
export const AiAgentAutoRuleUpsertInput = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  draftKind: z.string().min(1),
  conditions: z.record(z.string(), z.any()).optional(),
  action: z.enum(['AUTO_PRESELECT', 'AUTO_APPLY_SAFE']).optional(),
  enabled: z.boolean().optional()
})

export const AiJobSchema = z.object({
  id: z.number(),
  type: AiJobType,
  status: AiJobStatus,
  title: z.string().nullable().optional(),
  prompt: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  usage: AiUsageSchema.nullable().optional(),
  error: z.string().nullable().optional(),
  voucherId: z.number().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  processedAt: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  fileCount: z.number(),
  resultKind: AiResultKind.nullable().optional(),
  result: z.any().optional()
})

export const AiJobDetailSchema = AiJobSchema.extend({
  files: z.array(
    z.object({
      id: z.number(),
      jobId: z.number(),
      fileName: z.string(),
      mimeType: z.string().nullable().optional(),
      size: z.number(),
      createdAt: z.string(),
      dataBase64: z.string().optional()
    })
  )
})

export const AiProvider = z.enum(['openai', 'minimax'])
export const AiSettingsGetOutput = z.object({
  hasApiKey: z.boolean(),
  model: z.string(),
  textModel: z.string(),
  defaultReasoningEffort: z.enum(['low', 'medium', 'high']).default('medium'),
  provider: AiProvider.default('openai'),
  apiBaseUrl: z.string().url().default('https://api.openai.com/v1')
})
export const AiSettingsSetInput = z.object({
  apiKey: z.string().optional(),
  model: z.string().min(1).optional(),
  textModel: z.string().min(1).optional(),
  defaultReasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
  provider: AiProvider.optional(),
  apiBaseUrl: z.string().url().optional()
})
export const AiSettingsSetOutput = z.object({
  ok: z.boolean(),
  hasApiKey: z.boolean(),
  model: z.string(),
  textModel: z.string(),
  defaultReasoningEffort: z.enum(['low', 'medium', 'high']),
  provider: AiProvider,
  apiBaseUrl: z.string().url()
})
export const AiSettingsTestOutput = z.object({ ok: z.boolean(), error: z.string().optional() })
export const AiMcpStatusOutput = z.object({
  localhostEnabled: z.boolean(),
  running: z.boolean(),
  port: z.number().int().nullable(),
  url: z.string().nullable(),
  token: z.string().nullable(),
  externalConnections: z.number().int().default(0)
})
export const AiMcpConfigureInput = z.object({
  localhostEnabled: z.boolean(),
  port: z.number().int().min(1).max(65535).nullable().optional()
})
export const AiMcpConfigureOutput = AiMcpStatusOutput
export const AiBankImportReviewInput = z
  .object({
    limit: z.number().int().min(1).max(50).default(20).optional()
  })
  .optional()
export const AiBankImportReviewOutput = AiBankImportReviewResult
export const AiJobsCreateInput = z.object({
  type: AiJobType,
  title: z.string().optional(),
  prompt: z.string().optional(),
  model: z.string().optional(),
  files: z.array(AiJobFileInput).max(20).optional()
})
export const AiJobsCreateOutput = AiJobDetailSchema
export const AiJobsListInput = z
  .object({
    status: z.union([AiJobStatus, z.literal('ALL')]).optional(),
    type: AiJobType.optional(),
    limit: z.number().min(1).max(200).default(100).optional(),
    offset: z.number().min(0).default(0).optional()
  })
  .optional()
export const AiJobsListOutput = z.object({ rows: z.array(AiJobSchema), total: z.number() })
export const AiJobIdInput = z.object({ id: z.number().int().positive() })
export const AiJobsGetOutput = AiJobDetailSchema
export const AiJobsProcessOutput = AiJobDetailSchema
export const AiJobsUpdateCandidateInput = z.object({
  id: z.number().int().positive(),
  result: AiBookingAnalysisResult
})
export const AiJobsApproveCandidateInput = z.object({
  id: z.number().int().positive(),
  candidateIndex: z.number().int().min(0).default(0)
})
export const AiJobsApproveCandidateOutput = z.object({
  ok: z.boolean(),
  voucherId: z.number(),
  voucherNo: z.string()
})
export const AiJobsRejectInput = z.object({
  id: z.number().int().positive(),
  reason: z.string().optional()
})
export const AiJobsDeleteOutput = z.object({ ok: z.boolean() })
export const AiTextGenerateInput = z.object({
  type: z.enum(['INVITATION', 'MEMBER_MESSAGE', 'REPORT_TEXT']),
  prompt: z.string().min(1),
  tone: z.string().optional(),
  audience: z.string().optional(),
  model: z.string().optional()
})
export const AiTextGenerateOutput = AiTextDraftResult
export const AiActionPlanInput = z.object({
  prompt: z.string().min(1),
  conversation: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        title: z.string().optional(),
        body: z.string()
      })
    )
    .default([])
    .optional(),
  model: z.string().optional()
})
export const AiActionPlanOutput = z.object({
  model: z.string(),
  plan: AiActionPlan,
  usage: AiUsageSchema
})

export type TAiJobType = z.infer<typeof AiJobType>
export type TAiJobStatus = z.infer<typeof AiJobStatus>
export type TAiResultKind = z.infer<typeof AiResultKind>
export type TAiJobFileInput = z.infer<typeof AiJobFileInput>
export type TAiBookingCandidate = z.infer<typeof AiBookingCandidate>
export type TAiBookingAnalysisResult = z.infer<typeof AiBookingAnalysisResult>
export type TAiTextDraftResult = z.infer<typeof AiTextDraftResult>
export type TAiActionPlan = z.infer<typeof AiActionPlan>
export type TAiBankImportReviewSuggestion = z.infer<typeof AiBankImportReviewSuggestion>
export type TAiBankImportReviewResult = z.infer<typeof AiBankImportReviewResult>
export type TAiAgentDraft = z.infer<typeof AiAgentDraft>
export type TAiAgentTraceEvent = z.infer<typeof AiAgentTraceEvent>
export type TAiAgentRunInput = z.infer<typeof AiAgentRunInput>
export type TAiAgentRunOutput = z.infer<typeof AiAgentRunOutput>
export type TAiAgentMemoryListInput = z.infer<typeof AiAgentMemoryListInput>
export type TAiAgentMemoryListOutput = z.infer<typeof AiAgentMemoryListOutput>
export type TAiAgentMemoryUpsertInput = z.infer<typeof AiAgentMemoryUpsertInput>
export type TAiAgentAutoRulesListInput = z.infer<typeof AiAgentAutoRulesListInput>
export type TAiAgentAutoRulesListOutput = z.infer<typeof AiAgentAutoRulesListOutput>
export type TAiAgentAutoRuleUpsertInput = z.infer<typeof AiAgentAutoRuleUpsertInput>
export type TAiUsage = z.infer<typeof AiUsageSchema>
export type TAiSettingsGetOutput = z.infer<typeof AiSettingsGetOutput>
export type TAiSettingsSetInput = z.infer<typeof AiSettingsSetInput>
export type TAiSettingsSetOutput = z.infer<typeof AiSettingsSetOutput>
export type TAiSettingsTestOutput = z.infer<typeof AiSettingsTestOutput>
export type TAiMcpStatusOutput = z.infer<typeof AiMcpStatusOutput>
export type TAiMcpConfigureInput = z.infer<typeof AiMcpConfigureInput>
export type TAiMcpConfigureOutput = z.infer<typeof AiMcpConfigureOutput>
export type TAiBankImportReviewInput = z.infer<typeof AiBankImportReviewInput>
export type TAiBankImportReviewOutput = z.infer<typeof AiBankImportReviewOutput>
export type TAiJobsCreateInput = z.infer<typeof AiJobsCreateInput>
export type TAiJobsCreateOutput = z.infer<typeof AiJobsCreateOutput>
export type TAiJobsListInput = z.infer<typeof AiJobsListInput>
export type TAiJobsListOutput = z.infer<typeof AiJobsListOutput>
export type TAiJobIdInput = z.infer<typeof AiJobIdInput>
export type TAiJobsGetOutput = z.infer<typeof AiJobsGetOutput>
export type TAiJobsProcessOutput = z.infer<typeof AiJobsProcessOutput>
export type TAiJobsUpdateCandidateInput = z.infer<typeof AiJobsUpdateCandidateInput>
export type TAiJobsApproveCandidateInput = z.infer<typeof AiJobsApproveCandidateInput>
export type TAiJobsApproveCandidateOutput = z.infer<typeof AiJobsApproveCandidateOutput>
export type TAiJobsRejectInput = z.infer<typeof AiJobsRejectInput>
export type TAiJobsDeleteOutput = z.infer<typeof AiJobsDeleteOutput>
export type TAiTextGenerateInput = z.infer<typeof AiTextGenerateInput>
export type TAiTextGenerateOutput = z.infer<typeof AiTextGenerateOutput>
export type TAiActionPlanInput = z.infer<typeof AiActionPlanInput>
export type TAiActionPlanOutput = z.infer<typeof AiActionPlanOutput>
// Settings (simple key-value)
export const SettingsGetInput = z.object({ key: z.string() })
export const SettingsGetOutput = z.object({ value: z.any().optional() })
export const SettingsSetInput = z.object({ key: z.string(), value: z.any() })
export const SettingsSetOutput = z.object({ ok: z.boolean() })
export type TSettingsGetInput = z.infer<typeof SettingsGetInput>
export type TSettingsGetOutput = z.infer<typeof SettingsGetOutput>
export type TSettingsSetInput = z.infer<typeof SettingsSetInput>
export type TSettingsSetOutput = z.infer<typeof SettingsSetOutput>

// Tax Exemption Certificate
export const TaxExemptionGetOutput = z.object({
  certificate: z
    .object({
      fileName: z.string(),
      uploadDate: z.string(),
      validFrom: z.string().optional(),
      validUntil: z.string().optional(),
      fileData: z.string(),
      mimeType: z.string(),
      fileSize: z.number()
    })
    .nullable()
})
export const TaxExemptionSaveInput = z.object({
  fileName: z.string(),
  fileData: z.string(), // base64
  mimeType: z.string(),
  fileSize: z.number(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional()
})
export const TaxExemptionSaveOutput = z.object({ ok: z.boolean() })
export const TaxExemptionDeleteOutput = z.object({ ok: z.boolean() })
export const TaxExemptionUpdateValidityInput = z.object({
  validFrom: z.string().optional(),
  validUntil: z.string().optional()
})
export const TaxExemptionUpdateValidityOutput = z.object({ ok: z.boolean() })

export type TTaxExemptionGetOutput = z.infer<typeof TaxExemptionGetOutput>
export type TTaxExemptionSaveInput = z.infer<typeof TaxExemptionSaveInput>
export type TTaxExemptionSaveOutput = z.infer<typeof TaxExemptionSaveOutput>
export type TTaxExemptionDeleteOutput = z.infer<typeof TaxExemptionDeleteOutput>
export type TTaxExemptionUpdateValidityInput = z.infer<typeof TaxExemptionUpdateValidityInput>
export type TTaxExemptionUpdateValidityOutput = z.infer<typeof TaxExemptionUpdateValidityOutput>

// Donation receipts (Spendenbescheinigung - Geldzuwendung)
export const DonationsExportMoneyReceiptInput = z.object({
  receiptType: z.enum(['MONEY', 'IN_KIND']).optional(),
  donorName: z.string(),
  donorAddress: z.string(),
  amount: z.number().positive(),
  itemDescription: z.string().optional(),
  itemCondition: z.string().optional(),
  itemOrigin: z.enum(['PRIVAT', 'BETRIEB', 'UNBEKANNT']).optional(),
  valuationMethod: z.string().optional(),
  donationDate: z.string(),
  purpose: z.string(),
  receiptDate: z.string(),
  place: z.string().optional(),
  waiverReimbursement: z.boolean().optional(),
  taxExemptionConfirmed: z.boolean().optional(),
  statuteRequirementsConfirmed: z.boolean().optional(),
  directUse: z.boolean().optional(),
  noMembershipContribution: z.boolean().optional(),
  forwardedToOtherEntity: z.boolean().optional(),
  forwardedRecipient: z.string().optional(),
  forwardedTaxOffice: z.string().optional(),
  forwardedTaxNumber: z.string().optional(),
  forwardedExemptionNoticeDate: z.string().optional(),
  forwardedNoticeType: z.enum(['FREISTELLUNGSBESCHEID', 'FESTSTELLUNGSBESCHEID']).optional(),
  orgName: z.string(),
  orgAddress: z.string(),
  cashier: z.string().optional(),
  orgLogoDataUrl: z.string().optional(),
  taxOffice: z.string().optional(),
  taxNumber: z.string().optional(),
  exemptionNoticeDate: z.string().optional()
})
export const DonationsExportMoneyReceiptOutput = z.object({ filePath: z.string() })
export type TDonationsExportMoneyReceiptInput = z.infer<typeof DonationsExportMoneyReceiptInput>
export type TDonationsExportMoneyReceiptOutput = z.infer<typeof DonationsExportMoneyReceiptOutput>

// Audit: recent actions
export const AuditRecentInput = z
  .object({ limit: z.number().min(1).max(100).default(20) })
  .optional()
export const AuditRecentOutput = z.object({
  rows: z.array(
    z.object({
      id: z.number(),
      userId: z.number().nullable().optional(),
      entity: z.string(),
      entityId: z.number(),
      action: z.string(),
      createdAt: z.string(),
      recordDate: z.string().nullable().optional(),
      voucherId: z.number().nullable().optional(),
      voucherNo: z.string().nullable().optional(),
      voucherDescription: z.string().nullable().optional(),
      bankBookingDate: z.string().nullable().optional(),
      bankAmount: z.number().nullable().optional(),
      bankDirection: z.string().nullable().optional(),
      bankCounterparty: z.string().nullable().optional(),
      bankPurpose: z.string().nullable().optional(),
      bankPaymentAccountName: z.string().nullable().optional(),
      diff: z.any().nullable().optional()
    })
  )
})
export type TAuditRecentInput = z.infer<typeof AuditRecentInput>
export type TAuditRecentOutput = z.infer<typeof AuditRecentOutput>

// Smart restore (compare current vs default DB)
export const DbSmartRestorePreviewOutput = z.object({
  current: z.object({
    root: z.string(),
    dbPath: z.string(),
    exists: z.boolean(),
    mtime: z.number().nullable().optional(),
    counts: z.record(z.number()).optional(),
    last: z
      .object({
        voucher: z.string().nullable().optional(),
        invoice: z.string().nullable().optional(),
        member: z.string().nullable().optional(),
        audit: z.string().nullable().optional()
      })
      .optional()
  }),
  default: z.object({
    root: z.string(),
    dbPath: z.string(),
    exists: z.boolean(),
    mtime: z.number().nullable().optional(),
    counts: z.record(z.number()).optional(),
    last: z
      .object({
        voucher: z.string().nullable().optional(),
        invoice: z.string().nullable().optional(),
        member: z.string().nullable().optional(),
        audit: z.string().nullable().optional()
      })
      .optional()
  }),
  recommendation: z.enum(['useDefault', 'migrateToDefault', 'manual']).optional()
})
export type TDbSmartRestorePreviewOutput = z.infer<typeof DbSmartRestorePreviewOutput>

export const DbSmartRestoreApplyInput = z.object({
  action: z.enum(['useDefault', 'migrateToDefault'])
})
export const DbSmartRestoreApplyOutput = z.object({ ok: z.boolean() })
export type TDbSmartRestoreApplyInput = z.infer<typeof DbSmartRestoreApplyInput>
export type TDbSmartRestoreApplyOutput = z.infer<typeof DbSmartRestoreApplyOutput>

// Submissions (voucher submissions from members for review)
export const SubmissionsListInput = z
  .object({
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    limit: z.number().min(1).max(200).default(100).optional(),
    offset: z.number().min(0).default(0).optional()
  })
  .optional()

const SubmissionSchema = z.object({
  id: z.number(),
  externalId: z.string().nullable().optional(),
  date: z.string(),
  type: z.enum(['IN', 'OUT']),
  sphere: Sphere.nullable().optional(),
  paymentMethod: PaymentMethod.nullable().optional(),
  description: z.string().nullable().optional(),
  grossAmount: z.number(),
  categoryHint: z.string().nullable().optional(),
  counterparty: z.string().nullable().optional(),
  budgetId: z.number().nullable().optional(),
  budgetLabel: z.string().nullable().optional(),
  earmarkId: z.number().nullable().optional(),
  earmarkLabel: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  submittedBy: z.string(),
  submittedAt: z.string(),
  status: z.enum(['pending', 'approved', 'rejected']),
  reviewedAt: z.string().nullable().optional(),
  reviewerNotes: z.string().nullable().optional(),
  voucherId: z.number().nullable().optional(),
  attachments: z.array(
    z.object({
      id: z.number(),
      filename: z.string(),
      mimeType: z.string().nullable().optional()
    })
  )
})

export const SubmissionsListOutput = z.object({
  rows: z.array(SubmissionSchema),
  total: z.number()
})

export const SubmissionGetInput = z.object({ id: z.number() })
export const SubmissionGetOutput = SubmissionSchema.nullable()

export const SubmissionsImportInput = z.object({
  submissions: z.array(
    z.object({
      externalId: z.string().optional(),
      date: z.string(),
      type: z.enum(['IN', 'OUT']).optional(),
      sphere: Sphere.optional(),
      paymentMethod: PaymentMethod.optional(),
      description: z.string().optional(),
      grossAmount: z.number(),
      categoryHint: z.string().optional(),
      counterparty: z.string().optional(),
      budgetId: z.number().nullable().optional(),
      budgetLabel: z.string().nullable().optional(),
      earmarkId: z.number().nullable().optional(),
      earmarkLabel: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
      submittedBy: z.string(),
      attachments: z
        .array(
          z.object({
            filename: z.string(),
            mimeType: z.string().optional(),
            data: z.string() // Base64
          })
        )
        .optional()
    })
  )
})
export const SubmissionsImportOutput = z.object({
  imported: z.number(),
  ids: z.array(z.number())
})

export const SubmissionApproveInput = z.object({
  id: z.number(),
  reviewerNotes: z.string().optional(),
  voucherId: z.number().optional()
})
export const SubmissionApproveOutput = z.object({ ok: z.boolean() })

export const SubmissionRejectInput = z.object({
  id: z.number(),
  reviewerNotes: z.string().optional()
})
export const SubmissionRejectOutput = z.object({ ok: z.boolean() })

export const SubmissionDeleteInput = z.object({ id: z.number() })
export const SubmissionDeleteOutput = z.object({ ok: z.boolean() })

export const SubmissionConvertInput = z.object({
  id: z.number(),
  sphere: Sphere,
  paymentMethod: PaymentMethod.optional(),
  categoryId: z.number().optional(),
  earmarkId: z.number().optional(),
  budgetId: z.number().optional()
})
export const SubmissionConvertOutput = z.object({
  ok: z.boolean(),
  voucherId: z.number().optional()
})

export const SubmissionsSummaryOutput = z.object({
  pending: z.number(),
  approved: z.number(),
  rejected: z.number(),
  total: z.number()
})

export const SubmissionAttachmentReadInput = z.object({ attachmentId: z.number() })
export const SubmissionAttachmentReadOutput = z.object({
  filename: z.string(),
  mimeType: z.string().nullable().optional(),
  dataBase64: z.string()
})

export const SubmissionsExportCatalogOutput = z.object({
  filePath: z.string()
})

export type TSubmissionsListInput = z.infer<typeof SubmissionsListInput>
export type TSubmissionsListOutput = z.infer<typeof SubmissionsListOutput>
export type TSubmissionGetInput = z.infer<typeof SubmissionGetInput>
export type TSubmissionGetOutput = z.infer<typeof SubmissionGetOutput>
export type TSubmissionsImportInput = z.infer<typeof SubmissionsImportInput>
export type TSubmissionsImportOutput = z.infer<typeof SubmissionsImportOutput>
export type TSubmissionApproveInput = z.infer<typeof SubmissionApproveInput>
export type TSubmissionApproveOutput = z.infer<typeof SubmissionApproveOutput>
export type TSubmissionRejectInput = z.infer<typeof SubmissionRejectInput>
export type TSubmissionRejectOutput = z.infer<typeof SubmissionRejectOutput>
export type TSubmissionDeleteInput = z.infer<typeof SubmissionDeleteInput>
export type TSubmissionDeleteOutput = z.infer<typeof SubmissionDeleteOutput>
export type TSubmissionConvertInput = z.infer<typeof SubmissionConvertInput>
export type TSubmissionConvertOutput = z.infer<typeof SubmissionConvertOutput>
export type TSubmissionsSummaryOutput = z.infer<typeof SubmissionsSummaryOutput>
export type TSubmissionAttachmentReadInput = z.infer<typeof SubmissionAttachmentReadInput>
export type TSubmissionAttachmentReadOutput = z.infer<typeof SubmissionAttachmentReadOutput>
export type TSubmissionsExportCatalogOutput = z.infer<typeof SubmissionsExportCatalogOutput>
