import { z } from 'zod'
import { PaymentAccountKind, PaymentMethod, Sphere, VoucherType } from './primitives'

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
  primaryClassificationValueId: z.number().int().positive().optional(),
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
  byPrimaryClassification: z.array(z.object({
    key: z.string(),
    color: z.string().nullable(),
    net: z.number(),
    vat: z.number(),
    gross: z.number()
  })),
  classificationProfile: z.enum(['NONPROFIT', 'GENERAL']),
  primaryClassificationLabel: z.string(),
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
